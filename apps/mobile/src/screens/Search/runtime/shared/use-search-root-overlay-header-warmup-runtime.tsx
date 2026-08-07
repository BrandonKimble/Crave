import React from 'react';

import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import type { SearchOverlayChromeHiddenSearchFiltersWarmupProps } from './search-foreground-chrome-contract';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';
import { createSearchRuntimeBus } from './search-runtime-bus';

type UseSearchRootOverlayHeaderWarmupRuntimeArgs = {
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
  searchState,
}: UseSearchRootOverlayHeaderWarmupRuntimeArgs): SearchOverlayChromeHiddenSearchFiltersWarmupProps | null => {
  // F3900/D78: this used to project SIX chip-state values off filterModalRuntime into
  // props the strip discarded — and it could never have mattered here anyway: the warmup
  // renders against a DETACHED bus, so the chips it measures have always shown that bus's
  // defaults, not these values. What survives is the only thing the warmup is for: the
  // seat, and the gate that stops warming once layout is warm.
  const warmupLayoutCacheSeat = React.useMemo(
    () => (searchState.isSearchFiltersLayoutWarm ? null : searchState.searchFiltersCacheSeat),
    [searchState.isSearchFiltersLayoutWarm, searchState.searchFiltersCacheSeat]
  );

  // Typed through an annotated local for the same reason as the live header runtime
  // (F3900/D78): a fresh object literal assigned to an ANNOTATED binding is
  // excess-property checked, so re-adding a deleted chip prop here fails tsc. The
  // useMemo type argument alone does not do this.
  return React.useMemo<SearchOverlayChromeHiddenSearchFiltersWarmupProps | null>(() => {
    if (warmupLayoutCacheSeat == null) {
      return null;
    }
    const warmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps = {
      // Same seat as the presented strip — the warmup render pre-fills it so
      // first presentation paints warm (holes + pill + scrollX on frame one).
      layoutCacheSeat: warmupLayoutCacheSeat,
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
      contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
      accentColor: ACTIVE_TAB_COLOR,
    };
    return warmupProps;
  }, [warmupLayoutCacheSeat]);
};
