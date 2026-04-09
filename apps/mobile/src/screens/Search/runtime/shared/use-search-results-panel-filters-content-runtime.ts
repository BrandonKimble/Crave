import React from 'react';

import { useSearchResultsPanelFiltersRuntime } from './use-search-results-panel-filters-runtime';
import type {
  SearchResultsPanelDataRuntime,
  UseSearchResultsPanelDataRuntimeArgs,
} from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelHydrationContentRuntime } from './use-search-results-panel-hydration-content-runtime';
import type { SearchResultsPanelInputRuntime } from './use-search-results-panel-input-runtime';

type UseSearchResultsPanelFiltersContentRuntimeArgs = Pick<
  UseSearchResultsPanelDataRuntimeArgs,
  | 'searchFiltersLayoutCacheRef'
  | 'handleSearchFiltersLayoutCache'
  | 'toggleRankSelector'
  | 'toggleOpenNow'
  | 'toggleVotesFilter'
  | 'togglePriceSelector'
> & {
  panelInputRuntime: SearchResultsPanelInputRuntime;
  hydrationContentRuntime: SearchResultsPanelHydrationContentRuntime;
  scheduleTabToggleCommit: UseSearchResultsPanelDataRuntimeArgs['resultsPresentationOwner']['interactionModel']['scheduleTabToggleCommit'];
};

export type SearchResultsPanelFiltersContentRuntime = Pick<
  SearchResultsPanelDataRuntime,
  'filtersHeader'
>;

export const useSearchResultsPanelFiltersContentRuntime = ({
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  panelInputRuntime,
  hydrationContentRuntime,
  scheduleTabToggleCommit,
}: UseSearchResultsPanelFiltersContentRuntimeArgs): SearchResultsPanelFiltersContentRuntime => {
  const { filtersHeader } = useSearchResultsPanelFiltersRuntime({
    searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache,
    toggleRankSelector,
    toggleOpenNow,
    toggleVotesFilter,
    togglePriceSelector,
    activeTab: panelInputRuntime.activeTab,
    pendingTabSwitchTab: panelInputRuntime.pendingTabSwitchTab,
    scheduleTabToggleCommit,
    requestVersionKey: hydrationContentRuntime.requestVersionKey,
    rankButtonLabelText: panelInputRuntime.rankButtonLabelText,
    rankButtonIsActive: panelInputRuntime.rankButtonIsActive,
    priceButtonLabelText: panelInputRuntime.priceButtonLabelText,
    priceButtonIsActive: panelInputRuntime.priceButtonIsActive,
    openNow: panelInputRuntime.openNow,
    votesFilterActive: panelInputRuntime.votesFilterActive,
    isRankSelectorVisible: panelInputRuntime.isRankSelectorVisible,
    isPriceSelectorVisible: panelInputRuntime.isPriceSelectorVisible,
  });

  return React.useMemo(
    () => ({
      filtersHeader,
    }),
    [filtersHeader]
  );
};
