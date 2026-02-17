import React from 'react';

import { logger } from '../../../utils';
import type { FoodResult, RestaurantResult } from '../../../types';

type UseSearchResultsReadModelArgs = {
  restaurants: RestaurantResult[];
  dishes: FoodResult[];
  searchRequestId: string | null;
  shouldLogSearchComputes: boolean;
  getPerfNow: () => number;
  logSearchCompute: (label: string, duration: number) => void;
};

type UseSearchResultsReadModelResult = {
  canonicalRestaurantRankById: Map<string, number>;
  restaurantsById: Map<string, RestaurantResult>;
};

export const useSearchResultsReadModel = ({
  restaurants,
  dishes,
  searchRequestId,
  shouldLogSearchComputes,
  getPerfNow,
  logSearchCompute,
}: UseSearchResultsReadModelArgs): UseSearchResultsReadModelResult => {
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
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
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

    if (shouldLogSearchComputes) {
      logSearchCompute('restaurantsById', getPerfNow() - start);
    }
    return map;
  }, [dishes, getPerfNow, logSearchCompute, restaurants, shouldLogSearchComputes]);

  return {
    canonicalRestaurantRankById,
    restaurantsById,
  };
};
