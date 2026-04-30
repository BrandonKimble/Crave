import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';

const RUN_ONE_STALL_PRESSURE_THRESHOLD_MS = 80;

type RunOneHandoffCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

type UseSearchRunOneStallPressureRuntimeArgs = {
  searchMode: 'natural' | 'shortcut' | null;
  getPerfNow: () => number;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  runOneHandoffRuntimeState: ReturnType<
    typeof useSearchFreezeGateStateRuntime
  >['runOneHandoffRuntimeState'];
};

export const useSearchRunOneStallPressureRuntime = ({
  searchMode,
  getPerfNow,
  runOneHandoffCoordinatorRef,
  runOneCommitSpanPressureByOperationRef,
  runOneHandoffRuntimeState,
}: UseSearchRunOneStallPressureRuntimeArgs) => {
  const runOneStallPressureByOperationRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    const opId = runOneHandoffRuntimeState.runOneHandoffOperationId;
    const maxCommitSpanByOperation = runOneCommitSpanPressureByOperationRef.current;
    const maxStallFrameByOperation = runOneStallPressureByOperationRef.current;
    if (!opId) {
      maxCommitSpanByOperation.clear();
      maxStallFrameByOperation.clear();
      return;
    }
    for (const key of maxCommitSpanByOperation.keys()) {
      if (key !== opId) {
        maxCommitSpanByOperation.delete(key);
      }
    }
    for (const key of maxStallFrameByOperation.keys()) {
      if (key !== opId) {
        maxStallFrameByOperation.delete(key);
      }
    }
  }, [runOneCommitSpanPressureByOperationRef, runOneHandoffRuntimeState.runOneHandoffOperationId]);

  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    let rafHandle: number | null = null;
    let microtaskTickCancelled = false;
    let previousFrameAtMs = getPerfNow();
    const activeOperationId = runOneHandoffRuntimeState.runOneHandoffOperationId;
    const activeHandoffPhase = runOneHandoffRuntimeState.runOneHandoffPhase;
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
      const handoffSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      if (!activeOperationId || handoffSnapshot.operationId !== activeOperationId) {
        return;
      }
      const handoffPhase = handoffSnapshot.phase;
      if (handoffPhase !== 'h2_marker_enter' && handoffPhase !== 'h3_hydration_ramp') {
        return;
      }
      if (frameDeltaMs >= RUN_ONE_STALL_PRESSURE_THRESHOLD_MS) {
        const previousMaxStallMs =
          runOneStallPressureByOperationRef.current.get(activeOperationId) ?? 0;
        const nextMaxStallMs = Math.max(previousMaxStallMs, frameDeltaMs);
        if (nextMaxStallMs > previousMaxStallMs) {
          runOneStallPressureByOperationRef.current.set(activeOperationId, nextMaxStallMs);
        }
        if (previousMaxStallMs <= 0) {
          runOneHandoffCoordinatorRef.current.advancePhase(handoffPhase, {
            operationId: activeOperationId,
            stallPressure: true,
            commitSpanPressure: true,
            maxRun1StallFrameMs: Number(nextMaxStallMs.toFixed(1)),
            stallPressureDetectedAtMs: Number(nowMs.toFixed(1)),
            stallPressureSource: 'raf_frame_delta',
          });
        }
      }
      scheduleNextTick();
    };
    if (
      !activeOperationId ||
      (activeHandoffPhase !== 'h2_marker_enter' && activeHandoffPhase !== 'h3_hydration_ramp')
    ) {
      cancelScheduledTick();
      return () => {
        cancelScheduledTick();
      };
    }
    previousFrameAtMs = getPerfNow();
    scheduleNextTick();
    return () => {
      cancelScheduledTick();
    };
  }, [
    getPerfNow,
    runOneCommitSpanPressureByOperationRef,
    runOneHandoffCoordinatorRef,
    runOneHandoffRuntimeState.runOneHandoffOperationId,
    runOneHandoffRuntimeState.runOneHandoffPhase,
    searchMode,
  ]);
};
