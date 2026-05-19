import React from 'react';

import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';

export const useSearchRuntimePresentationTelemetryRuntime = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  getActiveScenarioRunNumber,
  emitRuntimeMechanismEvent,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  getActiveScenarioRunNumber: () => number | null;
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
}): void => {
  const previousPresentationTelemetryStateRef = React.useRef({
    resultsPresentationTransport:
      resultsPresentationAuthority.getSnapshot().resultsPresentationTransport,
  });

  const emitPresentationTelemetrySnapshot = React.useCallback(() => {
    const previous = previousPresentationTelemetryStateRef.current;
    const runtimeState = searchRuntimeBus.getState();
    const presentationSnapshot = resultsPresentationAuthority.getSnapshot();
    const next = {
      resultsPresentationTransport: presentationSnapshot.resultsPresentationTransport,
    };
    const activeRunNumber = getActiveScenarioRunNumber();
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
        operationId: runtimeState.searchSurfaceRedrawOperationId,
        phase: runtimeState.searchSurfaceRedrawPhase,
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
        operationId: runtimeState.searchSurfaceRedrawOperationId,
        phase: runtimeState.searchSurfaceRedrawPhase,
        mapPresentationSnapshotKind: next.resultsPresentationTransport.snapshotKind,
        mapPresentationTransactionId: next.resultsPresentationTransport.transactionId,
        previousPresentationSnapshotKind: previous.resultsPresentationTransport.snapshotKind,
        previousPresentationTransactionId: previous.resultsPresentationTransport.transactionId,
      });
    }
    previousPresentationTelemetryStateRef.current = next;
  }, [
    emitRuntimeMechanismEvent,
    getActiveScenarioRunNumber,
    resultsPresentationAuthority,
    searchRuntimeBus,
  ]);

  React.useEffect(() => {
    const unsubscribeRuntime = searchRuntimeBus.subscribe(
      emitPresentationTelemetrySnapshot,
      ['searchSurfaceRedrawOperationId', 'searchSurfaceRedrawPhase'],
      'presentation_telemetry_handoff_state'
    );
    const unsubscribePresentation = resultsPresentationAuthority.subscribe(
      emitPresentationTelemetrySnapshot,
      ['resultsPresentationTransport'],
      'presentation_telemetry_transport_state'
    );
    emitPresentationTelemetrySnapshot();
    return () => {
      unsubscribeRuntime();
      unsubscribePresentation();
    };
  }, [emitPresentationTelemetrySnapshot, resultsPresentationAuthority, searchRuntimeBus]);
};
