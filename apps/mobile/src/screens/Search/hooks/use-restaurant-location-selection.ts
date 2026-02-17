import React from 'react';

import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';
import { getBoundsCenter, haversineDistanceMiles } from '../utils/geo';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';

export type ResolvedRestaurantMapLocation = {
  locationId: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string;
  isPrimary: boolean;
  locationIndex: number;
};

type UseRestaurantLocationSelectionArgs = {
  viewportBoundsService: ViewportBoundsService;
  userLocation: Coordinate | null;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
};

type UseRestaurantLocationSelectionResult = {
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => ResolvedRestaurantMapLocation[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickClosestLocationToCenter: (
    locations: ResolvedRestaurantMapLocation[],
    center: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => ResolvedRestaurantMapLocation | null;
};

export const useRestaurantLocationSelection = ({
  viewportBoundsService,
  userLocation,
  userLocationRef,
}: UseRestaurantLocationSelectionArgs): UseRestaurantLocationSelectionResult => {
  const resolveSearchViewportBounds = React.useCallback(
    (): MapBounds | null =>
      viewportBoundsService.getSearchBaselineBounds() ?? viewportBoundsService.getBounds() ?? null,
    [viewportBoundsService]
  );

  const isCoordinateWithinBounds = React.useCallback(
    (coordinate: Coordinate, bounds: MapBounds): boolean => {
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
    },
    []
  );

  const resolveRestaurantLocationSelectionAnchor = React.useCallback((): Coordinate | null => {
    const bounds = resolveSearchViewportBounds();
    if (!bounds) {
      return null;
    }
    const currentUserLocation = userLocation ?? userLocationRef.current;
    if (currentUserLocation && isCoordinateWithinBounds(currentUserLocation, bounds)) {
      return currentUserLocation;
    }
    return getBoundsCenter(bounds);
  }, [isCoordinateWithinBounds, resolveSearchViewportBounds, userLocation, userLocationRef]);

  const resolveRestaurantMapLocations = React.useCallback((restaurant: RestaurantResult) => {
    const displayLocation = restaurant.displayLocation ?? null;
    const listLocations =
      Array.isArray(restaurant.locations) && restaurant.locations.length > 0
        ? restaurant.locations
        : [];

    const isValidMapLocation = (
      location: {
        latitude?: number | null;
        longitude?: number | null;
        googlePlaceId?: string | null;
      } | null
    ) => {
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
      const dedupeKey = `${Math.round(location.latitude * 1e5)}:${Math.round(
        location.longitude * 1e5
      )}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      const locationId =
        location.locationId ?? `${restaurant.restaurantId}-loc-${options.locationIndex}`;
      resolved.push({
        locationId,
        latitude: location.latitude as number,
        longitude: location.longitude as number,
        googlePlaceId: location.googlePlaceId as string,
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
  }, []);

  const pickClosestLocationToCenter = React.useCallback(
    (
      locations: ResolvedRestaurantMapLocation[],
      center: Coordinate | null
    ): ResolvedRestaurantMapLocation | null => {
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
    },
    []
  );

  const pickPreferredRestaurantMapLocation = React.useCallback(
    (
      restaurant: RestaurantResult,
      anchor: Coordinate | null
    ): ResolvedRestaurantMapLocation | null => {
      const locations = resolveRestaurantMapLocations(restaurant);
      return pickClosestLocationToCenter(locations, anchor) ?? locations[0] ?? null;
    },
    [pickClosestLocationToCenter, resolveRestaurantMapLocations]
  );

  return {
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
  };
};
