import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

import type { SearchRuntimeBus, SearchRuntimeBusKey } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export type SearchFreezeGateState = {
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

/**
 * The four booleans the gate reports, plus the two additional inputs the bus folds
 * into `freezeClassification` (see resolveSearchRuntimeBusPolicyFactsSnapshot). Any
 * key that can move the returned value MUST be observed, or the gate goes stale on
 * that edge — which is exactly the defect this hook used to have wholesale.
 */
const SEARCH_FREEZE_GATE_OBSERVED_KEYS: readonly SearchRuntimeBusKey[] = [
  'isSearchSurfaceRedrawChromeFreezeActive',
  'isSearchSurfaceRedrawPreflightFreezeActive',
  'isSearchSurfaceRedrawActive',
  'isResponseFrameFreezeActive',
  'isChromeDeferred',
  'searchSurfaceRedrawCommitSpanPressureActive',
];

const areSearchFreezeGateStatesEqual = (
  left: SearchFreezeGateState,
  right: SearchFreezeGateState
): boolean =>
  left.isSearchSurfaceRedrawChromeFreezeActive === right.isSearchSurfaceRedrawChromeFreezeActive &&
  left.isSearchSurfaceRedrawPreflightFreezeActive ===
    right.isSearchSurfaceRedrawPreflightFreezeActive &&
  left.isSearchSurfaceRedrawActive === right.isSearchSurfaceRedrawActive &&
  left.isResponseFrameFreezeActive === right.isResponseFrameFreezeActive &&
  left.freezeClassification === right.freezeClassification;

/**
 * Freeze is a POLICY FACT owned by the runtime bus: it is published on every response
 * commit and every redraw edge. This hook therefore SUBSCRIBES (key-scoped, structural
 * equality) rather than sampling — it re-renders its consumer once per real freeze
 * EDGE, not once per bus publish, and never reports a boot-time value forever.
 */
export const useSearchFreezeGateStateRuntime = (
  searchRuntimeBus: SearchRuntimeBus
): SearchFreezeGateState =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isSearchSurfaceRedrawChromeFreezeActive: state.isSearchSurfaceRedrawChromeFreezeActive,
      isSearchSurfaceRedrawPreflightFreezeActive: state.isSearchSurfaceRedrawPreflightFreezeActive,
      isSearchSurfaceRedrawActive: state.isSearchSurfaceRedrawActive,
      isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
      freezeClassification: searchRuntimeBus.getPolicyFactsSnapshot().freezeClassification,
    }),
    areSearchFreezeGateStatesEqual,
    SEARCH_FREEZE_GATE_OBSERVED_KEYS,
    'search-freeze-gate-state'
  );
