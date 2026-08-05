import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

import type { SearchRuntimeBus, SearchRuntimeBusKey } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

/** F1735: the four surface-redraw booleans this gate used to report were pinned false by
 *  construction (the redraw coordinator could never leave 'idle'); they and their bus
 *  fields are deleted. Response-frame freeze is the one live input. */
export type SearchFreezeGateState = {
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

const SEARCH_FREEZE_GATE_OBSERVED_KEYS: readonly SearchRuntimeBusKey[] = [
  'isResponseFrameFreezeActive',
];

const areSearchFreezeGateStatesEqual = (
  left: SearchFreezeGateState,
  right: SearchFreezeGateState
): boolean =>
  left.isResponseFrameFreezeActive === right.isResponseFrameFreezeActive &&
  left.freezeClassification === right.freezeClassification;

/**
 * Freeze is a POLICY FACT owned by the runtime bus: it is published on every response
 * commit. This hook therefore SUBSCRIBES (key-scoped, structural equality) rather than
 * sampling — it re-renders its consumer once per real freeze EDGE, not once per bus
 * publish, and never reports a boot-time value forever.
 */
export const useSearchFreezeGateStateRuntime = (
  searchRuntimeBus: SearchRuntimeBus
): SearchFreezeGateState =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
      freezeClassification: searchRuntimeBus.getPolicyFactsSnapshot().freezeClassification,
    }),
    areSearchFreezeGateStatesEqual,
    SEARCH_FREEZE_GATE_OBSERVED_KEYS,
    'search-freeze-gate-state'
  );
