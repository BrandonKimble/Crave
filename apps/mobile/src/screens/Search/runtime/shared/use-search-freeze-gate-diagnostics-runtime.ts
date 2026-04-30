import React from 'react';

import { logger } from '../../../../utils';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';
import type { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';

type SearchFreezeGateSnapshot = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
  runOneHandoffPhase: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffPhase'];
  resultsPresentation: ResultsPresentationReadModel;
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
      isRunOneChromeFreezeActive: freezeGateState.isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive: freezeGateState.isRunOnePreflightFreezeActive,
      isRun1HandoffActive: freezeGateState.isRun1HandoffActive,
      isResponseFrameFreezeActive: freezeGateState.isResponseFrameFreezeActive,
      freezeClassification: freezeGateState.freezeClassification,
      runOneHandoffPhase: freezeGateRuntimeState.runOneHandoffPhase,
      resultsPresentation: freezeGateRuntimeState.resultsPresentation,
    };
    const previousSnapshot = freezeGateDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.isRunOneChromeFreezeActive === nextSnapshot.isRunOneChromeFreezeActive &&
      previousSnapshot.isRunOnePreflightFreezeActive ===
        nextSnapshot.isRunOnePreflightFreezeActive &&
      previousSnapshot.isRun1HandoffActive === nextSnapshot.isRun1HandoffActive &&
      previousSnapshot.isResponseFrameFreezeActive === nextSnapshot.isResponseFrameFreezeActive &&
      previousSnapshot.freezeClassification === nextSnapshot.freezeClassification &&
      previousSnapshot.runOneHandoffPhase === nextSnapshot.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(
        previousSnapshot.resultsPresentation,
        nextSnapshot.resultsPresentation
      )
    ) {
      return;
    }
    logger.debug('[SEARCH-FREEZE-DIAG] freezeGate', nextSnapshot);
    freezeGateDiagRef.current = nextSnapshot;
  }, [freezeGateRuntimeState, freezeGateState]);
};
