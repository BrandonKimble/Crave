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
  searchRuntimeBus,
  resultsPresentationOwner,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  getDishSaveHandler,
  getRestaurantSaveHandler,
  stableOpenRestaurantProfileFromResults,
  openScoreInfo,
}: UseSearchResultsPanelDataRuntimeArgs): SearchResultsPanelDataRuntime => {
  const panelInputRuntime = useSearchResultsPanelInputRuntime({
    searchRuntimeBus,
    resultsPresentationOwner,
  });
  const { scheduleTabToggleCommit } = resultsPresentationOwner.interactionModel;
  const hydrationContentRuntime = useSearchResultsPanelHydrationContentRuntime({
    searchRuntimeBus,
    panelInputRuntime,
  });
  const filtersContentRuntime = useSearchResultsPanelFiltersContentRuntime({
    searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache,
    toggleOpenNow,
    toggleVotesFilter,
    togglePriceSelector,
    panelInputRuntime,
    hydrationContentRuntime,
    scheduleTabToggleCommit,
  });
  const cardContentRuntime = useSearchResultsPanelCardContentRuntime({
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
