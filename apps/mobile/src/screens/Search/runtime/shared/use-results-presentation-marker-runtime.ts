import React from 'react';

import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import { useResultsPresentationMarkerEnterRuntime } from './use-results-presentation-marker-enter-runtime';
import { useResultsPresentationMarkerExitRuntime } from './use-results-presentation-marker-exit-runtime';

type UseResultsPresentationMarkerRuntimeArgs = {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
};

export const useResultsPresentationMarkerRuntime = ({
  runtimeMachineRef,
  markSearchSheetCloseMapExitSettledRef,
}: UseResultsPresentationMarkerRuntimeArgs) => {
  // F1735: the marker-enter settle hand-off runtime (redraw-coordinator consumer) is
  // deleted with the coordinator — it could never accept a settle (operationId was
  // always null).
  const markerEnterRuntime = useResultsPresentationMarkerEnterRuntime({
    runtimeMachineRef,
  });
  const markerExitRuntime = useResultsPresentationMarkerExitRuntime({
    runtimeMachineRef,
    markSearchSheetCloseMapExitSettledRef,
  });

  return React.useMemo(
    () => ({
      handleExecutionBatchMountedHidden: markerEnterRuntime.handleExecutionBatchMountedHidden,
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
