import React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import DishResultCard from '../../components/dish-result-card';
import RestaurantResultCard from '../../components/restaurant-result-card';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from '../../utils/marker-lod';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelCardMetricsRuntime } from './search-results-panel-card-runtime-contract';

type UseSearchResultsPanelCardRenderRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  | 'scoreMode'
  | 'getDishSaveHandler'
  | 'getRestaurantSaveHandler'
  | 'stableOpenRestaurantProfileFromResults'
  | 'openScoreInfo'
> & {
  metricsRuntime: SearchResultsPanelCardMetricsRuntime;
};

export type SearchResultsPanelCardRenderRuntime = {
  renderDishCard: (item: FoodResult, index: number) => React.ReactNode;
  renderRestaurantCard: (restaurant: RestaurantResult, index: number) => React.ReactNode;
};

export const useSearchResultsPanelCardRenderRuntime = ({
  scoreMode,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
  metricsRuntime,
}: UseSearchResultsPanelCardRenderRuntimeArgs): SearchResultsPanelCardRenderRuntime => {
  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish = metricsRuntime.restaurantsById.get(item.restaurantId);
      const qualityColor =
        metricsRuntime.dishQualityColorByConnectionId.get(item.connectionId) ??
        getMarkerColorForDish(item, scoreMode);
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={false}
          scoreMode={scoreMode}
          primaryCoverageKey={metricsRuntime.primaryCoverageKey}
          showCoverageLabel={metricsRuntime.hasCrossCoverage}
          restaurantForDish={restaurantForDish}
          onSavePress={getDishSaveHandler(item.connectionId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
        />
      );
    },
    [
      getDishSaveHandler,
      metricsRuntime,
      openScoreInfo,
      scoreMode,
      stableOpenRestaurantProfileFromResults,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const rank = metricsRuntime.canonicalRestaurantRankById.get(restaurant.restaurantId);
      if (typeof rank !== 'number') {
        return null;
      }
      const qualityColor =
        metricsRuntime.restaurantQualityColorById.get(restaurant.restaurantId) ??
        getMarkerColorForRestaurant(restaurant, scoreMode);
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          rank={rank}
          qualityColor={qualityColor}
          isLiked={false}
          scoreMode={scoreMode}
          primaryCoverageKey={metricsRuntime.primaryCoverageKey}
          showCoverageLabel={metricsRuntime.hasCrossCoverage}
          onSavePress={getRestaurantSaveHandler(restaurant.restaurantId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={metricsRuntime.primaryFoodTerm}
        />
      );
    },
    [
      getRestaurantSaveHandler,
      metricsRuntime,
      openScoreInfo,
      scoreMode,
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
