import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { areResultsPresentationTransportLifecycleStatesEqual } from './use-search-runtime-instrumentation-runtime-contract';

export const useSearchRuntimePresentationTelemetryRuntime = ({
  searchRuntimeBus,
  getActiveShortcutRunNumber,
  emitRuntimeMechanismEvent,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  getActiveShortcutRunNumber: () => number | null;
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
}): void => {
  const handoffPresentationRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffOperationId: state.runOneHandoffOperationId,
      runOneHandoffPhase: state.runOneHandoffPhase,
    }),
    (left, right) =>
      left.runOneHandoffOperationId === right.runOneHandoffOperationId &&
      left.runOneHandoffPhase === right.runOneHandoffPhase,
    ['runOneHandoffOperationId', 'runOneHandoffPhase'] as const
  );
  const presentationTelemetryState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      resultsPresentationTransport: state.resultsPresentationTransport,
    }),
    (left, right) =>
      areResultsPresentationTransportLifecycleStatesEqual(
        left.resultsPresentationTransport,
        right.resultsPresentationTransport
      ),
    ['resultsPresentationTransport'] as const
  );

  const previousPresentationTelemetryStateRef = React.useRef({
    resultsPresentationTransport: presentationTelemetryState.resultsPresentationTransport,
  });

  React.useEffect(() => {
    const previous = previousPresentationTelemetryStateRef.current;
    const next = {
      resultsPresentationTransport: presentationTelemetryState.resultsPresentationTransport,
    };
    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null) {
      previousPresentationTelemetryStateRef.current = next;
      return;
    }
    if (
      next.resultsPresentationTransport.executionStage !==
      previous.resultsPresentationTransport.executionStage
    ) {
      emitRuntimeMechanismEvent('runtime_write_span', {
        domain: 'visual_sync_state',
        label: `map_execution_stage_${next.resultsPresentationTransport.executionStage}`,
        operationId: handoffPresentationRuntimeState.runOneHandoffOperationId,
        phase: handoffPresentationRuntimeState.runOneHandoffPhase,
        mapExecutionStage: next.resultsPresentationTransport.executionStage,
        previousMapExecutionStage: previous.resultsPresentationTransport.executionStage,
      });
    }
    if (
      next.resultsPresentationTransport.transactionId !==
        previous.resultsPresentationTransport.transactionId ||
      next.resultsPresentationTransport.snapshotKind !==
        previous.resultsPresentationTransport.snapshotKind
    ) {
      emitRuntimeMechanismEvent('runtime_write_span', {
        domain: 'visual_sync_state',
        label:
          next.resultsPresentationTransport.transactionId != null
            ? 'presentation_transaction_armed'
            : 'presentation_transaction_cleared',
        operationId: handoffPresentationRuntimeState.runOneHandoffOperationId,
        phase: handoffPresentationRuntimeState.runOneHandoffPhase,
        mapPresentationSnapshotKind: next.resultsPresentationTransport.snapshotKind,
        mapPresentationTransactionId: next.resultsPresentationTransport.transactionId,
        previousPresentationSnapshotKind: previous.resultsPresentationTransport.snapshotKind,
        previousPresentationTransactionId: previous.resultsPresentationTransport.transactionId,
      });
    }
    previousPresentationTelemetryStateRef.current = next;
  }, [
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    handoffPresentationRuntimeState.runOneHandoffOperationId,
    handoffPresentationRuntimeState.runOneHandoffPhase,
    presentationTelemetryState.resultsPresentationTransport,
  ]);
};
