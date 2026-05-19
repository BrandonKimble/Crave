import React from 'react';

const RUN_ONE_STALL_PRESSURE_THRESHOLD_MS = 80;

type SearchSurfaceRedrawCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

type UseSearchSearchSurfaceRedrawStallPressureRuntimeArgs = {
  searchMode: 'natural' | 'shortcut' | null;
  getPerfNow: () => number;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
};

export const useSearchSurfaceRedrawStallPressureRuntime = ({
  searchMode,
  getPerfNow,
  searchSurfaceRedrawCoordinatorRef,
  searchSurfaceRedrawCommitSpanPressureByOperationRef,
}: UseSearchSearchSurfaceRedrawStallPressureRuntimeArgs) => {
  const searchSurfaceRedrawStallPressureByOperationRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    let rafHandle: number | null = null;
    let microtaskTickCancelled = false;
    let previousFrameAtMs = getPerfNow();
    const cancelScheduledTick = () => {
      if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      microtaskTickCancelled = true;
    };
    const scheduleNextTick = () => {
      if (typeof requestAnimationFrame === 'function') {
        rafHandle = requestAnimationFrame(() => {
          rafHandle = null;
          tick();
        });
        return;
      }
      microtaskTickCancelled = false;
      queueMicrotask(() => {
        if (microtaskTickCancelled) {
          return;
        }
        tick();
      });
    };
    const tick = () => {
      const nowMs = getPerfNow();
      const frameDeltaMs = Math.max(0, nowMs - previousFrameAtMs);
      previousFrameAtMs = nowMs;
      const handoffSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
      const activeOperationId = handoffSnapshot.operationId;
      const maxCommitSpanByOperation = searchSurfaceRedrawCommitSpanPressureByOperationRef.current;
      const maxStallFrameByOperation = searchSurfaceRedrawStallPressureByOperationRef.current;
      if (!activeOperationId) {
        maxCommitSpanByOperation.clear();
        maxStallFrameByOperation.clear();
        scheduleNextTick();
        return;
      }
      for (const key of maxCommitSpanByOperation.keys()) {
        if (key !== activeOperationId) {
          maxCommitSpanByOperation.delete(key);
        }
      }
      for (const key of maxStallFrameByOperation.keys()) {
        if (key !== activeOperationId) {
          maxStallFrameByOperation.delete(key);
        }
      }
      const handoffPhase = handoffSnapshot.phase;
      if (handoffPhase !== 'markers_ready' && handoffPhase !== 'hydration_ready') {
        scheduleNextTick();
        return;
      }
      if (frameDeltaMs >= RUN_ONE_STALL_PRESSURE_THRESHOLD_MS) {
        const previousMaxStallMs =
          searchSurfaceRedrawStallPressureByOperationRef.current.get(activeOperationId) ?? 0;
        const nextMaxStallMs = Math.max(previousMaxStallMs, frameDeltaMs);
        if (nextMaxStallMs > previousMaxStallMs) {
          searchSurfaceRedrawStallPressureByOperationRef.current.set(activeOperationId, nextMaxStallMs);
        }
        if (previousMaxStallMs <= 0) {
          searchSurfaceRedrawCoordinatorRef.current.advancePhase(handoffPhase, {
            operationId: activeOperationId,
            stallPressure: true,
            commitSpanPressure: true,
            maxSearchSurfaceRedrawStallFrameMs: Number(nextMaxStallMs.toFixed(1)),
            stallPressureDetectedAtMs: Number(nowMs.toFixed(1)),
            stallPressureSource: 'raf_frame_delta',
          });
        }
      }
      scheduleNextTick();
    };
    previousFrameAtMs = getPerfNow();
    scheduleNextTick();
    return () => {
      cancelScheduledTick();
    };
  }, [getPerfNow, searchSurfaceRedrawCommitSpanPressureByOperationRef, searchSurfaceRedrawCoordinatorRef, searchMode]);
};
