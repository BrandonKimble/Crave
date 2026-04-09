import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../../types';
import { getQualityColorFromScore } from '../../utils/quality';
import { buildMarkerCatalogReadModel } from './map-read-model-builder';
import type { MarkerCatalogEntry } from './map-viewport-query';
import {
  pickPreferredRestaurantMapLocation,
  resolveRestaurantLocationSelectionAnchorFromBounds,
  resolveRestaurantMapLocations,
} from './restaurant-location-selection';

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export type MarkerPipelineResult = {
  catalog: MarkerCatalogEntry[];
  primaryCount: number;
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
  resultsKey: string;
};

// ---------------------------------------------------------------------------
// Main pipeline — call from response handler, outside React render path
// ---------------------------------------------------------------------------

export const computeMarkerPipeline = (args: {
  restaurants: RestaurantResult[];
  dishes: FoodResult[];
  activeTab: 'dishes' | 'restaurants';
  scoreMode: 'coverage_display' | 'global_quality';
  restaurantOnlyId: string | null;
  selectedRestaurantId: string | null;
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
  searchRequestId: string;
}): MarkerPipelineResult => {
  const {
    restaurants,
    dishes,
    activeTab,
    scoreMode,
    restaurantOnlyId,
    selectedRestaurantId,
    bounds,
    userLocation,
    searchRequestId,
  } = args;

  // 1. Build canonical rank map
  const canonicalRestaurantRankById = new Map<string, number>();
  restaurants.forEach((restaurant) => {
    if (
      typeof restaurant.rank === 'number' &&
      Number.isFinite(restaurant.rank) &&
      restaurant.rank >= 1
    ) {
      canonicalRestaurantRankById.set(restaurant.restaurantId, restaurant.rank);
    }
  });

  // 2. Build restaurants-by-id lookup
  const restaurantsById = new Map<string, RestaurantResult>();
  restaurants.forEach((restaurant) => {
    const locationList: Array<{ latitude?: number | null; longitude?: number | null }> =
      Array.isArray(restaurant.locations) ? restaurant.locations : [];
    const displayLocation =
      restaurant.displayLocation ??
      locationList.find(
        (loc) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      );
    if (
      displayLocation &&
      typeof displayLocation.latitude === 'number' &&
      typeof displayLocation.longitude === 'number'
    ) {
      restaurantsById.set(restaurant.restaurantId, restaurant);
    }
  });

  // 3. Resolve location anchor
  const locationSelectionAnchor = resolveRestaurantLocationSelectionAnchorFromBounds({
    bounds,
    userLocation,
  });

  // 4. Build marker catalog
  const { catalog, primaryCount } = buildMarkerCatalogReadModel({
    activeTab,
    dishes,
    markerRestaurants: restaurants,
    scoreMode,
    restaurantOnlyId,
    selectedRestaurantId,
    canonicalRestaurantRankById,
    locationSelectionAnchor,
    resolveRestaurantMapLocations,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
  });

  return {
    catalog,
    primaryCount,
    canonicalRestaurantRankById,
    restaurantsById,
    resultsKey: searchRequestId,
  };
};
