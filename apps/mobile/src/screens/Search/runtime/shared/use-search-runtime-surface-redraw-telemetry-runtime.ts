import React from 'react';

import { isSearchSurfaceRedrawDeferredChromePhase } from '../controller/search-surface-redraw-phase';
import type { SearchSurfaceRedrawCoordinatorLike } from './use-search-runtime-instrumentation-runtime-contract';

type UseSearchRuntimeSearchSurfaceRedrawTelemetryRuntimeArgs = {
  getActiveScenarioRunNumber: () => number | null;
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
};

export const useSearchRuntimeSearchSurfaceRedrawTelemetryRuntime = ({
  getActiveScenarioRunNumber,
  emitRuntimeMechanismEvent,
  searchSurfaceRedrawCoordinatorRef,
}: UseSearchRuntimeSearchSurfaceRedrawTelemetryRuntimeArgs): void => {
  const previousSearchSurfaceRedrawPhaseRef = React.useRef(
    searchSurfaceRedrawCoordinatorRef.current.getSnapshot().phase
  );
  React.useEffect(() => {
    const coordinator = searchSurfaceRedrawCoordinatorRef.current;
    return coordinator.subscribe((coordinatorSnapshot) => {
      if (coordinatorSnapshot.phase === previousSearchSurfaceRedrawPhaseRef.current) {
        return;
      }
      previousSearchSurfaceRedrawPhaseRef.current = coordinatorSnapshot.phase;
      const activeRunNumber = getActiveScenarioRunNumber();
      if (activeRunNumber == null) {
        return;
      }
      emitRuntimeMechanismEvent('run_one_handoff_phase', {
        source: 'coordinator_snapshot',
        phase: coordinatorSnapshot.phase,
        operationId: coordinatorSnapshot.operationId,
        seq: coordinatorSnapshot.seq,
        page: coordinatorSnapshot.page,
        isSearchSurfaceRedrawActive: coordinatorSnapshot.phase !== 'idle',
        isChromeDeferred: isSearchSurfaceRedrawDeferredChromePhase(coordinatorSnapshot.phase),
      });
    });
  }, [
    emitRuntimeMechanismEvent,
    getActiveScenarioRunNumber,
    searchSurfaceRedrawCoordinatorRef,
  ]);
};
