import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { FoodResult, RestaurantResult } from '../../../../types';
import { logger } from '../../../../utils';
import { getMarkerColorForRestaurant } from '../../utils/marker-lod';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

export const useSearchResultsPanelRestaurantCardMetricsRuntime = ({
  dishes,
  restaurants,
  searchRequestId,
}: {
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  searchRequestId: string | null;
}) => {
  const scenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const missingRestaurantRankByIdRef = React.useRef<Set<string>>(new Set());

  const canonicalRestaurantRankById = React.useMemo(() => {
    const startedAtMs = getNowMs();
    const map = new Map<string, number>();
    restaurants.forEach((restaurant) => {
      if (
        typeof restaurant.rank === 'number' &&
        Number.isFinite(restaurant.rank) &&
        restaurant.rank >= 1
      ) {
        map.set(restaurant.placeId, restaurant.rank);
        return;
      }
      if (!missingRestaurantRankByIdRef.current.has(restaurant.placeId)) {
        missingRestaurantRankByIdRef.current.add(restaurant.placeId);
        logger.error('Restaurant missing canonical rank in search results', {
          placeId: restaurant.placeId,
          placeName: restaurant.placeName,
          searchRequestId,
        });
      }
    });
    const durationMs = getNowMs() - startedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_restaurant_rank_metrics',
        durationMs: Number(durationMs.toFixed(3)),
        restaurantsCount: restaurants.length,
        searchRequestId,
      });
    }
    return map;
  }, [restaurants, scenarioConfig, searchRequestId]);

  const restaurantsById = React.useMemo(() => {
    const startedAtMs = getNowMs();
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
          placeId: restaurant.placeId,
          placeName: restaurant.placeName,
        });
        return;
      }
      map.set(restaurant.placeId, restaurant);
    });

    dishes.forEach((dish) => {
      if (
        !map.has(dish.placeId) &&
        (typeof dish.placeLatitude !== 'number' || typeof dish.placeLongitude !== 'number')
      ) {
        logger.warn('Dish lacks restaurant coordinates', {
          dishId: dish.connectionId,
          placeId: dish.placeId,
          placeName: dish.placeName,
        });
      }
    });

    const durationMs = getNowMs() - startedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_restaurants_by_id_metrics',
        durationMs: Number(durationMs.toFixed(3)),
        restaurantsCount: restaurants.length,
        dishesCount: dishes.length,
        searchRequestId,
      });
    }
    return map;
  }, [dishes, restaurants, scenarioConfig, searchRequestId]);

  const restaurantQualityColorById = React.useMemo(() => {
    const startedAtMs = getNowMs();
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.placeId, getMarkerColorForRestaurant(restaurant));
    });
    const durationMs = getNowMs() - startedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_restaurant_color_metrics',
        durationMs: Number(durationMs.toFixed(3)),
        restaurantsCount: restaurants.length,
        searchRequestId,
      });
    }
    return map;
  }, [restaurants, scenarioConfig, searchRequestId]);

  return React.useMemo(
    () => ({
      canonicalRestaurantRankById,
      restaurantsById,
      restaurantQualityColorById,
    }),
    [canonicalRestaurantRankById, restaurantsById, restaurantQualityColorById]
  );
};
