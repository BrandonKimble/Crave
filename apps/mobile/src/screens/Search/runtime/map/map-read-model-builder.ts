import type { Feature, Point } from 'geojson';

import type { Coordinate, FoodResult, RestaurantResult } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { MarkerCatalogEntry } from './map-viewport-query';
import type { ResolvedRestaurantMapLocation } from './restaurant-location-selection';

type BuildMarkerCatalogArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  markerRestaurants: RestaurantResult[];
  restaurantOnlyId: string | null;
  selectedRestaurantId: string | null;
  canonicalRestaurantRankById: Map<string, number>;
  locationSelectionAnchor: Coordinate | null;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  getCraveScoreColorFromScore: (score: number | null | undefined) => string;
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
    restaurantOnlyId,
    selectedRestaurantId,
    canonicalRestaurantRankById,
    locationSelectionAnchor,
    resolveRestaurantMapLocations,
    pickPreferredRestaurantMapLocation,
    getCraveScoreColorFromScore,
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
      const craveScore = dish.craveScore;
      const pinColor = getCraveScoreColorFromScore(craveScore);
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
          craveScore,
          scoreDelta7d: dish.scoreDelta7d ?? null,
          rank,
          pinColor,
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

      const craveScore = restaurant.craveScore;
      const pinColor = getCraveScoreColorFromScore(craveScore);
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
            craveScore,
            scoreDelta7d: restaurant.scoreDelta7d ?? null,
            rank,
            pinColor,
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
