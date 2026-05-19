import React from 'react';

import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import type { MarkerEnterSettledPayload } from './results-presentation-runtime-owner-contract';

export const useResultsPresentationMarkerEnterSettleRuntime = ({
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
}: {
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
}) => {
  const pendingMarkerEnterSettledRef = React.useRef<{
    operationId: string;
    payload: MarkerEnterSettledPayload;
  } | null>(null);

  const flushPendingMarkerEnterSettled = React.useCallback((): boolean => {
    const pending = pendingMarkerEnterSettledRef.current;
    if (!pending) {
      return false;
    }
    const coordinatorSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
    const operationId = coordinatorSnapshot.operationId;
    if (!operationId || coordinatorSnapshot.phase === 'idle') {
      pendingMarkerEnterSettledRef.current = null;
      return false;
    }
    if (operationId !== pending.operationId) {
      pendingMarkerEnterSettledRef.current = null;
      return false;
    }
    if (
      coordinatorSnapshot.phase !== 'markers_ready' &&
      coordinatorSnapshot.phase !== 'hydration_ready'
    ) {
      return false;
    }
    pendingMarkerEnterSettledRef.current = null;
    const accepted = searchSurfaceRedrawCoordinatorRef.current.advancePhase(
      coordinatorSnapshot.phase,
      {
        operationId,
        markerEnterSettled: true,
        markerEnterSettledAtMs: pending.payload.settledAtMs,
        markerEnterCommitId: pending.payload.markerEnterCommitId,
        requestKey: pending.payload.requestKey,
      }
    );
    if (!accepted) {
      pendingMarkerEnterSettledRef.current = pending;
      return false;
    }
    emitRuntimeMechanismEvent('marker_enter_settled', {
      operationId,
      seq: coordinatorSnapshot.seq,
      page: coordinatorSnapshot.page,
      phase: coordinatorSnapshot.phase,
      requestKey: pending.payload.requestKey,
      markerEnterCommitId: pending.payload.markerEnterCommitId,
    });
    return true;
  }, [emitRuntimeMechanismEvent, searchSurfaceRedrawCoordinatorRef]);

  React.useEffect(() => {
    return searchSurfaceRedrawCoordinatorRef.current.subscribe(() => {
      flushPendingMarkerEnterSettled();
    });
  }, [flushPendingMarkerEnterSettled, searchSurfaceRedrawCoordinatorRef]);

  const setPendingMarkerEnterSettled = React.useCallback(
    (pending: { operationId: string; payload: MarkerEnterSettledPayload } | null) => {
      pendingMarkerEnterSettledRef.current = pending;
    },
    []
  );

  return {
    flushPendingMarkerEnterSettled,
    setPendingMarkerEnterSettled,
  };
};
