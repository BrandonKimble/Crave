import type { Coordinate, MapBounds, RestaurantResult } from '../../../../types';
import { getBoundsCenter, haversineDistanceMiles } from '../../utils/geo';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';

export type ResolvedRestaurantMapLocation = {
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

export const isCoordinateWithinBounds = (coordinate: Coordinate, bounds: MapBounds): boolean => {
  const minLat = Math.min(bounds.southWest.lat, bounds.northEast.lat);
  const maxLat = Math.max(bounds.southWest.lat, bounds.northEast.lat);
  const latWithinRange = coordinate.lat >= minLat && coordinate.lat <= maxLat;
  const minLng = bounds.southWest.lng;
  const maxLng = bounds.northEast.lng;
  const lngWithinRange =
    minLng <= maxLng
      ? coordinate.lng >= minLng && coordinate.lng <= maxLng
      : coordinate.lng >= minLng || coordinate.lng <= maxLng;
  return latWithinRange && lngWithinRange;
};

export const resolveRestaurantLocationSelectionAnchorFromBounds = ({
  bounds,
  userLocation,
}: {
  bounds: MapBounds | null;
  userLocation: Coordinate | null;
}): Coordinate | null => {
  if (!bounds) {
    return null;
  }
  if (userLocation && isCoordinateWithinBounds(userLocation, bounds)) {
    return userLocation;
  }
  return getBoundsCenter(bounds);
};

export const resolveRestaurantLocationSelectionAnchor = ({
  viewportBoundsService,
  userLocation,
  latestUserLocation,
}: {
  viewportBoundsService: ViewportBoundsService;
  userLocation: Coordinate | null;
  latestUserLocation: Coordinate | null;
}): Coordinate | null => {
  const bounds =
    viewportBoundsService.getSearchBaselineBounds() ?? viewportBoundsService.getBounds() ?? null;
  return resolveRestaurantLocationSelectionAnchorFromBounds({
    bounds,
    userLocation: userLocation ?? latestUserLocation,
  });
};

export const resolveRestaurantMapLocations = (
  restaurant: RestaurantResult
): ResolvedRestaurantMapLocation[] => {
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
  const resolved: ResolvedRestaurantMapLocation[] = [];

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

export const pickClosestLocationToCenter = (
  locations: ResolvedRestaurantMapLocation[],
  center: Coordinate | null
): ResolvedRestaurantMapLocation | null => {
  if (!locations.length) {
    return null;
  }
  if (!center) {
    return locations.find((location) => location.isPrimary) ?? null;
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

export const pickPreferredRestaurantMapLocation = (
  restaurant: RestaurantResult,
  anchor: Coordinate | null
): ResolvedRestaurantMapLocation | null => {
  const locations = resolveRestaurantMapLocations(restaurant);
  return pickClosestLocationToCenter(locations, anchor);
};
