import React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import { DishResultCard, RestaurantResultCard } from '../../../../components/cards/ResultCard';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from '../../utils/marker-lod';
import {
  getSearchMountedResultsDataSnapshot,
  getSearchMountedResultsRowsSnapshot,
} from './search-mounted-results-data-store';
import type { SearchResultsPanelEnvironment } from './search-results-panel-environment-contract';
import type { useSearchResultsPanelCardMarketRuntime } from './use-search-results-panel-card-market-runtime';
import type { useSearchResultsPanelDishCardMetricsRuntime } from './use-search-results-panel-dish-card-metrics-runtime';
import type { useSearchResultsPanelRestaurantCardMetricsRuntime } from './use-search-results-panel-restaurant-card-metrics-runtime';

type UseSearchResultsPanelCardRenderRuntimeArgs = Pick<
  SearchResultsPanelEnvironment,
  | 'getDishSaveHandler'
  | 'getRestaurantSaveHandler'
  | 'stableOpenRestaurantProfileFromResults'
  | 'openScoreInfo'
> & {
  cardMarketRuntime: ReturnType<typeof useSearchResultsPanelCardMarketRuntime>;
  dishCardMetricsRuntime: ReturnType<typeof useSearchResultsPanelDishCardMetricsRuntime>;
  restaurantCardMetricsRuntime: ReturnType<
    typeof useSearchResultsPanelRestaurantCardMetricsRuntime
  >;
};

export type SearchResultsPanelCardRenderRuntime = {
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (
    restaurant: RestaurantResult,
    index: number,
    preparedDescriptor?: RestaurantResultCardDescriptor | null
  ) => React.ReactNode;
};

type MountedResultsCardMetricsSnapshot = {
  requestKey: string | null;
  restaurantsById: Map<string, RestaurantResult>;
  canonicalRestaurantRankById: Map<string, number>;
  restaurantQualityColorById: Map<string, string>;
  dishQualityColorByConnectionId: Map<string, string>;
};

const EMPTY_MOUNTED_RESULTS_CARD_METRICS: MountedResultsCardMetricsSnapshot = {
  requestKey: null,
  restaurantsById: new Map(),
  canonicalRestaurantRankById: new Map(),
  restaurantQualityColorById: new Map(),
  dishQualityColorByConnectionId: new Map(),
};

export const useSearchResultsPanelCardRenderRuntime = ({
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
  cardMarketRuntime,
  dishCardMetricsRuntime,
  restaurantCardMetricsRuntime,
}: UseSearchResultsPanelCardRenderRuntimeArgs): SearchResultsPanelCardRenderRuntime => {
  const mountedMetricsRef = React.useRef<MountedResultsCardMetricsSnapshot>(
    EMPTY_MOUNTED_RESULTS_CARD_METRICS
  );
  const getMountedMetrics = React.useCallback(() => {
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    if (mountedMetricsRef.current.requestKey === mountedResultsSnapshot.resultsRequestKey) {
      return mountedMetricsRef.current;
    }
    const nextMetrics: MountedResultsCardMetricsSnapshot = {
      requestKey: mountedResultsSnapshot.resultsRequestKey,
      restaurantsById: new Map(),
      canonicalRestaurantRankById: new Map(),
      restaurantQualityColorById: new Map(),
      dishQualityColorByConnectionId: new Map(),
    };
    mountedResultsSnapshot.results?.restaurants?.forEach((restaurant) => {
      nextMetrics.restaurantsById.set(restaurant.restaurantId, restaurant);
      if (typeof restaurant.rank === 'number' && Number.isFinite(restaurant.rank)) {
        nextMetrics.canonicalRestaurantRankById.set(restaurant.restaurantId, restaurant.rank);
      }
      nextMetrics.restaurantQualityColorById.set(
        restaurant.restaurantId,
        getMarkerColorForRestaurant(restaurant)
      );
    });
    mountedResultsSnapshot.results?.dishes?.forEach((dish) => {
      nextMetrics.dishQualityColorByConnectionId.set(
        dish.connectionId,
        getMarkerColorForDish(dish)
      );
    });
    mountedMetricsRef.current = nextMetrics;
    return nextMetrics;
  }, []);
  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const mountedMetrics = getMountedMetrics();
      const restaurantForDish =
        restaurantCardMetricsRuntime.restaurantsById.get(item.restaurantId) ??
        mountedMetrics.restaurantsById.get(item.restaurantId);
      const qualityColor =
        dishCardMetricsRuntime.dishQualityColorByConnectionId.get(item.connectionId) ??
        mountedMetrics.dishQualityColorByConnectionId.get(item.connectionId) ??
        getMarkerColorForDish(item);
      const mountedResultsMetadata = getSearchMountedResultsDataSnapshot().results?.metadata;
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={false}
          primaryMarketKey={cardMarketRuntime.primaryMarketKey ?? mountedResultsMetadata?.marketKey}
          showMarketLabel={false}
          restaurantForDish={restaurantForDish}
          onSavePress={getDishSaveHandler(item.connectionId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
        />
      );
    },
    [
      cardMarketRuntime.primaryMarketKey,
      dishCardMetricsRuntime.dishQualityColorByConnectionId,
      getDishSaveHandler,
      getMountedMetrics,
      openScoreInfo,
      restaurantCardMetricsRuntime.restaurantsById,
      stableOpenRestaurantProfileFromResults,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (
      restaurant: RestaurantResult,
      index: number,
      rowPreparedDescriptor?: RestaurantResultCardDescriptor | null
    ) => {
      const preparedDescriptor =
        rowPreparedDescriptor ??
        getSearchMountedResultsRowsSnapshot().restaurantCardDescriptorsById.get(
          restaurant.restaurantId
        );
      let rank =
        preparedDescriptor?.rank ??
        restaurantCardMetricsRuntime.canonicalRestaurantRankById.get(restaurant.restaurantId);
      if (typeof rank !== 'number') {
        rank = getMountedMetrics().canonicalRestaurantRankById.get(restaurant.restaurantId);
      }
      if (typeof rank !== 'number') {
        return null;
      }
      const qualityColor =
        preparedDescriptor?.qualityColor ??
        restaurantCardMetricsRuntime.restaurantQualityColorById.get(restaurant.restaurantId) ??
        getMountedMetrics().restaurantQualityColorById.get(restaurant.restaurantId) ??
        getMarkerColorForRestaurant(restaurant);
      const mountedResultsMetadata =
        preparedDescriptor == null ? getSearchMountedResultsDataSnapshot().results?.metadata : null;
      const primaryMarketKey =
        cardMarketRuntime.primaryMarketKey ??
        (preparedDescriptor != null ? null : mountedResultsMetadata?.marketKey);
      const primaryFoodTerm =
        cardMarketRuntime.primaryFoodTerm ??
        preparedDescriptor?.primaryFoodTerm ??
        mountedResultsMetadata?.primaryFoodTerm ??
        null;
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          rank={rank}
          qualityColor={qualityColor}
          preparedDescriptor={preparedDescriptor}
          isLiked={false}
          primaryMarketKey={primaryMarketKey}
          showMarketLabel={false}
          onSavePress={getRestaurantSaveHandler(restaurant.restaurantId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={primaryFoodTerm}
        />
      );
    },
    [
      cardMarketRuntime.primaryFoodTerm,
      cardMarketRuntime.primaryMarketKey,
      getRestaurantSaveHandler,
      getMountedMetrics,
      openScoreInfo,
      restaurantCardMetricsRuntime.canonicalRestaurantRankById,
      restaurantCardMetricsRuntime.restaurantQualityColorById,
      stableOpenRestaurantProfileFromResults,
    ]
  );

  return React.useMemo(
    () => ({
      renderDishCard,
      renderRestaurantCard,
    }),
    [renderDishCard, renderRestaurantCard]
  );
};
