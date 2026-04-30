import React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import DishResultCard from '../../components/dish-result-card';
import RestaurantResultCard from '../../components/restaurant-result-card';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from '../../utils/marker-lod';
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
  dishCardMetricsRuntime: ReturnType<
    typeof useSearchResultsPanelDishCardMetricsRuntime
  >;
  restaurantCardMetricsRuntime: ReturnType<
    typeof useSearchResultsPanelRestaurantCardMetricsRuntime
  >;
};

export type SearchResultsPanelCardRenderRuntime = {
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (restaurant: RestaurantResult, index: number) => React.ReactNode;
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
  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish =
        restaurantCardMetricsRuntime.restaurantsById.get(item.restaurantId);
      const qualityColor =
        dishCardMetricsRuntime.dishQualityColorByConnectionId.get(item.connectionId) ??
        getMarkerColorForDish(item);
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={false}
          primaryMarketKey={cardMarketRuntime.primaryMarketKey}
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
      openScoreInfo,
      restaurantCardMetricsRuntime.restaurantsById,
      stableOpenRestaurantProfileFromResults,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const rank =
        restaurantCardMetricsRuntime.canonicalRestaurantRankById.get(
          restaurant.restaurantId
        );
      if (typeof rank !== 'number') {
        return null;
      }
      const qualityColor =
        restaurantCardMetricsRuntime.restaurantQualityColorById.get(
          restaurant.restaurantId
        ) ??
        getMarkerColorForRestaurant(restaurant);
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          rank={rank}
          qualityColor={qualityColor}
          isLiked={false}
          primaryMarketKey={cardMarketRuntime.primaryMarketKey}
          showMarketLabel={false}
          onSavePress={getRestaurantSaveHandler(restaurant.restaurantId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={cardMarketRuntime.primaryFoodTerm}
        />
      );
    },
    [
      cardMarketRuntime.primaryFoodTerm,
      cardMarketRuntime.primaryMarketKey,
      getRestaurantSaveHandler,
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
