import React from 'react';

import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { useResultsPresentationMarkerEnterBatchRuntime } from './use-results-presentation-marker-enter-batch-runtime';
import { useResultsPresentationMarkerEnterSettleBridgeRuntime } from './use-results-presentation-marker-enter-settle-bridge-runtime';

type ResultsPresentationMarkerEnterRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  'handleExecutionBatchMountedHidden' | 'handleMarkerEnterStarted' | 'handleMarkerEnterSettled'
>;

export type UseResultsPresentationMarkerEnterRuntimeArgs = {
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markEnterBatchMountedHidden: (
    requestKey: string,
    executionBatch: {
      batchId: string;
      generationId: string;
    }
  ) => boolean;
  markEnterStarted: (
    requestKey: string,
    executionBatch: { batchId: string; generationId: string } | null
  ) => boolean;
  markEnterBatchSettled: (
    requestKey: string,
    executionBatch: { batchId: string; generationId: string } | null
  ) => boolean;
};

export const useResultsPresentationMarkerEnterRuntime = ({
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  markEnterBatchMountedHidden,
  markEnterStarted,
  markEnterBatchSettled,
}: UseResultsPresentationMarkerEnterRuntimeArgs): ResultsPresentationMarkerEnterRuntime => {
  const markerEnterBatchRuntime = useResultsPresentationMarkerEnterBatchRuntime({
    markEnterBatchMountedHidden,
    markEnterStarted,
    markEnterBatchSettled,
  });

  const markerEnterSettleBridgeRuntime = useResultsPresentationMarkerEnterSettleBridgeRuntime({
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
    acceptMarkerEnterSettled: markerEnterBatchRuntime.acceptMarkerEnterSettled,
  });

  return React.useMemo(
    () => ({
      handleExecutionBatchMountedHidden: markerEnterBatchRuntime.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: markerEnterBatchRuntime.handleMarkerEnterStarted,
      handleMarkerEnterSettled: markerEnterSettleBridgeRuntime.handleMarkerEnterSettled,
    }),
    [
      markerEnterBatchRuntime.handleExecutionBatchMountedHidden,
      markerEnterBatchRuntime.handleMarkerEnterStarted,
      markerEnterSettleBridgeRuntime.handleMarkerEnterSettled,
    ]
  );
};
