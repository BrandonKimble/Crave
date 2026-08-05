import React from 'react';

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
const NOOP_WITH_NAME = (_name: string): void => undefined;
const EMPTY_DIETARY_OPTIONS: ReadonlyArray<{ name: string; label: string }> = [];

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
            // Same seat as the presented strip — the warmup render pre-fills it so
            // first presentation paints warm (holes + pill + scrollX on frame one).
            layoutCacheSeat: searchState.searchFiltersCacheSeat,
          },
    [
      filterModalControlLane.filterModalRuntime.openNow,
      filterModalControlLane.filterModalRuntime.priceButtonIsActive,
      filterModalControlLane.filterModalRuntime.priceButtonLabelText,
      filterModalControlLane.filterModalRuntime.includeSimilarActive,
      filterModalControlLane.filterModalRuntime.risingActive,
      searchState.activeTab,
      searchState.isSearchFiltersLayoutWarm,
      searchState.searchFiltersCacheSeat,
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
            layoutCacheSeat: filtersWarmupSnapshot.layoutCacheSeat,
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
            // Warmup measures LAYOUT only — the dietary chips are absent
            // here on purpose: the strip's width is measured with the
            // chips the live header will render (options arrive with the
            // first real render, and the seat re-measures then).
            dietaryOptions: EMPTY_DIETARY_OPTIONS,
            onToggleDietary: NOOP_WITH_NAME,
            onToggleIncludeSimilar: NOOP,
            onToggleSortSelector: NOOP,
            onTogglePriceSelector: NOOP,
            isPriceSelectorVisible: false,
            contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
            accentColor: ACTIVE_TAB_COLOR,
          },
    [hiddenFiltersWarmupLayout, hiddenFiltersWarmupState]
  );
};
