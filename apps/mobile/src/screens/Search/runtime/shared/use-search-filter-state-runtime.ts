import React from 'react';

import { normalizePriceLevels, useSearchStore } from '../../../../store/searchStore';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

// R1c single-writer: filter state is read from and written to the SearchRuntimeBus (the
// runtime authority). The zustand searchStore only mirrors these fields for persistence via
// search-runtime-filter-state-store-bridge.ts — never write it from here.
export const useSearchFilterStateRuntime = (searchRuntimeBus: SearchRuntimeBus) => {
  const filterState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      openNow: state.openNow,
      priceLevels: state.priceLevels,
      votes100Plus: state.votesFilterActive,
      risingActive: state.risingActive,
    }),
    (left, right) =>
      left.openNow === right.openNow &&
      left.priceLevels === right.priceLevels &&
      left.votes100Plus === right.votes100Plus &&
      left.risingActive === right.risingActive,
    ['openNow', 'priceLevels', 'votesFilterActive', 'risingActive'] as const,
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

  const setVotes100Plus = React.useCallback(
    (enabled: boolean) => {
      searchRuntimeBus.publish({ votesFilterActive: Boolean(enabled) });
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
      votesFilterActive: false,
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
      votes100Plus: filterState.votes100Plus,
      setVotes100Plus,
      risingActive: filterState.risingActive,
      setRisingActive,
      resetFilters,
    }),
    [filterState, resetFilters, setOpenNow, setPriceLevels, setRisingActive, setVotes100Plus]
  );
};
