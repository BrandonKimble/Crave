import React from 'react';

import { logger } from '../../../../utils';
import {
  areResultsPresentationReadModelsEqual,
  type ResultsPresentationReadModel,
} from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

const RUN_ONE_STALL_PRESSURE_THRESHOLD_MS = 80;

type SearchFreezeGateSnapshot = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
  runOneHandoffPhase: ReturnType<SearchRuntimeBus['getState']>['runOneHandoffPhase'];
  resultsPresentation: ResultsPresentationReadModel;
};

type RunOneHandoffCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

type UseSearchFreezeGateRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
  searchMode: 'natural' | 'shortcut' | null;
  getPerfNow: () => number;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
};

type UseSearchFreezeGateRuntimeResult = {
  isRunOneChromeFreezeActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRun1HandoffActive: boolean;
  isResponseFrameFreezeActive: boolean;
};

export const useSearchFreezeGateRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
  searchMode,
  getPerfNow,
  runOneHandoffCoordinatorRef,
  runOneCommitSpanPressureByOperationRef,
}: UseSearchFreezeGateRuntimeArgs): UseSearchFreezeGateRuntimeResult => {
  const previousResultsRequestKeyRef = React.useRef<string | null>(resultsRequestKey);
  const isResponseFrameFreezeMountedRef = React.useRef(true);
  const responseFrameFreezeHandleRef = React.useRef<number | null>(null);
  const responseFrameFreezeMicrotaskReleaseRef = React.useRef(false);
  const clearResponseFrameFreezeHandle = React.useCallback(() => {
    const handle = responseFrameFreezeHandleRef.current;
    if (handle == null) {
      responseFrameFreezeMicrotaskReleaseRef.current = false;
    } else if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle);
    }
    responseFrameFreezeHandleRef.current = null;
    responseFrameFreezeMicrotaskReleaseRef.current = false;
  }, []);

  React.useLayoutEffect(() => {
    if (!resultsRequestKey) {
      previousResultsRequestKeyRef.current = null;
      return;
    }
    const shouldFreezeOnResponseCommitFrame =
      resultsRequestKey !== previousResultsRequestKeyRef.current;
    if (!shouldFreezeOnResponseCommitFrame) {
      return;
    }
    previousResultsRequestKeyRef.current = resultsRequestKey;
    clearResponseFrameFreezeHandle();
    searchRuntimeBus.publish({ isResponseFrameFreezeActive: true });
    const releaseFreeze = () => {
      responseFrameFreezeHandleRef.current = null;
      if (!isResponseFrameFreezeMountedRef.current) {
        return;
      }
      searchRuntimeBus.publish({ isResponseFrameFreezeActive: false });
    };
    if (typeof requestAnimationFrame === 'function') {
      responseFrameFreezeHandleRef.current = requestAnimationFrame(() => {
        releaseFreeze();
      });
      return;
    }
    responseFrameFreezeMicrotaskReleaseRef.current = true;
    queueMicrotask(() => {
      if (!responseFrameFreezeMicrotaskReleaseRef.current) {
        return;
      }
      responseFrameFreezeMicrotaskReleaseRef.current = false;
      releaseFreeze();
    });
  }, [clearResponseFrameFreezeHandle, resultsRequestKey, searchRuntimeBus]);

  React.useEffect(
    () => () => {
      isResponseFrameFreezeMountedRef.current = false;
      clearResponseFrameFreezeHandle();
    },
    [clearResponseFrameFreezeHandle]
  );

  const freezeGateState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      isRunOneChromeFreezeActive: state.isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive: state.isRunOnePreflightFreezeActive,
      isRun1HandoffActive: state.isRun1HandoffActive,
      isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
    }),
    (left, right) =>
      left.isRunOneChromeFreezeActive === right.isRunOneChromeFreezeActive &&
      left.isRunOnePreflightFreezeActive === right.isRunOnePreflightFreezeActive &&
      left.isRun1HandoffActive === right.isRun1HandoffActive &&
      left.isResponseFrameFreezeActive === right.isResponseFrameFreezeActive,
    [
      'isRunOneChromeFreezeActive',
      'isRunOnePreflightFreezeActive',
      'isRun1HandoffActive',
      'isResponseFrameFreezeActive',
    ] as const
  );
  const {
    isRunOneChromeFreezeActive,
    isRunOnePreflightFreezeActive,
    isRun1HandoffActive,
    isResponseFrameFreezeActive,
  } = freezeGateState;

  const runOneHandoffRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffOperationId: state.runOneHandoffOperationId,
      runOneHandoffPhase: state.runOneHandoffPhase,
    }),
    (left, right) =>
      left.runOneHandoffOperationId === right.runOneHandoffOperationId &&
      left.runOneHandoffPhase === right.runOneHandoffPhase,
    ['runOneHandoffOperationId', 'runOneHandoffPhase'] as const
  );
  const freezeGateRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffPhase: state.runOneHandoffPhase,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(left.resultsPresentation, right.resultsPresentation),
    ['runOneHandoffPhase', 'resultsPresentation'] as const
  );

  const freezeGateDiagRef = React.useRef<SearchFreezeGateSnapshot | null>(null);
  const runOneStallPressureByOperationRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    const nextSnapshot: SearchFreezeGateSnapshot = {
      isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive,
      isRun1HandoffActive,
      isResponseFrameFreezeActive,
      runOneHandoffPhase: freezeGateRuntimeState.runOneHandoffPhase,
      resultsPresentation: freezeGateRuntimeState.resultsPresentation,
    };
    const previousSnapshot = freezeGateDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.isRunOneChromeFreezeActive === nextSnapshot.isRunOneChromeFreezeActive &&
      previousSnapshot.isRunOnePreflightFreezeActive ===
        nextSnapshot.isRunOnePreflightFreezeActive &&
      previousSnapshot.isRun1HandoffActive === nextSnapshot.isRun1HandoffActive &&
      previousSnapshot.isResponseFrameFreezeActive === nextSnapshot.isResponseFrameFreezeActive &&
      previousSnapshot.runOneHandoffPhase === nextSnapshot.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(
        previousSnapshot.resultsPresentation,
        nextSnapshot.resultsPresentation
      )
    ) {
      return;
    }
    logger.debug('[SEARCH-FREEZE-DIAG] freezeGate', nextSnapshot);
    freezeGateDiagRef.current = nextSnapshot;
  }, [
    freezeGateRuntimeState.resultsPresentation,
    freezeGateRuntimeState.runOneHandoffPhase,
    isRun1HandoffActive,
    isResponseFrameFreezeActive,
    isRunOneChromeFreezeActive,
    isRunOnePreflightFreezeActive,
  ]);

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

  return React.useMemo(
    () => ({
      isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive,
      isRun1HandoffActive,
      isResponseFrameFreezeActive,
    }),
    [
      isResponseFrameFreezeActive,
      isRun1HandoffActive,
      isRunOneChromeFreezeActive,
      isRunOnePreflightFreezeActive,
    ]
  );
};
