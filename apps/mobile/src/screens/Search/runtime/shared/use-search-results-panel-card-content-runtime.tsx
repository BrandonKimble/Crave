import React from 'react';

import type {
  SearchResultsPanelDataRuntime,
  UseSearchResultsPanelDataRuntimeArgs,
} from './search-results-panel-data-runtime-contract';
import { useSearchResultsPanelCardMetricsRuntime } from './use-search-results-panel-card-metrics-runtime';
import { useSearchResultsPanelCardRenderRuntime } from './use-search-results-panel-card-render-runtime';
import type { SearchResultsPanelHydrationContentRuntime } from './use-search-results-panel-hydration-content-runtime';
import { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';

type UseSearchResultsPanelCardContentRuntimeArgs = Pick<
  UseSearchResultsPanelDataRuntimeArgs,
  | 'scoreMode'
  | 'getDishSaveHandler'
  | 'getRestaurantSaveHandler'
  | 'stableOpenRestaurantProfileFromResults'
  | 'openScoreInfo'
> & {
  hydrationContentRuntime: SearchResultsPanelHydrationContentRuntime;
};

export type SearchResultsPanelCardContentRuntime = Pick<
  SearchResultsPanelDataRuntime,
  'onDemandNotice' | 'renderDishCard' | 'renderRestaurantCard'
>;

export const useSearchResultsPanelCardContentRuntime = ({
  scoreMode,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
  hydrationContentRuntime,
}: UseSearchResultsPanelCardContentRuntimeArgs): SearchResultsPanelCardContentRuntime => {
  const cardMetricsRuntime = useSearchResultsPanelCardMetricsRuntime({
    dishes: hydrationContentRuntime.dishes,
    restaurants: hydrationContentRuntime.restaurants,
    resolvedResults: hydrationContentRuntime.resolvedResults,
    scoreMode,
  });
  const onDemandNotice = useSearchResultsPanelOnDemandNoticeRuntime({
    resolvedResults: hydrationContentRuntime.resolvedResults,
    onDemandNoticeQuery: hydrationContentRuntime.onDemandNoticeQuery,
  });
  const { renderDishCard, renderRestaurantCard } = useSearchResultsPanelCardRenderRuntime({
    scoreMode,
    getDishSaveHandler,
    getRestaurantSaveHandler,
    stableOpenRestaurantProfileFromResults,
    openScoreInfo,
    metricsRuntime: cardMetricsRuntime,
  });

  return React.useMemo(
    () => ({
      onDemandNotice,
      renderDishCard,
      renderRestaurantCard,
    }),
    [onDemandNotice, renderDishCard, renderRestaurantCard]
  );
};
