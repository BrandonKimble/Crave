import React from 'react';

import type { ExecutionBatchPayload } from './results-presentation-runtime-owner-contract';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import type {
  SearchMapMarkerEnterStartedPayload,
  SearchMapMarkerEnterSettledPayload,
} from './search-map-protocol-contract';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
} from '../surface/search-surface-runtime';

const toExecutionBatchRef = (payload: ExecutionBatchPayload) => {
  if (payload.executionBatchId == null || payload.frameGenerationId == null) {
    return null;
  }

  return {
    batchId: payload.executionBatchId,
    generationId: payload.frameGenerationId,
  };
};

type ExecutionBatchRef = NonNullable<ReturnType<typeof toExecutionBatchRef>>;

export const useResultsPresentationMarkerEnterRuntime = ({
  runtimeMachineRef,
  searchSurfaceRedrawCoordinatorRef,
  flushPendingMarkerEnterSettled,
  setPendingMarkerEnterSettled,
}: {
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  flushPendingMarkerEnterSettled: () => boolean;
  setPendingMarkerEnterSettled: (
    pending: { operationId: string; payload: SearchMapMarkerEnterSettledPayload } | null
  ) => void;
}) => {
  const pendingMarkerEnterStartRef = React.useRef<{
    requestKey: string;
    executionBatch: ExecutionBatchRef;
  } | null>(null);

  const canStartMarkerEnterForSurface = React.useCallback((requestKey: string): boolean => {
    const policy = selectSearchSurfaceVisualPolicy(getSearchSurfaceRuntime().getSnapshot());
    if (policy.phase !== 'results_redrawing' || policy.transactionId !== requestKey) {
      return true;
    }
    return policy.canAdmitResultsBody;
  }, []);

  const flushPendingMarkerEnterStart = React.useCallback((): boolean => {
    const pending = pendingMarkerEnterStartRef.current;
    if (pending == null || pending.executionBatch == null) {
      return false;
    }
    if (!canStartMarkerEnterForSurface(pending.requestKey)) {
      return false;
    }
    pendingMarkerEnterStartRef.current = null;
    return runtimeMachineRef.current!.markEnterNativeStartRequested(
      pending.requestKey,
      pending.executionBatch
    );
  }, [canStartMarkerEnterForSurface, runtimeMachineRef]);

  const handleExecutionBatchMountedHidden = React.useCallback(
    (payload: ExecutionBatchPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      const didAcceptMountedHidden = runtimeMachineRef.current!.markEnterBatchMountedHidden(
        payload.requestKey,
        executionBatch
      );
      if (!didAcceptMountedHidden) {
        return;
      }
      getSearchSurfaceRuntime().markRedrawNativeMarkerFrameReady(payload.requestKey, {
        frameGenerationId: payload.frameGenerationId ?? null,
        executionBatchId: payload.executionBatchId ?? null,
      });
      pendingMarkerEnterStartRef.current = {
        requestKey: payload.requestKey,
        executionBatch,
      };
      flushPendingMarkerEnterStart();
    },
    [flushPendingMarkerEnterStart, runtimeMachineRef]
  );

  const handleMarkerEnterStarted = React.useCallback(
    (payload: SearchMapMarkerEnterStartedPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      if (!canStartMarkerEnterForSurface(payload.requestKey)) {
        pendingMarkerEnterStartRef.current = {
          requestKey: payload.requestKey,
          executionBatch,
        };
        return;
      }
      if (!runtimeMachineRef.current!.markEnterStarted(payload.requestKey, executionBatch)) {
        return;
      }
    },
    [canStartMarkerEnterForSurface, runtimeMachineRef]
  );

  React.useEffect(() => {
    const unsubscribeSurface = getSearchSurfaceRuntime().subscribe(() => {
      flushPendingMarkerEnterStart();
    });
    return () => {
      unsubscribeSurface();
    };
  }, [flushPendingMarkerEnterStart]);

  const handleMarkerEnterSettled = React.useCallback(
    (payload: SearchMapMarkerEnterSettledPayload) => {
      const executionBatch = toExecutionBatchRef(payload);
      if (executionBatch == null) {
        return;
      }
      if (!runtimeMachineRef.current!.markEnterBatchSettled(payload.requestKey, executionBatch)) {
        return;
      }
      const coordinatorSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
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
      searchSurfaceRedrawCoordinatorRef,
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
