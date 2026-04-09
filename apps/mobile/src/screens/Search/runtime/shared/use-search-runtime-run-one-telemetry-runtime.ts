import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { RunOneHandoffCoordinatorLike } from './use-search-runtime-instrumentation-runtime-contract';

type UseSearchRuntimeRunOneTelemetryRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  getActiveShortcutRunNumber: () => number | null;
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  shortcutHarnessRunId: string | null;
};

export const useSearchRuntimeRunOneTelemetryRuntime = ({
  searchRuntimeBus,
  getActiveShortcutRunNumber,
  emitRuntimeMechanismEvent,
  runOneHandoffCoordinatorRef,
  shortcutHarnessRunId,
}: UseSearchRuntimeRunOneTelemetryRuntimeArgs): void => {
  const runOneTelemetryState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffPhase: state.runOneHandoffPhase,
      runOneHandoffOperationId: state.runOneHandoffOperationId,
      isRun1HandoffActive: state.isRun1HandoffActive,
      isChromeDeferred: state.isChromeDeferred,
    }),
    (left, right) =>
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      left.runOneHandoffOperationId === right.runOneHandoffOperationId &&
      left.isRun1HandoffActive === right.isRun1HandoffActive &&
      left.isChromeDeferred === right.isChromeDeferred,
    [
      'runOneHandoffPhase',
      'runOneHandoffOperationId',
      'isRun1HandoffActive',
      'isChromeDeferred',
    ] as const
  );

  const previousRunOnePhaseRef = React.useRef(runOneTelemetryState.runOneHandoffPhase);
  React.useEffect(() => {
    if (runOneTelemetryState.runOneHandoffPhase === previousRunOnePhaseRef.current) {
      return;
    }
    previousRunOnePhaseRef.current = runOneTelemetryState.runOneHandoffPhase;
    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null) {
      return;
    }
    const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
    emitRuntimeMechanismEvent('run_one_handoff_phase', {
      source: 'coordinator_snapshot',
      phase: runOneTelemetryState.runOneHandoffPhase,
      operationId: runOneTelemetryState.runOneHandoffOperationId,
      seq: coordinatorSnapshot.seq,
      page: coordinatorSnapshot.page,
      isRun1HandoffActive: runOneTelemetryState.isRun1HandoffActive,
      isChromeDeferred: runOneTelemetryState.isChromeDeferred,
      harnessRunId: shortcutHarnessRunId,
    });
  }, [
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    runOneHandoffCoordinatorRef,
    runOneTelemetryState.isChromeDeferred,
    runOneTelemetryState.isRun1HandoffActive,
    runOneTelemetryState.runOneHandoffOperationId,
    runOneTelemetryState.runOneHandoffPhase,
    shortcutHarnessRunId,
  ]);
};
