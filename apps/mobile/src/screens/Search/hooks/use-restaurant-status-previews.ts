import React from 'react';

import { searchService, type RestaurantStatusPreview } from '../../../services/search';
import type { Coordinate } from '../../../types';
import { logger } from '../../../utils';

type RestaurantStatusLookup = Record<string, RestaurantStatusPreview | null>;

type UseRestaurantStatusPreviewsOptions = {
  enabled?: boolean;
  userLocation?: Coordinate | null;
};

const normalizeLocationKey = (location?: Coordinate | null): string | null => {
  if (!location) {
    return null;
  }
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`;
};

const useRestaurantStatusPreviews = (
  restaurantIds: string[],
  options: UseRestaurantStatusPreviewsOptions = {}
): RestaurantStatusLookup => {
  const [statusById, setStatusById] = React.useState<RestaurantStatusLookup>({});
  const cacheRef = React.useRef(new Map<string, RestaurantStatusPreview | null>());
  const inflightRef = React.useRef(new Set<string>());
  const locationKeyRef = React.useRef<string | null>(null);
  const enabled = options.enabled ?? true;
  const locationKey = React.useMemo(
    () => normalizeLocationKey(options.userLocation ?? null),
    [options.userLocation]
  );

  React.useEffect(() => {
    if (locationKeyRef.current === locationKey) {
      return;
    }
    locationKeyRef.current = locationKey;
    cacheRef.current.clear();
    inflightRef.current.clear();
    setStatusById({});
  }, [locationKey]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    const requestedIds = Array.from(new Set(restaurantIds.filter(Boolean)));
    if (!requestedIds.length) {
      return;
    }
    const missing = requestedIds.filter(
      (id) => !cacheRef.current.has(id) && !inflightRef.current.has(id)
    );
    if (!missing.length) {
      return;
    }

    missing.forEach((id) => inflightRef.current.add(id));
    const requestLocationKey = locationKeyRef.current;

    const run = async () => {
      try {
        const payload: { restaurantIds: string[]; userLocation?: Coordinate } = {
          restaurantIds: missing,
        };
        if (options.userLocation) {
          payload.userLocation = options.userLocation;
        }
        const previews = await searchService.restaurantStatusPreviews(payload);
        if (requestLocationKey !== locationKeyRef.current) {
          return;
        }
        const foundIds = new Set(previews.map((item) => item.restaurantId));
        const nextEntries = new Map<string, RestaurantStatusPreview | null>(cacheRef.current);
        previews.forEach((item) => {
          nextEntries.set(item.restaurantId, item);
        });
        missing.forEach((id) => {
          if (!foundIds.has(id)) {
            nextEntries.set(id, null);
          }
        });
        cacheRef.current = nextEntries;
        setStatusById((prev) => {
          const next = { ...prev };
          previews.forEach((item) => {
            next[item.restaurantId] = item;
          });
          missing.forEach((id) => {
            if (!foundIds.has(id)) {
              next[id] = null;
            }
          });
          return next;
        });
      } catch (error) {
        logger.warn('Unable to load restaurant status previews', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
      } finally {
        missing.forEach((id) => inflightRef.current.delete(id));
      }
    };

    void run();
  }, [enabled, options.userLocation, restaurantIds]);

  return statusById;
};

export default useRestaurantStatusPreviews;
