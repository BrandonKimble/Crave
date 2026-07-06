import React from 'react';

import { normalizePriceLevels, useSearchStore } from '../../../../store/searchStore';
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

  const setOpenNow = React.useCallback(
    (openNow: boolean) => {
      searchRuntimeBus.publish({ openNow });
    },
    [searchRuntimeBus]
  );

  const setPriceLevels = React.useCallback(
    (levels: number[]) => {
      searchRuntimeBus.publish({ priceLevels: normalizePriceLevels(levels) });
    },
    [searchRuntimeBus]
  );

  const setIncludeSimilar = React.useCallback(
    (enabled: boolean) => {
      searchRuntimeBus.publish({ includeSimilarActive: Boolean(enabled) });
    },
    [searchRuntimeBus]
  );

  const setRisingActive = React.useCallback(
    (enabled: boolean) => {
      searchRuntimeBus.publish({ risingActive: Boolean(enabled) });
    },
    [searchRuntimeBus]
  );

  const resetFilters = React.useCallback(() => {
    searchRuntimeBus.publish({
      openNow: false,
      priceLevels: [],
      includeSimilarActive: false,
      risingActive: false,
    });
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
