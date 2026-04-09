import React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import { logger } from '../../../../utils';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from '../../utils/marker-lod';
import type { SearchScoreMode } from '../../../../store/searchStore';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';
import type { SearchResultsPanelCardMetricsRuntime } from './search-results-panel-card-runtime-contract';

type UseSearchResultsPanelCardMetricsRuntimeArgs = {
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  resolvedResults: SearchResultsPayload;
  scoreMode: SearchScoreMode;
};

export const useSearchResultsPanelCardMetricsRuntime = ({
  dishes,
  restaurants,
  resolvedResults,
  scoreMode,
}: UseSearchResultsPanelCardMetricsRuntimeArgs): SearchResultsPanelCardMetricsRuntime => {
  const searchRequestId = resolvedResults?.metadata?.searchRequestId ?? null;
  const missingRestaurantRankByIdRef = React.useRef<Set<string>>(new Set());

  const canonicalRestaurantRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    restaurants.forEach((restaurant) => {
      if (
        typeof restaurant.rank === 'number' &&
        Number.isFinite(restaurant.rank) &&
        restaurant.rank >= 1
      ) {
        map.set(restaurant.restaurantId, restaurant.rank);
        return;
      }
      if (!missingRestaurantRankByIdRef.current.has(restaurant.restaurantId)) {
        missingRestaurantRankByIdRef.current.add(restaurant.restaurantId);
        logger.error('Restaurant missing canonical rank in search results', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
          searchRequestId,
        });
      }
    });
    return map;
  }, [restaurants, searchRequestId]);

  const restaurantsById = React.useMemo(() => {
    const map = new Map<string, RestaurantResult>();

    restaurants.forEach((restaurant) => {
      const locationList: Array<{ latitude?: number | null; longitude?: number | null }> =
        Array.isArray(restaurant.locations) ? restaurant.locations : [];
      const displayLocation =
        restaurant.displayLocation ??
        locationList.find(
          (loc) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
        );
      if (
        !displayLocation ||
        typeof displayLocation.latitude !== 'number' ||
        typeof displayLocation.longitude !== 'number'
      ) {
        logger.error('Restaurant missing coordinates', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
        });
        return;
      }
      map.set(restaurant.restaurantId, restaurant);
    });

    dishes.forEach((dish) => {
      if (
        !map.has(dish.restaurantId) &&
        (typeof dish.restaurantLatitude !== 'number' ||
          typeof dish.restaurantLongitude !== 'number')
      ) {
        logger.warn('Dish lacks restaurant coordinates', {
          dishId: dish.connectionId,
          restaurantId: dish.restaurantId,
          restaurantName: dish.restaurantName,
        });
      }
    });

    return map;
  }, [dishes, restaurants]);

  const primaryCoverageKey = resolvedResults?.metadata?.coverageKey ?? null;
  const hasCrossCoverage = React.useMemo(() => {
    const coverageKeys = new Set<string>();
    dishes.forEach((dish) => {
      if (dish.coverageKey) {
        coverageKeys.add(dish.coverageKey);
      }
    });
    restaurants.forEach((restaurant) => {
      if (restaurant.coverageKey) {
        coverageKeys.add(restaurant.coverageKey);
      }
    });
    return coverageKeys.size > 1;
  }, [dishes, restaurants]);

  const primaryFoodTerm = React.useMemo(() => {
    const term = resolvedResults?.metadata?.primaryFoodTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    return null;
  }, [resolvedResults?.metadata?.primaryFoodTerm]);

  const restaurantQualityColorById = React.useMemo(() => {
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.restaurantId, getMarkerColorForRestaurant(restaurant, scoreMode));
    });
    return map;
  }, [restaurants, scoreMode]);

  const dishQualityColorByConnectionId = React.useMemo(() => {
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getMarkerColorForDish(dish, scoreMode));
    });
    return map;
  }, [dishes, scoreMode]);

  return React.useMemo(
    () => ({
      canonicalRestaurantRankById,
      restaurantsById,
      primaryCoverageKey,
      hasCrossCoverage,
      primaryFoodTerm,
      restaurantQualityColorById,
      dishQualityColorByConnectionId,
    }),
    [
      canonicalRestaurantRankById,
      restaurantsById,
      primaryCoverageKey,
      hasCrossCoverage,
      primaryFoodTerm,
      restaurantQualityColorById,
      dishQualityColorByConnectionId,
    ]
  );
};
