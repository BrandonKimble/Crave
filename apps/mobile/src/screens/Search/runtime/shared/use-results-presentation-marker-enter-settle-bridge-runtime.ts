import React from 'react';

import type {
  MarkerEnterSettledPayload,
  ResultsPresentationRuntimeOwner,
} from './results-presentation-runtime-owner-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';

type ResultsPresentationMarkerEnterSettleBridgeRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  'handleMarkerEnterSettled'
>;

export type UseResultsPresentationMarkerEnterSettleBridgeRuntimeArgs = {
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  acceptMarkerEnterSettled: (payload: MarkerEnterSettledPayload) => boolean;
};

export const useResultsPresentationMarkerEnterSettleBridgeRuntime = ({
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  acceptMarkerEnterSettled,
}: UseResultsPresentationMarkerEnterSettleBridgeRuntimeArgs): ResultsPresentationMarkerEnterSettleBridgeRuntime => {
  const pendingMarkerEnterSettledRef = React.useRef<{
    operationId: string;
    payload: MarkerEnterSettledPayload;
  } | null>(null);

  const flushPendingMarkerEnterSettled = React.useCallback((): boolean => {
    const pending = pendingMarkerEnterSettledRef.current;
    if (!pending) {
      return false;
    }
    const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
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
      coordinatorSnapshot.phase !== 'h2_marker_enter' &&
      coordinatorSnapshot.phase !== 'h3_hydration_ramp'
    ) {
      return false;
    }
    pendingMarkerEnterSettledRef.current = null;
    const accepted = runOneHandoffCoordinatorRef.current.advancePhase(coordinatorSnapshot.phase, {
      operationId,
      markerEnterSettled: true,
      markerEnterSettledAtMs: pending.payload.settledAtMs,
      markerEnterCommitId: pending.payload.markerEnterCommitId,
      requestKey: pending.payload.requestKey,
    });
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
  }, [emitRuntimeMechanismEvent, runOneHandoffCoordinatorRef]);

  React.useEffect(() => {
    return runOneHandoffCoordinatorRef.current.subscribe(() => {
      flushPendingMarkerEnterSettled();
    });
  }, [flushPendingMarkerEnterSettled, runOneHandoffCoordinatorRef]);

  const handleMarkerEnterSettled = React.useCallback(
    (payload: MarkerEnterSettledPayload) => {
      if (!acceptMarkerEnterSettled(payload)) {
        return;
      }
      const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      const operationId = coordinatorSnapshot.operationId;
      if (!operationId || coordinatorSnapshot.phase === 'idle') {
        pendingMarkerEnterSettledRef.current = null;
        return;
      }
      pendingMarkerEnterSettledRef.current = {
        operationId,
        payload,
      };
      flushPendingMarkerEnterSettled();
    },
    [acceptMarkerEnterSettled, flushPendingMarkerEnterSettled, runOneHandoffCoordinatorRef]
  );

  return React.useMemo(
    () => ({
      handleMarkerEnterSettled,
    }),
    [handleMarkerEnterSettled]
  );
};
