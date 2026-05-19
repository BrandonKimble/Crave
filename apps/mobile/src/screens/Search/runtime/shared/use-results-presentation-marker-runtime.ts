import React from 'react';

import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import { useResultsPresentationMarkerEnterRuntime } from './use-results-presentation-marker-enter-runtime';
import { useResultsPresentationMarkerEnterSettleRuntime } from './use-results-presentation-marker-enter-settle-runtime';
import { useResultsPresentationMarkerExitRuntime } from './use-results-presentation-marker-exit-runtime';

type UseResultsPresentationMarkerRuntimeArgs = {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
};

export const useResultsPresentationMarkerRuntime = ({
  runtimeMachineRef,
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
  markSearchSheetCloseMapExitSettledRef,
}: UseResultsPresentationMarkerRuntimeArgs) => {
  const markerEnterSettleRuntime = useResultsPresentationMarkerEnterSettleRuntime({
    searchSurfaceRedrawCoordinatorRef,
    emitRuntimeMechanismEvent,
  });
  const markerEnterRuntime = useResultsPresentationMarkerEnterRuntime({
    runtimeMachineRef,
    searchSurfaceRedrawCoordinatorRef,
    flushPendingMarkerEnterSettled: markerEnterSettleRuntime.flushPendingMarkerEnterSettled,
    setPendingMarkerEnterSettled: markerEnterSettleRuntime.setPendingMarkerEnterSettled,
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
