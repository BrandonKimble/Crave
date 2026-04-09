import React from 'react';

import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { useResultsPresentationMarkerEnterRuntime } from './use-results-presentation-marker-enter-runtime';
import { useResultsPresentationMarkerExitRuntime } from './use-results-presentation-marker-exit-runtime';

type ResultsPresentationMarkerHandoffRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  | 'handleExecutionBatchMountedHidden'
  | 'handleMarkerEnterStarted'
  | 'handleMarkerEnterSettled'
  | 'handleMarkerExitStarted'
  | 'handleMarkerExitSettled'
>;

export type UseResultsPresentationMarkerHandoffRuntimeArgs = {
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
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
  markExitStarted: (payload: { requestKey: string; startedAtMs: number }) => boolean;
  markExitSettled: (payload: { requestKey: string; settledAtMs: number }) => boolean;
};

export const useResultsPresentationMarkerHandoffRuntime = ({
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  markSearchSheetCloseMapExitSettledRef,
  markEnterBatchMountedHidden,
  markEnterStarted,
  markEnterBatchSettled,
  markExitStarted,
  markExitSettled,
}: UseResultsPresentationMarkerHandoffRuntimeArgs): ResultsPresentationMarkerHandoffRuntime => {
  const markerEnterRuntime = useResultsPresentationMarkerEnterRuntime({
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
    markEnterBatchMountedHidden,
    markEnterStarted,
    markEnterBatchSettled,
  });

  const markerExitRuntime = useResultsPresentationMarkerExitRuntime({
    markSearchSheetCloseMapExitSettledRef,
    markExitStarted,
    markExitSettled,
  });

  return React.useMemo(
    () => ({
      ...markerEnterRuntime,
      ...markerExitRuntime,
    }),
    [markerEnterRuntime, markerExitRuntime]
  );
};
