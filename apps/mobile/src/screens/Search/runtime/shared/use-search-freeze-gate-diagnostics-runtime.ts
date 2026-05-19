import React from 'react';

import { logger } from '../../../../utils';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';
import type { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';

type SearchFreezeGateSnapshot = {
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
  searchSurfaceRedrawPhase: ReturnType<SearchRuntimeBus['getState']>['searchSurfaceRedrawPhase'];
};

type UseSearchFreezeGateDiagnosticsRuntimeArgs = ReturnType<
  typeof useSearchFreezeGateStateRuntime
>;

export const useSearchFreezeGateDiagnosticsRuntime = ({
  freezeGateState,
  freezeGateRuntimeState,
}: UseSearchFreezeGateDiagnosticsRuntimeArgs) => {
  const freezeGateDiagRef = React.useRef<SearchFreezeGateSnapshot | null>(null);

  React.useEffect(() => {
    if (!shouldLogSearchNavSwitchDiagnosticLogs()) {
      freezeGateDiagRef.current = null;
      return;
    }

    const nextSnapshot: SearchFreezeGateSnapshot = {
      isSearchSurfaceRedrawChromeFreezeActive: freezeGateState.isSearchSurfaceRedrawChromeFreezeActive,
      isSearchSurfaceRedrawPreflightFreezeActive: freezeGateState.isSearchSurfaceRedrawPreflightFreezeActive,
      isSearchSurfaceRedrawActive: freezeGateState.isSearchSurfaceRedrawActive,
      isResponseFrameFreezeActive: freezeGateState.isResponseFrameFreezeActive,
      freezeClassification: freezeGateState.freezeClassification,
      searchSurfaceRedrawPhase: freezeGateRuntimeState.searchSurfaceRedrawPhase,
    };
    const previousSnapshot = freezeGateDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.isSearchSurfaceRedrawChromeFreezeActive === nextSnapshot.isSearchSurfaceRedrawChromeFreezeActive &&
      previousSnapshot.isSearchSurfaceRedrawPreflightFreezeActive ===
        nextSnapshot.isSearchSurfaceRedrawPreflightFreezeActive &&
      previousSnapshot.isSearchSurfaceRedrawActive === nextSnapshot.isSearchSurfaceRedrawActive &&
      previousSnapshot.isResponseFrameFreezeActive === nextSnapshot.isResponseFrameFreezeActive &&
      previousSnapshot.freezeClassification === nextSnapshot.freezeClassification &&
      previousSnapshot.searchSurfaceRedrawPhase === nextSnapshot.searchSurfaceRedrawPhase
    ) {
      return;
    }
    logger.debug('[SEARCH-FREEZE-DIAG] freezeGate', nextSnapshot);
    freezeGateDiagRef.current = nextSnapshot;
  }, [freezeGateRuntimeState, freezeGateState]);
};
