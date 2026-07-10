import type { Feature, Point } from 'geojson';

import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { MarkerCatalogEntry } from './map-viewport-query';
import { isCoordinateWithinBounds } from './map-viewport-query';
import type { ResolvedRestaurantMapLocation } from './restaurant-location-selection';

type BuildMarkerCatalogArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  markerRestaurants: RestaurantResult[];
  restaurantOnlyId: string | null;
  selectedRestaurantId: string | null;
  canonicalRestaurantRankById: Map<string, number>;
  locationSelectionAnchor: Coordinate | null;
  /** The SEARCHED bounds (committed viewport). Siblings inside them join the catalog as
   *  group members (the native group budget demotes them to dots); siblings outside stay
   *  INVISIBLE-RESIDENT — no catalog entry, data resident on the restaurant/group. */
  searchedBounds: MapBounds | null;
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
  // L1: within a group (equal rank) the representative sorts FIRST — the native group
  // budget promotes the first on-screen member, and the slot belongs to the representative.
  const representativeDiff =
    Number(right.isGroupRepresentative === true) - Number(left.isGroupRepresentative === true);
  if (representativeDiff !== 0) {
    return representativeDiff;
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
    searchedBounds,
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
          craveScoreExact: dish.craveScoreExact ?? null,
          rising: dish.rising ?? null,
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
      const canonicalRank = canonicalRestaurantRankById.get(restaurant.restaurantId);
      // The marker catalog drops any restaurant without a numeric rank (rank is a search-ranking
      // concept). A committed restaurant/entity reveal (poll comment-span / restaurant deep link)
      // returns a SINGLE rankless restaurant — so its only pin would be dropped here and the map
      // would render no pin at the reveal frame (the "pin pops in only on refresh" bug). When this
      // restaurant IS the explicitly-revealed target (selectedRestaurantId / restaurantOnlyId),
      // fall back to rank 1 so the reveal always yields a pin — mirroring the seeded-marker path
      // (publishHydratedRestaurantMarkerSource gives a rankless hydrated restaurant rank 1). Ranked
      // search results are unaffected: they always carry a canonical rank, so the fallback is inert
      // for the result-card path.
      const isRevealedRestaurant =
        (selectedRestaurantId !== null && restaurant.restaurantId === selectedRestaurantId) ||
        (restaurantOnlyId !== null && restaurant.restaurantId === restaurantOnlyId);
      const rank =
        typeof canonicalRank === 'number' ? canonicalRank : isRevealedRestaurant ? 1 : undefined;
      if (typeof rank !== 'number') {
        return;
      }

      const craveScore = restaurant.craveScore;
      const pinColor = getCraveScoreColorFromScore(craveScore);
      const locations = resolveRestaurantMapLocations(restaurant);
      const shouldRenderAllLocations =
        selectedRestaurantId !== null && restaurant.restaurantId === selectedRestaurantId;
      const representativeLocation = shouldRenderAllLocations
        ? null
        : pickPreferredRestaurantMapLocation(restaurant, locationSelectionAnchor);
      // L1 (§3.1 search policy): the representative competes for the group's budget slot;
      // siblings INSIDE the searched bounds join as group members (demoted to dots by the
      // native group budget); siblings outside stay invisible-resident (no entry — their
      // data lives on the restaurant for the selection overlay to promote later).
      const inBoundsSiblings =
        shouldRenderAllLocations || representativeLocation == null || searchedBounds == null
          ? []
          : locations.filter(
              (location) =>
                location.locationId !== representativeLocation.locationId &&
                isCoordinateWithinBounds(
                  { lat: location.latitude, lng: location.longitude },
                  searchedBounds
                )
            );
      const locationsToRender = shouldRenderAllLocations
        ? locations
        : representativeLocation
          ? [representativeLocation, ...inBoundsSiblings]
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
            craveScoreExact: restaurant.craveScoreExact ?? null,
            rising: restaurant.rising ?? null,
            rank,
            pinColor,
          },
        };
        entries.push({
          feature,
          rank,
          locationIndex: location.locationIndex,
          ...(representativeLocation != null &&
          location.locationId === representativeLocation.locationId
            ? { isGroupRepresentative: true }
            : null),
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
