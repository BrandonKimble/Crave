import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../../types';
import { getBoundsCenter, haversineDistanceMiles } from '../../utils/geo';
import { getQualityColorFromScore } from '../../utils/quality';
import { buildMarkerCatalogReadModel } from './map-read-model-builder';
import type { MarkerCatalogEntry } from './map-viewport-query';

// ---------------------------------------------------------------------------
// Pure location helpers (extracted from use-restaurant-location-selection.ts)
// These are React.useCallback with [] deps — no closures, fully pure.
// ---------------------------------------------------------------------------

type ResolvedMapLocation = {
  locationId: string;
  latitude: number;
  longitude: number;
  isPrimary: boolean;
  locationIndex: number;
};

const isValidMapLocation = (
  location: {
    latitude?: number | null;
    longitude?: number | null;
    googlePlaceId?: string | null;
  } | null
): boolean => {
  if (
    !location ||
    typeof location.latitude !== 'number' ||
    !Number.isFinite(location.latitude) ||
    typeof location.longitude !== 'number' ||
    !Number.isFinite(location.longitude)
  ) {
    return false;
  }
  return typeof location.googlePlaceId === 'string' && location.googlePlaceId.length > 0;
};

const resolveRestaurantMapLocations = (
  restaurant: RestaurantResult
): ResolvedMapLocation[] => {
  const displayLocation = restaurant.displayLocation ?? null;
  const listLocations =
    Array.isArray(restaurant.locations) && restaurant.locations.length > 0
      ? restaurant.locations
      : [];

  const primaryLocation =
    (isValidMapLocation(displayLocation) ? displayLocation : null) ??
    listLocations.find((location) => isValidMapLocation(location)) ??
    null;
  const seen = new Set<string>();
  const resolved: ResolvedMapLocation[] = [];

  const addLocation = (
    location: {
      latitude?: number | null;
      longitude?: number | null;
      locationId?: string | null;
      googlePlaceId?: string | null;
    } | null,
    options: { isPrimary: boolean; locationIndex: number }
  ) => {
    if (!isValidMapLocation(location)) {
      return;
    }
    const dedupeKey = `${Math.round(location!.latitude! * 1e5)}:${Math.round(
      location!.longitude! * 1e5
    )}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    const locationId =
      (location as { locationId?: string | null })?.locationId ??
      `${restaurant.restaurantId}-loc-${options.locationIndex}`;
    resolved.push({
      locationId,
      latitude: location!.latitude as number,
      longitude: location!.longitude as number,
      isPrimary: options.isPrimary,
      locationIndex: options.locationIndex,
    });
  };

  if (primaryLocation) {
    addLocation(primaryLocation, { isPrimary: true, locationIndex: 0 });
  }

  listLocations.forEach((location, index) => {
    addLocation(location, { isPrimary: false, locationIndex: index + 1 });
  });

  return resolved;
};

const pickClosestLocationToCenter = (
  locations: ResolvedMapLocation[],
  center: Coordinate | null
): ResolvedMapLocation | null => {
  if (!locations.length) {
    return null;
  }
  if (!center) {
    return locations.find((location) => location.isPrimary) ?? locations[0] ?? null;
  }

  let best = locations[0];
  let bestDistance = haversineDistanceMiles(center, {
    lat: best.latitude,
    lng: best.longitude,
  });
  for (let i = 1; i < locations.length; i += 1) {
    const candidate = locations[i];
    const candidateDistance = haversineDistanceMiles(center, {
      lat: candidate.latitude,
      lng: candidate.longitude,
    });
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
      continue;
    }
    if (candidateDistance === bestDistance && candidate.isPrimary && !best.isPrimary) {
      best = candidate;
    }
  }
  return best;
};

const pickPreferredRestaurantMapLocation = (
  restaurant: RestaurantResult,
  anchor: Coordinate | null
): ResolvedMapLocation | null => {
  const locations = resolveRestaurantMapLocations(restaurant);
  return pickClosestLocationToCenter(locations, anchor) ?? locations[0] ?? null;
};

const computeLocationAnchor = (
  bounds: MapBounds | null,
  userLocation: Coordinate | null
): Coordinate | null => {
  if (!bounds) {
    return null;
  }
  if (userLocation) {
    const minLat = Math.min(bounds.southWest.lat, bounds.northEast.lat);
    const maxLat = Math.max(bounds.southWest.lat, bounds.northEast.lat);
    const minLng = bounds.southWest.lng;
    const maxLng = bounds.northEast.lng;
    const latOk = userLocation.lat >= minLat && userLocation.lat <= maxLat;
    const lngOk =
      minLng <= maxLng
        ? userLocation.lng >= minLng && userLocation.lng <= maxLng
        : userLocation.lng >= minLng || userLocation.lng <= maxLng;
    if (latOk && lngOk) {
      return userLocation;
    }
  }
  return getBoundsCenter(bounds);
};

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
  const locationSelectionAnchor = computeLocationAnchor(bounds, userLocation);

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
