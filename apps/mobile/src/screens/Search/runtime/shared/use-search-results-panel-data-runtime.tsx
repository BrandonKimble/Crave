import React from 'react';

import type {
  SearchResultsPanelDataRuntime,
  UseSearchResultsPanelDataRuntimeArgs,
} from './search-results-panel-data-runtime-contract';
import { useSearchResultsPanelCardContentRuntime } from './use-search-results-panel-card-content-runtime';
import { useSearchResultsPanelFiltersContentRuntime } from './use-search-results-panel-filters-content-runtime';
import { useSearchResultsPanelHydrationContentRuntime } from './use-search-results-panel-hydration-content-runtime';
import { useSearchResultsPanelInputRuntime } from './use-search-results-panel-input-runtime';

export type {
  SearchResultsPanelDataRuntime,
  UseSearchResultsPanelDataRuntimeArgs,
} from './search-results-panel-data-runtime-contract';

export const useSearchResultsPanelDataRuntime = ({
  resultsPresentationOwner,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  scoreMode,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
}: UseSearchResultsPanelDataRuntimeArgs): SearchResultsPanelDataRuntime => {
  const panelInputRuntime = useSearchResultsPanelInputRuntime({
    resultsPresentationOwner,
  });
  const { scheduleTabToggleCommit } = resultsPresentationOwner.interactionModel;
  const hydrationContentRuntime = useSearchResultsPanelHydrationContentRuntime({
    panelInputRuntime,
  });
  const filtersContentRuntime = useSearchResultsPanelFiltersContentRuntime({
    searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache,
    toggleRankSelector,
    toggleOpenNow,
    toggleVotesFilter,
    togglePriceSelector,
    panelInputRuntime,
    hydrationContentRuntime,
    scheduleTabToggleCommit,
  });
  const cardContentRuntime = useSearchResultsPanelCardContentRuntime({
    scoreMode,
    getDishSaveHandler,
    getRestaurantSaveHandler,
    stableOpenRestaurantProfileFromResults,
    openScoreInfo,
    hydrationContentRuntime,
  });

  return React.useMemo(
    () => ({
      ...panelInputRuntime,
      ...hydrationContentRuntime,
      ...filtersContentRuntime,
      ...cardContentRuntime,
    }),
    [cardContentRuntime, filtersContentRuntime, hydrationContentRuntime, panelInputRuntime]
  );
};
