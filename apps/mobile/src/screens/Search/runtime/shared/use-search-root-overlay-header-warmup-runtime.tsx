import React from 'react';

import SearchFilters, { cloneSearchFiltersLayoutCache } from '../../components/SearchFilters';
import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import type { SearchOverlayChromeHiddenSearchFiltersWarmupProps } from './search-foreground-chrome-contract';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';
import { createSearchRuntimeBus } from './search-runtime-bus';

type UseSearchRootOverlayHeaderWarmupRuntimeArgs = {
  filterModalControlLane: SearchRootFilterModalControlLane;
  searchState: SearchRootSearchStateRuntime;
};

const NOOP = (): void => undefined;
void SearchFilters;

// The hidden warmup render exists purely to measure the strip's LAYOUT — its chip states are
// irrelevant, so it renders against a detached throwaway bus (SearchFilters requires a live
// chip-state source; wiring the real session bus through the chrome-host chain would thread
// 4 extra contracts for values the warmup never shows).
const WARMUP_DETACHED_BUS = createSearchRuntimeBus();

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
            includeSimilarActive: filterModalControlLane.filterModalRuntime.includeSimilarActive,
            risingActive: filterModalControlLane.filterModalRuntime.risingActive,
            priceButtonLabelText: filterModalControlLane.filterModalRuntime.priceButtonLabelText,
            priceButtonIsActive: filterModalControlLane.filterModalRuntime.priceButtonIsActive,
            initialLayoutCache: cloneSearchFiltersLayoutCache(
              searchState.searchFiltersLayoutCacheRef.current
            ),
            onLayoutCacheChange: searchState.handleSearchFiltersLayoutCache,
          },
    [
      filterModalControlLane.filterModalRuntime.openNow,
      filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      filterModalControlLane.filterModalRuntime.includeSimilarActive,
      filterModalControlLane.filterModalRuntime.risingActive,
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
            includeSimilarActive: filtersWarmupSnapshot.includeSimilarActive,
            similarAvailableCount: 0,
            risingActive: filtersWarmupSnapshot.risingActive,
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
            searchRuntimeBus: WARMUP_DETACHED_BUS,
            onTabChange: NOOP,
            onToggleOpenNow: NOOP,
            onToggleIncludeSimilar: NOOP,
            onToggleRising: NOOP,
            onTogglePriceSelector: NOOP,
            isPriceSelectorVisible: false,
            contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
            accentColor: ACTIVE_TAB_COLOR,
          },
    [hiddenFiltersWarmupLayout, hiddenFiltersWarmupState]
  );
};
