import React from 'react';

import { cloneSearchFiltersLayoutCache } from '../../components/SearchFilters';
import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import { useSearchFilterChipReadModel } from '../read-models/chip-read-model-builder';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { useSearchResultsPanelFiltersRuntimeState } from './use-search-results-panel-filters-runtime-state';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';

export const useSearchRootSearchSceneFiltersHeaderRuntime = ({
  stateFoundationLane,
  filterModalControlLane,
  searchResultsRuntimeState,
  searchFiltersRuntimeState,
  hydrationKeyRuntime,
  scheduleTabToggleCommit,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  searchResultsRuntimeState: ReturnType<
    typeof useSearchResultsPanelResultsRuntimeState
  >;
  searchFiltersRuntimeState: ReturnType<
    typeof useSearchResultsPanelFiltersRuntimeState
  >;
  hydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  scheduleTabToggleCommit: (next: 'dishes' | 'restaurants') => void;
}) => {
  const { searchState } = stateFoundationLane.rootPrimitivesRuntime;
  const filtersActiveTab =
    searchResultsRuntimeState.pendingTabSwitchTab ??
    searchResultsRuntimeState.activeTab;
  const handleInteractionTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      scheduleTabToggleCommit(next);
    },
    [scheduleTabToggleCommit]
  );
  const filterChipReadModel = useSearchFilterChipReadModel({
    requestVersionKey: hydrationKeyRuntime.requestVersionKey,
    activeTab: searchResultsRuntimeState.activeTab,
    priceButtonLabel: searchFiltersRuntimeState.priceButtonLabelText,
    priceButtonActive: searchFiltersRuntimeState.priceButtonIsActive,
    openNow: searchFiltersRuntimeState.openNow,
    votesFilterActive: searchFiltersRuntimeState.votesFilterActive,
    isPriceSelectorVisible: searchFiltersRuntimeState.isPriceSelectorVisible,
  });

  return React.useMemo(
    () => ({
      activeTab: filtersActiveTab,
      onTabChange: handleInteractionTabChange,
      openNow: filterChipReadModel.openNow,
      onToggleOpenNow: filterModalControlLane.filterModalRuntime.toggleOpenNow,
      votesFilterActive: filterChipReadModel.votesFilterActive,
      onToggleVotesFilter:
        filterModalControlLane.filterModalRuntime.toggleVotesFilter,
      priceButtonLabel: filterChipReadModel.priceButtonLabel,
      priceButtonActive: filterChipReadModel.priceButtonActive,
      onTogglePriceSelector:
        filterModalControlLane.filterModalRuntime.togglePriceSelector,
      isPriceSelectorVisible: filterChipReadModel.isPriceSelectorVisible,
      contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
      accentColor: ACTIVE_TAB_COLOR,
      initialLayoutCache: cloneSearchFiltersLayoutCache(
        searchState.searchFiltersLayoutCacheRef.current
      ),
      onLayoutCacheChange: searchState.handleSearchFiltersLayoutCache,
    }),
    [
      filterChipReadModel.isPriceSelectorVisible,
      filterChipReadModel.openNow,
      filterChipReadModel.priceButtonActive,
      filterChipReadModel.priceButtonLabel,
      filterChipReadModel.votesFilterActive,
      filterModalControlLane.filterModalRuntime.toggleOpenNow,
      filterModalControlLane.filterModalRuntime.togglePriceSelector,
      filterModalControlLane.filterModalRuntime.toggleVotesFilter,
      filtersActiveTab,
      handleInteractionTabChange,
      searchState.handleSearchFiltersLayoutCache,
      searchState.searchFiltersLayoutCacheRef,
    ]
  );
};
