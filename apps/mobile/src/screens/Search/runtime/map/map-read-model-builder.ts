import type { Feature, FeatureCollection, Point } from 'geojson';

import type { Coordinate, FoodResult, RestaurantResult } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { MarkerCatalogEntry } from './map-viewport-query';
import type { ResolvedRestaurantMapLocation } from './restaurant-location-selection';

type BuildMarkerCatalogArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  markerRestaurants: RestaurantResult[];
  scoreMode: 'coverage_display' | 'global_quality';
  restaurantOnlyId: string | null;
  selectedRestaurantId: string | null;
  canonicalRestaurantRankById: Map<string, number>;
  locationSelectionAnchor: Coordinate | null;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getQualityColorFromScore: (score: number | null | undefined) => string;
};

const orderByEntry = (left: MarkerCatalogEntry, right: MarkerCatalogEntry): number => {
  const rankDiff = left.rank - right.rank;
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const locationDiff = left.locationIndex - right.locationIndex;
  if (locationDiff !== 0) {
    return locationDiff;
  }
  const leftId = left.feature.id?.toString() ?? '';
  const rightId = right.feature.id?.toString() ?? '';
  return leftId.localeCompare(rightId);
};

export const buildMarkerCatalogReadModel = (
  args: BuildMarkerCatalogArgs
): { catalog: MarkerCatalogEntry[]; primaryCount: number } => {
  const {
    activeTab,
    dishes,
    markerRestaurants,
    scoreMode,
    restaurantOnlyId,
    selectedRestaurantId,
    canonicalRestaurantRankById,
    locationSelectionAnchor,
    resolveRestaurantMapLocations,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
  } = args;

  const entries: MarkerCatalogEntry[] = [];
  let primaryCount = 0;

  if (activeTab === 'dishes') {
    const dishesByLocation = new Map<string, { dish: FoodResult; rank: number }>();

    dishes.forEach((dish, dishIndex) => {
      if (restaurantOnlyId && dish.restaurantId !== restaurantOnlyId) {
        return;
      }
      if (
        typeof dish.restaurantLatitude !== 'number' ||
        typeof dish.restaurantLongitude !== 'number'
      ) {
        return;
      }

      const locationKey = `${dish.restaurantId}-${dish.restaurantLatitude.toFixed(
        6
      )}-${dish.restaurantLongitude.toFixed(6)}`;
      const rank = dishIndex + 1;
      if (!dishesByLocation.has(locationKey)) {
        dishesByLocation.set(locationKey, { dish, rank });
      }
    });

    dishesByLocation.forEach(({ dish, rank }) => {
      const pinColorGlobal = getQualityColorFromScore(dish.qualityScore);
      const pinColorLocal = getQualityColorFromScore(dish.displayScore);
      const pinColor = scoreMode === 'coverage_display' ? pinColorLocal : pinColorGlobal;
      const contextualScore =
        scoreMode === 'coverage_display'
          ? typeof dish.displayScore === 'number' && Number.isFinite(dish.displayScore)
            ? dish.displayScore
            : 0
          : dish.qualityScore;
      const featureId = `dish-${dish.connectionId}`;
      const feature: Feature<Point, RestaurantFeatureProperties> = {
        type: 'Feature',
        id: featureId,
        geometry: {
          type: 'Point',
          coordinates: [dish.restaurantLongitude as number, dish.restaurantLatitude as number],
        },
        properties: {
          restaurantId: dish.restaurantId,
          restaurantName: dish.restaurantName,
          contextualScore,
          rank,
          pinColor,
          pinColorGlobal,
          pinColorLocal,
          isDishPin: true,
          dishName: dish.foodName,
          connectionId: dish.connectionId,
        },
      };
      entries.push({
        feature,
        rank,
        locationIndex: 0,
      });
      primaryCount += 1;
    });
  } else {
    markerRestaurants.forEach((restaurant) => {
      if (restaurantOnlyId && restaurant.restaurantId !== restaurantOnlyId) {
        return;
      }
      const rank = canonicalRestaurantRankById.get(restaurant.restaurantId);
      if (typeof rank !== 'number') {
        return;
      }

      const pinColorGlobal = getQualityColorFromScore(restaurant.restaurantQualityScore);
      const pinColorLocal = getQualityColorFromScore(restaurant.displayScore);
      const pinColor = scoreMode === 'coverage_display' ? pinColorLocal : pinColorGlobal;
      const locations = resolveRestaurantMapLocations(restaurant);
      const shouldRenderAllLocations =
        selectedRestaurantId !== null && restaurant.restaurantId === selectedRestaurantId;
      const closestLocation = shouldRenderAllLocations
        ? null
        : pickPreferredRestaurantMapLocation(restaurant, locationSelectionAnchor);
      const locationsToRender = shouldRenderAllLocations
        ? locations
        : closestLocation
        ? [closestLocation]
        : [];

      locationsToRender.forEach((location) => {
        const featureId = `${restaurant.restaurantId}-${location.locationId}`;
        const feature: Feature<Point, RestaurantFeatureProperties> = {
          type: 'Feature',
          id: featureId,
          geometry: {
            type: 'Point',
            coordinates: [location.longitude, location.latitude],
          },
          properties: {
            restaurantId: restaurant.restaurantId,
            restaurantName: restaurant.restaurantName,
            contextualScore: restaurant.contextualScore,
            rank,
            pinColor,
            pinColorGlobal,
            pinColorLocal,
          },
        };
        entries.push({
          feature,
          rank,
          locationIndex: location.locationIndex,
        });
        if (location.isPrimary) {
          primaryCount += 1;
        }
      });
    });
  }

  const catalog = [...entries].sort(orderByEntry);
  return { catalog, primaryCount };
};

type BuildAnchoredShortcutCoverageArgs = {
  collection: FeatureCollection<Point, RestaurantFeatureProperties> | null;
  restaurantsById: Map<string, RestaurantResult>;
  anchor: Coordinate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
};

const projectFeatureToPreferredRestaurantLocation = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  restaurantsById: Map<string, RestaurantResult>,
  anchor: Coordinate | null,
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null
): Feature<Point, RestaurantFeatureProperties> => {
  const restaurant = restaurantsById.get(feature.properties.restaurantId);
  if (!restaurant) {
    return feature;
  }
  const preferredLocation = pickPreferredRestaurantMapLocation(restaurant, anchor);
  if (!preferredLocation) {
    return feature;
  }
  const [lng, lat] = feature.geometry.coordinates;
  if (
    Math.abs(lng - preferredLocation.longitude) < 1e-6 &&
    Math.abs(lat - preferredLocation.latitude) < 1e-6
  ) {
    return feature;
  }
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: [preferredLocation.longitude, preferredLocation.latitude],
    },
  };
};

export const buildAnchoredShortcutCoverage = (
  args: BuildAnchoredShortcutCoverageArgs
): FeatureCollection<Point, RestaurantFeatureProperties> | null => {
  const { collection, restaurantsById, anchor, pickPreferredRestaurantMapLocation } = args;
  const features = collection?.features ?? [];
  if (!features.length) {
    return null;
  }
  let hasCoordinateOverrides = false;
  const projected = features.map((feature) => {
    const projectedFeature = projectFeatureToPreferredRestaurantLocation(
      feature,
      restaurantsById,
      anchor,
      pickPreferredRestaurantMapLocation
    );
    if (projectedFeature !== feature) {
      hasCoordinateOverrides = true;
    }
    return projectedFeature;
  });

  if (!hasCoordinateOverrides) {
    return collection;
  }
  return {
    type: 'FeatureCollection',
    features: projected,
  };
};

export const buildRankedShortcutCoverageFeatures = (
  collection: FeatureCollection<Point, RestaurantFeatureProperties> | null
): Array<Feature<Point, RestaurantFeatureProperties>> => {
  const features = collection?.features ?? [];
  return [...features].sort((left, right) => {
    const leftRank = left.properties.rank ?? 9999;
    const rightRank = right.properties.rank ?? 9999;
    const rankDiff = leftRank - rightRank;
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.properties.restaurantId.localeCompare(right.properties.restaurantId);
  });
};
