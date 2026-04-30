import React from 'react';

import type {
  ExecutionBatchPayload,
  MarkerEnterSettledPayload,
} from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';

const toExecutionBatchRef = (payload: ExecutionBatchPayload) => {
  if (payload.executionBatchId == null || payload.frameGenerationId == null) {
    return null;
  }

  return {
    batchId: payload.executionBatchId,
    generationId: payload.frameGenerationId,
  };
};

export const useResultsPresentationMarkerEnterRuntime = ({
  runtimeMachineRef,
  runOneHandoffCoordinatorRef,
  flushPendingMarkerEnterSettled,
  setPendingMarkerEnterSettled,
}: {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  flushPendingMarkerEnterSettled: () => boolean;
  setPendingMarkerEnterSettled: (
    pending: { operationId: string; payload: MarkerEnterSettledPayload } | null
  ) => void;
}) => {
  const handleExecutionBatchMountedHidden = React.useCallback(
    (payload: ExecutionBatchPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      runtimeMachineRef.current!.markEnterBatchMountedHidden(
        payload.requestKey,
        executionBatch
      );
    },
    [runtimeMachineRef]
  );

  const handleMarkerEnterStarted = React.useCallback(
    (payload: ExecutionBatchPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      runtimeMachineRef.current!.markEnterStarted(payload.requestKey, executionBatch);
    },
    [runtimeMachineRef]
  );

  const handleMarkerEnterSettled = React.useCallback(
    (payload: MarkerEnterSettledPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      if (!runtimeMachineRef.current!.markEnterBatchSettled(payload.requestKey, executionBatch)) {
        return;
      }
      const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      const operationId = coordinatorSnapshot.operationId;
      if (!operationId || coordinatorSnapshot.phase === 'idle') {
        setPendingMarkerEnterSettled(null);
        return;
      }
      setPendingMarkerEnterSettled({
        operationId,
        payload,
      });
      flushPendingMarkerEnterSettled();
    },
    [
      flushPendingMarkerEnterSettled,
      runOneHandoffCoordinatorRef,
      runtimeMachineRef,
      setPendingMarkerEnterSettled,
    ]
  );

  return {
    handleExecutionBatchMountedHidden,
    handleMarkerEnterStarted,
    handleMarkerEnterSettled,
  };
};
