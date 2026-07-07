import React from 'react';

import { normalizePriceLevels, useSearchStore } from '../../../../store/searchStore';
import { writeSearchDesiredTuple } from './search-desired-state-writer';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

// R1c single-writer: filter state is read from and written to the SearchRuntimeBus (the
// runtime authority). The zustand searchStore only mirrors the PERSISTED fields for
// persistence via search-runtime-filter-state-store-bridge.ts — never write it from here.
// `includeSimilarActive` is deliberately session-scoped (bus-only, NOT mirrored/persisted):
// it resets to false on a new search submit and on bus reset.
export const useSearchFilterStateRuntime = (searchRuntimeBus: SearchRuntimeBus) => {
  const filterState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      openNow: state.openNow,
      priceLevels: state.priceLevels,
      includeSimilarActive: state.includeSimilarActive,
      risingActive: state.risingActive,
    }),
    (left, right) =>
      left.openNow === right.openNow &&
      left.priceLevels === right.priceLevels &&
      left.includeSimilarActive === right.includeSimilarActive &&
      left.risingActive === right.risingActive,
    ['openNow', 'priceLevels', 'includeSimilarActive', 'risingActive'] as const,
    'search_filter_state_runtime'
  );

  // S2: every setter routes through the ONE tuple writer (the legacy keys are read-only
  // projections of the tuple from here on — two-writer divergence is unrepresentable).
  const setOpenNow = React.useCallback(
    (openNow: boolean) => {
      writeSearchDesiredTuple(searchRuntimeBus, { filterVariant: { openNow } }, 'chip_open_now');
    },
    [searchRuntimeBus]
  );

  const setPriceLevels = React.useCallback(
    (levels: number[]) => {
      writeSearchDesiredTuple(
        searchRuntimeBus,
        { filterVariant: { priceLevels: normalizePriceLevels(levels) } },
        'chip_price'
      );
    },
    [searchRuntimeBus]
  );

  const setIncludeSimilar = React.useCallback(
    (enabled: boolean) => {
      writeSearchDesiredTuple(
        searchRuntimeBus,
        { filterVariant: { includeSimilar: Boolean(enabled) } },
        'chip_include_similar'
      );
    },
    [searchRuntimeBus]
  );

  const setRisingActive = React.useCallback(
    (enabled: boolean) => {
      writeSearchDesiredTuple(
        searchRuntimeBus,
        { filterVariant: { rising: Boolean(enabled) } },
        'chip_rising'
      );
    },
    [searchRuntimeBus]
  );

  const resetFilters = React.useCallback(() => {
    writeSearchDesiredTuple(
      searchRuntimeBus,
      {
        filterVariant: { openNow: false, priceLevels: [], includeSimilar: false, rising: false },
      },
      'dismiss'
    );
    // Bounds are not runtime-bus state (not duplicated); they stay zustand-owned.
    useSearchStore.getState().resetBoundsFilter();
  }, [searchRuntimeBus]);

  return React.useMemo(
    () => ({
      openNow: filterState.openNow,
      setOpenNow,
      priceLevels: filterState.priceLevels,
      setPriceLevels,
      includeSimilarActive: filterState.includeSimilarActive,
      setIncludeSimilar,
      risingActive: filterState.risingActive,
      setRisingActive,
      resetFilters,
    }),
    [filterState, resetFilters, setOpenNow, setPriceLevels, setRisingActive, setIncludeSimilar]
  );
};
