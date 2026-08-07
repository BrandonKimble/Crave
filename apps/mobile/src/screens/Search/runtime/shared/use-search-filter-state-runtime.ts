import React from 'react';

import { normalizePriceLevels } from '../../../../store/searchStore';
import { areNumberArraysEqual } from './search-desired-state-contract';
import { writeSearchDesiredTuple } from './search-desired-state-writer';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

// R1c single-writer: filter state is read from and written to the SearchRuntimeBus (the
// runtime authority). The zustand searchStore only mirrors the PERSISTED fields for
// persistence via search-runtime-filter-state-store-bridge.ts — never write it from here.
// `includeSimilarActive` is deliberately session-scoped (bus-only, NOT mirrored/persisted):
// it resets to false on a new search submit and on bus reset.
export type SearchFilterRuntimeState = {
  openNow: boolean;
  priceLevels: readonly number[];
  includeSimilarActive: boolean;
  risingActive: boolean;
};

/** F6409(c): priceLevels is an ARRAY — it must compare by VALUE. The tuple writer
 *  can hand back a fresh array on an unrelated filter write (e.g. toggling openNow),
 *  so a reference `===` re-renders every filter consumer on any filter change. This
 *  is the ONE equality for the filter selector; the array-by-value rule is here, not
 *  a thing each future field has to remember. */
export const areSearchFilterRuntimeStatesEqual = (
  left: SearchFilterRuntimeState,
  right: SearchFilterRuntimeState
): boolean =>
  left.openNow === right.openNow &&
  areNumberArraysEqual(left.priceLevels, right.priceLevels) &&
  left.includeSimilarActive === right.includeSimilarActive &&
  left.risingActive === right.risingActive;

export const useSearchFilterStateRuntime = (searchRuntimeBus: SearchRuntimeBus) => {
  // S4e: filter reads come straight off the desired tuple (the legacy projection keys
  // left the bus). Output field names unchanged — consumers are agnostic.
  const filterState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      openNow: state.desiredTuple.filterVariant.openNow,
      priceLevels: state.desiredTuple.filterVariant.priceLevels,
      includeSimilarActive: state.desiredTuple.filterVariant.includeSimilar,
      risingActive: state.desiredTuple.filterVariant.rising,
    }),
    areSearchFilterRuntimeStatesEqual,
    ['desiredTuple'] as const,
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
        // EVERY filter, dietary included. Dietary was omitted when it landed, so
        // "reset filters" left a hard wall standing that the user had just asked
        // to clear — the one filter that can silently empty a result set was the
        // one the reset didn't touch.
        filterVariant: {
          openNow: false,
          dietary: [],
          priceLevels: [],
          includeSimilar: false,
          rising: false,
        },
      },
      'dismiss'
    );
    // F1550: this used to call `useSearchStore.getState().resetBoundsFilter()` under the
    // comment "bounds stay zustand-owned". They were not owned by anything — the bounds triple
    // (bounds / boundsLabel / boundsPresetId) had no reader anywhere in the app, so the reset
    // was a write-only write. Fields and verb are gone; the bus reset above IS the filter reset.
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
