import React from 'react';

import { createSearchFreezeGateRuntimeValue } from '../controller/search-freeze-gate-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchFreezeGateDiagnosticsRuntime } from './use-search-freeze-gate-diagnostics-runtime';
import { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';
import { useSearchResponseFrameFreezeRuntime } from './use-search-response-frame-freeze-runtime';
import { useSearchRunOneStallPressureRuntime } from './use-search-run-one-stall-pressure-runtime';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

type RunOneHandoffCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

type UseSearchFreezeGateRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
  searchMode: 'natural' | 'shortcut' | null;
  getPerfNow: () => number;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
};

type UseSearchFreezeGateRuntimeResult = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const useSearchFreezeGateRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
  searchMode,
  getPerfNow,
  runOneHandoffCoordinatorRef,
  runOneCommitSpanPressureByOperationRef,
}: UseSearchFreezeGateRuntimeArgs): UseSearchFreezeGateRuntimeResult => {
  useSearchResponseFrameFreezeRuntime({
    searchRuntimeBus,
    resultsRequestKey,
  });

  const freezeGateStateRuntime = useSearchFreezeGateStateRuntime(searchRuntimeBus);

  useSearchFreezeGateDiagnosticsRuntime(freezeGateStateRuntime);

  useSearchRunOneStallPressureRuntime({
    searchMode,
    getPerfNow,
    runOneHandoffCoordinatorRef,
    runOneCommitSpanPressureByOperationRef,
    runOneHandoffRuntimeState: freezeGateStateRuntime.runOneHandoffRuntimeState,
  });

  return React.useMemo(
    () =>
      createSearchFreezeGateRuntimeValue({
        isRunOneChromeFreezeActive:
          freezeGateStateRuntime.freezeGateState.isRunOneChromeFreezeActive,
        isRunOnePreflightFreezeActive:
          freezeGateStateRuntime.freezeGateState.isRunOnePreflightFreezeActive,
        isRun1HandoffActive:
          freezeGateStateRuntime.freezeGateState.isRun1HandoffActive,
        isResponseFrameFreezeActive:
          freezeGateStateRuntime.freezeGateState.isResponseFrameFreezeActive,
        freezeClassification:
          freezeGateStateRuntime.freezeGateState.freezeClassification,
      }),
    [freezeGateStateRuntime.freezeGateState]
  );
};
