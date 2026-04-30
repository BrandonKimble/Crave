import React from 'react';

import SearchFilters, { cloneSearchFiltersLayoutCache } from '../../components/SearchFilters';
import {
  ACTIVE_TAB_COLOR,
  CONTENT_HORIZONTAL_PADDING,
} from '../../constants/search';
import type { SearchOverlayChromeHiddenSearchFiltersWarmupProps } from './search-foreground-chrome-contract';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';

type UseSearchRootOverlayHeaderWarmupRuntimeArgs = {
  filterModalControlLane: SearchRootFilterModalControlLane;
  searchState: SearchRootSearchStateRuntime;
};

const NOOP = (): void => undefined;
void SearchFilters;

export const useSearchRootOverlayHeaderWarmupRuntime = ({
  filterModalControlLane,
  searchState,
}: UseSearchRootOverlayHeaderWarmupRuntimeArgs): SearchOverlayChromeHiddenSearchFiltersWarmupProps | null => {
  const filtersWarmupSnapshot = React.useMemo(
    () =>
      searchState.isSearchFiltersLayoutWarm
        ? null
        : {
            activeTab: searchState.activeTab,
            openNow: filterModalControlLane.filterModalRuntime.openNow,
            votesFilterActive:
              filterModalControlLane.filterModalRuntime.votesFilterActive,
            priceButtonLabelText:
              filterModalControlLane.filterModalRuntime.priceButtonLabelText,
            priceButtonIsActive:
              filterModalControlLane.filterModalRuntime.priceButtonIsActive,
            initialLayoutCache: cloneSearchFiltersLayoutCache(
              searchState.searchFiltersLayoutCacheRef.current
            ),
            onLayoutCacheChange: searchState.handleSearchFiltersLayoutCache,
          },
    [
      filterModalControlLane.filterModalRuntime.openNow,
      filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      filterModalControlLane.filterModalRuntime.votesFilterActive,
      searchState.activeTab,
      searchState.handleSearchFiltersLayoutCache,
      searchState.isSearchFiltersLayoutWarm,
      searchState.searchFiltersLayoutCacheRef,
    ]
  );

  const hiddenFiltersWarmupState = React.useMemo(
    () =>
      filtersWarmupSnapshot == null
        ? null
        : {
            activeTab: filtersWarmupSnapshot.activeTab,
            openNow: filtersWarmupSnapshot.openNow,
            votesFilterActive: filtersWarmupSnapshot.votesFilterActive,
            priceButtonLabel: filtersWarmupSnapshot.priceButtonLabelText,
            priceButtonActive: filtersWarmupSnapshot.priceButtonIsActive,
          },
    [filtersWarmupSnapshot]
  );

  const hiddenFiltersWarmupLayout = React.useMemo(
    () =>
      filtersWarmupSnapshot == null
        ? null
        : {
            initialLayoutCache: filtersWarmupSnapshot.initialLayoutCache,
            onLayoutCacheChange: filtersWarmupSnapshot.onLayoutCacheChange,
          },
    [filtersWarmupSnapshot]
  );

  return React.useMemo(
    () =>
      hiddenFiltersWarmupState == null || hiddenFiltersWarmupLayout == null
        ? null
        : {
            ...hiddenFiltersWarmupState,
            ...hiddenFiltersWarmupLayout,
            onTabChange: NOOP,
            onToggleOpenNow: NOOP,
            onToggleVotesFilter: NOOP,
            onTogglePriceSelector: NOOP,
            isPriceSelectorVisible: false,
            contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
            accentColor: ACTIVE_TAB_COLOR,
          },
    [hiddenFiltersWarmupLayout, hiddenFiltersWarmupState]
  );
};
