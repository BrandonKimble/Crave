import React from 'react';

import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import { useResultsPresentationMarkerEnterRuntime } from './use-results-presentation-marker-enter-runtime';
import { useResultsPresentationMarkerEnterSettleRuntime } from './use-results-presentation-marker-enter-settle-runtime';
import { useResultsPresentationMarkerExitRuntime } from './use-results-presentation-marker-exit-runtime';

type UseResultsPresentationMarkerRuntimeArgs = {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
};

export const useResultsPresentationMarkerRuntime = ({
  runtimeMachineRef,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  markSearchSheetCloseMapExitSettledRef,
}: UseResultsPresentationMarkerRuntimeArgs) => {
  const markerEnterSettleRuntime =
    useResultsPresentationMarkerEnterSettleRuntime({
      runOneHandoffCoordinatorRef,
      emitRuntimeMechanismEvent,
    });
  const markerEnterRuntime = useResultsPresentationMarkerEnterRuntime({
    runtimeMachineRef,
    runOneHandoffCoordinatorRef,
    flushPendingMarkerEnterSettled:
      markerEnterSettleRuntime.flushPendingMarkerEnterSettled,
    setPendingMarkerEnterSettled:
      markerEnterSettleRuntime.setPendingMarkerEnterSettled,
  });
  const markerExitRuntime = useResultsPresentationMarkerExitRuntime({
    runtimeMachineRef,
    markSearchSheetCloseMapExitSettledRef,
  });

  return React.useMemo(
    () => ({
      handleExecutionBatchMountedHidden:
        markerEnterRuntime.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: markerEnterRuntime.handleMarkerEnterStarted,
      handleMarkerEnterSettled: markerEnterRuntime.handleMarkerEnterSettled,
      handleMarkerExitStarted: markerExitRuntime.handleMarkerExitStarted,
      handleMarkerExitSettled: markerExitRuntime.handleMarkerExitSettled,
    }),
    [
      markerEnterRuntime.handleExecutionBatchMountedHidden,
      markerEnterRuntime.handleMarkerEnterSettled,
      markerEnterRuntime.handleMarkerEnterStarted,
      markerExitRuntime.handleMarkerExitSettled,
      markerExitRuntime.handleMarkerExitStarted,
    ]
  );
};
