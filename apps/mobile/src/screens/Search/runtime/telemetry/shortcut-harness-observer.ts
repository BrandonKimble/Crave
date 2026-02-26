import React from 'react';

import perfHarnessConfig from '../../../../perf/harness-config';
import { startJsFrameSampler } from '../../../../perf/js-frame-sampler';
import { startUiFrameSampler } from '../../../../perf/ui-frame-sampler';
import type { NaturalSearchRequest } from '../../../../types';
import type { SearchSessionController } from '../controller/search-session-controller';
import type { RuntimeWorkScheduler } from '../scheduler/runtime-work-scheduler';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type HarnessMechanismEvent =
  | 'shortcut_harness_settle_eval'
  | 'shortcut_harness_observer_render_bump';

type RuntimeMechanismEvent =
  | 'query_mutation_coalesced'
  | 'profile_intent_cancelled'
  | 'run_one_handoff_phase'
  | 'marker_reveal_settled'
  | 'handoff_phase_violation'
  | 'submit_write_bucket'
  | 'runtime_write_span';

type SubmitShortcutSearchRef = React.MutableRefObject<
  (input: {
    targetTab: 'dishes' | 'restaurants';
    label: string;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    scoreMode: NaturalSearchRequest['scoreMode'];
  }) => Promise<void>
>;

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type MapQueryBudgetLike = {
  resetRun: () => void;
  snapshot: () => Record<string, unknown>;
};

type ShortcutProfilerSpanRecord = {
  runNumber: number;
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  stageHint: string | null;
  actualDurationMs: number;
  commitSpanMs: number;
  startMs: number;
  endMs: number;
  nowMs: number;
};

type ShortcutProfilerWindowOwner = {
  componentId: string;
  overlapMs: number;
  maxCommitSpanMs: number;
  spanCount: number;
};

const SHORTCUT_PROFILER_SPAN_MAX_BUFFER = 2000;
const SHORTCUT_WINDOW_OWNER_LIMIT = 3;

type UseShortcutHarnessObserverArgs = {
  getPerfNow: () => number;
  roundPerfValue: (value: number) => number;
  searchSessionController: SearchSessionController;
  submitShortcutSearchRef: SubmitShortcutSearchRef;
  scoreMode: NaturalSearchRequest['scoreMode'];
  setPreferredScoreMode: (scoreMode: NonNullable<NaturalSearchRequest['scoreMode']>) => void;
  mapQueryBudget: MapQueryBudgetLike | null;
  searchMode: 'natural' | 'shortcut' | null;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isRunOneHandoffActive: boolean;
  resultsRequestKey: string | null;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  isSearchOverlay: boolean;
  isInitialCameraReady: boolean;
  runTimeoutMs: number;
  settleQuietPeriodMs: number;
  searchRuntimeBus?: SearchRuntimeBus;
  runtimeWorkSchedulerRef?: React.MutableRefObject<RuntimeWorkScheduler>;
};

type UseShortcutHarnessObserverResult = {
  isShortcutPerfHarnessScenario: boolean;
  shortcutHarnessRunId: string;
  getActiveShortcutRunNumber: () => number | null;
  recordProfilerSpan: (payload: {
    id: string;
    phase: 'mount' | 'update' | 'nested-update';
    stageHint: string | null;
    actualDurationMs: number;
    commitSpanMs: number;
    startTimeMs: number;
    commitTimeMs: number;
    nowMs: number;
    runNumber: number;
  }) => void;
  emitHarnessMechanismEvent: (
    event: HarnessMechanismEvent,
    payload?: Record<string, unknown>
  ) => void;
  emitRuntimeMechanismEvent: (
    event: RuntimeMechanismEvent,
    payload?: Record<string, unknown>
  ) => void;
};

export const useShortcutHarnessObserver = (
  args: UseShortcutHarnessObserverArgs
): UseShortcutHarnessObserverResult => {
  const {
    getPerfNow,
    roundPerfValue,
    searchSessionController,
    submitShortcutSearchRef,
    scoreMode,
    setPreferredScoreMode,
    mapQueryBudget,
    searchMode,
    isSearchLoading,
    isLoadingMore,
    isRunOneHandoffActive,
    resultsRequestKey,
    searchInteractionRef,
    isSearchOverlay,
    isInitialCameraReady,
    runTimeoutMs,
    settleQuietPeriodMs,
    searchRuntimeBus,
    runtimeWorkSchedulerRef,
  } = args;

  const results = useSearchRuntimeBusSelector(
    searchRuntimeBus!,
    (state) => state.results,
    Object.is,
    ['results'] as const
  );

  const {
    visibleSortedRestaurantMarkersCount,
    visibleDotRestaurantFeaturesCount,
    isShortcutCoverageLoading,
  } = useSearchRuntimeBusSelector(
    searchRuntimeBus!,
    (state) => ({
      visibleSortedRestaurantMarkersCount: state.visibleSortedRestaurantMarkersCount,
      visibleDotRestaurantFeaturesCount: state.visibleDotRestaurantFeaturesCount,
      isShortcutCoverageLoading: state.isShortcutCoverageLoading,
    }),
    (left, right) =>
      left.visibleSortedRestaurantMarkersCount === right.visibleSortedRestaurantMarkersCount &&
      left.visibleDotRestaurantFeaturesCount === right.visibleDotRestaurantFeaturesCount &&
      left.isShortcutCoverageLoading === right.isShortcutCoverageLoading,
    [
      'visibleSortedRestaurantMarkersCount',
      'visibleDotRestaurantFeaturesCount',
      'isShortcutCoverageLoading',
    ] as const
  );

  const { isVisualSyncPending, shouldHydrateResultsForRender } = useSearchRuntimeBusSelector(
    searchRuntimeBus!,
    (state) => ({
      isVisualSyncPending: state.isVisualSyncPending,
      shouldHydrateResultsForRender: state.shouldHydrateResultsForRender,
    }),
    (left, right) =>
      left.isVisualSyncPending === right.isVisualSyncPending &&
      left.shouldHydrateResultsForRender === right.shouldHydrateResultsForRender,
    ['isVisualSyncPending', 'shouldHydrateResultsForRender'] as const
  );

  const isShortcutPerfHarnessScenario =
    perfHarnessConfig.enabled && perfHarnessConfig.scenario === 'search_shortcut_loop';
  const shortcutHarnessRunId = perfHarnessConfig.runId ?? 'shortcut-loop-no-run-id';

  const emitSearchPerfEvent = React.useCallback(
    (
      channel: 'Harness' | 'JsFrameSampler' | 'UiFrameSampler',
      payload: Record<string, unknown>
    ) => {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf][${channel}] ${JSON.stringify(payload)}`);
    },
    []
  );

  const emitRuntimeMechanismEvent = React.useCallback(
    (event: RuntimeMechanismEvent, payload: Record<string, unknown> = {}) => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      const activeRunNumber = shortcutHarnessLifecycleRef.current.inProgress
        ? shortcutHarnessLifecycleRef.current.runNumber
        : null;
      emitSearchPerfEvent('Harness', {
        event,
        mechanismSource: 'runtime',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(getPerfNow()),
        runNumber: activeRunNumber,
        ...payload,
      });
    },
    [
      emitSearchPerfEvent,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      roundPerfValue,
      shortcutHarnessRunId,
    ]
  );

  const emitHarnessMechanismEvent = React.useCallback(
    (event: HarnessMechanismEvent, payload: Record<string, unknown> = {}) => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      emitSearchPerfEvent('Harness', {
        event,
        mechanismSource: 'harness',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(getPerfNow()),
        ...payload,
      });
    },
    [
      emitSearchPerfEvent,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      roundPerfValue,
      shortcutHarnessRunId,
    ]
  );
  const shortcutPerfTraceRef = React.useRef<{
    sessionId: number | null;
    sessionStartedAtMs: number | null;
    stage: string | null;
    stageStartedAtMs: number | null;
  }>({
    sessionId: null,
    sessionStartedAtMs: null,
    stage: null,
    stageStartedAtMs: null,
  });

  const shortcutHarnessLifecycleRef = React.useRef<{
    bootstrapped: boolean;
    loopCompleteEmitted: boolean;
    runNumber: number;
    completedRuns: number;
    runStartedAtMs: number;
    settleCandidateAtMs: number;
    settleCandidateRequestKey: string | null;
    settleCandidateVisibleCount: number;
    settleCandidateVisiblePinCount: number;
    settleCandidateVisibleDotCount: number;
    observedLoading: boolean;
    responseObserved: boolean;
    runStartRequestKey: string | null;
    inProgress: boolean;
    launchHandle: ReturnType<typeof setTimeout> | null;
    cooldownHandle: ReturnType<typeof setTimeout> | null;
    runTimeoutHandle: ReturnType<typeof setTimeout> | null;
    settleCheckHandle: ReturnType<typeof setTimeout> | null;
  }>({
    bootstrapped: false,
    loopCompleteEmitted: false,
    runNumber: 0,
    completedRuns: 0,
    runStartedAtMs: 0,
    settleCandidateAtMs: 0,
    settleCandidateRequestKey: null,
    settleCandidateVisibleCount: 0,
    settleCandidateVisiblePinCount: 0,
    settleCandidateVisibleDotCount: 0,
    observedLoading: false,
    responseObserved: false,
    runStartRequestKey: null,
    inProgress: false,
    launchHandle: null,
    cooldownHandle: null,
    runTimeoutHandle: null,
    settleCheckHandle: null,
  });
  const getActiveShortcutRunNumber = React.useCallback((): number | null => {
    const lifecycle = shortcutHarnessLifecycleRef.current;
    if (!lifecycle.inProgress || lifecycle.runNumber <= 0) {
      return null;
    }
    return lifecycle.runNumber;
  }, []);
  const schedulerPressureBaselineRef = React.useRef<ReturnType<
    RuntimeWorkScheduler['snapshotPressure']
  > | null>(null);
  const shortcutProfilerSpanBufferRef = React.useRef<ShortcutProfilerSpanRecord[]>([]);

  const shortcutHarnessSnapshotRef = React.useRef<{
    isSearchLoading: boolean;
    isVisualSyncPending: boolean;
    finalStage: string | null;
    finalVisibleCount: number;
    finalSectionedCount: number;
    finalVisiblePinCount: number;
    finalVisibleDotCount: number;
    finalRequestKey: string | null;
  }>({
    isSearchLoading,
    isVisualSyncPending,
    finalStage: null,
    finalVisibleCount: 0,
    finalSectionedCount: 0,
    finalVisiblePinCount: 0,
    finalVisibleDotCount: 0,
    finalRequestKey: resultsRequestKey,
  });
  const shortcutShadowStateForStageRef = React.useRef(searchSessionController.getState());
  const harnessInputsRef = React.useRef({
    searchMode,
    isSearchLoading,
    isLoadingMore,
    isVisualSyncPending,
    isShortcutCoverageLoading,
    shouldHydrateResultsForRender,
    isRunOneHandoffActive,
    hasResults: Boolean(results),
    activeOperationId: searchRuntimeBus?.getState().activeOperationId ?? null,
    activeOperationLane: searchRuntimeBus?.getState().activeOperationLane ?? 'idle',
    isResultsHydrationSettled: searchRuntimeBus?.getState().isResultsHydrationSettled ?? true,
  });

  const resolveShortcutDerivedStage = React.useCallback(() => {
    const inputs = harnessInputsRef.current;
    const shadowState = shortcutShadowStateForStageRef.current;
    const lifecycle = shortcutHarnessLifecycleRef.current;
    if (!lifecycle.inProgress) {
      return null;
    }
    if (inputs.searchMode !== 'shortcut') {
      return 'pre_response_activation';
    }
    const shortcutShadowSettledForStage =
      shadowState.phase === 'settled' && shadowState.lastEventType === 'settled';
    if (
      shortcutShadowSettledForStage &&
      !inputs.isLoadingMore &&
      !inputs.isSearchLoading &&
      !inputs.isVisualSyncPending &&
      !inputs.shouldHydrateResultsForRender
    ) {
      return 'results_list_ramp';
    }
    if (inputs.isVisualSyncPending) {
      return 'visual_sync_state';
    }
    if (inputs.shouldHydrateResultsForRender) {
      return 'results_hydration_commit';
    }
    if (inputs.isShortcutCoverageLoading) {
      return 'coverage_loading';
    }
    if (inputs.hasResults) {
      return 'results_list_ramp';
    }
    if (inputs.isSearchLoading) {
      return 'results_list_materialization';
    }
    return 'pre_response_activation';
  }, []);

  const syncShortcutTraceStage = React.useCallback(() => {
    const nextStage = resolveShortcutDerivedStage();
    const trace = shortcutPerfTraceRef.current;
    if (trace.stage === nextStage) {
      return;
    }
    trace.stage = nextStage;
    trace.stageStartedAtMs = nextStage ? getPerfNow() : null;
  }, [getPerfNow, resolveShortcutDerivedStage]);

  React.useEffect(() => {
    const runtimeState = searchRuntimeBus?.getState();
    harnessInputsRef.current = {
      searchMode,
      isSearchLoading,
      isLoadingMore,
      isVisualSyncPending,
      isShortcutCoverageLoading,
      shouldHydrateResultsForRender,
      isRunOneHandoffActive,
      hasResults: Boolean(results),
      activeOperationId: runtimeState?.activeOperationId ?? null,
      activeOperationLane: runtimeState?.activeOperationLane ?? 'idle',
      isResultsHydrationSettled: runtimeState?.isResultsHydrationSettled ?? true,
    };
    syncShortcutTraceStage();
  }, [
    isLoadingMore,
    isSearchLoading,
    isShortcutCoverageLoading,
    isVisualSyncPending,
    results,
    searchMode,
    shouldHydrateResultsForRender,
    isRunOneHandoffActive,
    searchRuntimeBus,
    syncShortcutTraceStage,
  ]);

  React.useEffect(() => {
    const finalVisibleCount = (results?.dishes?.length ?? 0) + (results?.restaurants?.length ?? 0);
    shortcutHarnessSnapshotRef.current = {
      isSearchLoading,
      isVisualSyncPending,
      finalStage: shortcutPerfTraceRef.current.stage,
      finalVisibleCount,
      finalSectionedCount: finalVisibleCount,
      finalVisiblePinCount: visibleSortedRestaurantMarkersCount,
      finalVisibleDotCount: visibleDotRestaurantFeaturesCount,
      finalRequestKey: resultsRequestKey,
    };
  }, [
    isSearchLoading,
    isVisualSyncPending,
    results?.dishes?.length,
    results?.restaurants?.length,
    resultsRequestKey,
    visibleDotRestaurantFeaturesCount,
    visibleSortedRestaurantMarkersCount,
  ]);

  const completeShortcutHarnessRunRef = React.useRef<(settleStatus: string) => void>(
    () => undefined
  );
  const evaluateShortcutHarnessSettleBoundaryRef = React.useRef<
    (source: 'shadow_subscription' | 'settle_retry_timeout') => void
  >(() => undefined);

  const recordProfilerSpan = React.useCallback(
    (payload: {
      id: string;
      phase: 'mount' | 'update' | 'nested-update';
      stageHint: string | null;
      actualDurationMs: number;
      commitSpanMs: number;
      startTimeMs: number;
      commitTimeMs: number;
      nowMs: number;
      runNumber: number;
    }) => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (!lifecycle.inProgress || lifecycle.runNumber !== payload.runNumber) {
        return;
      }
      if (
        typeof payload.id !== 'string' ||
        payload.id.length === 0 ||
        !Number.isFinite(payload.commitSpanMs) ||
        payload.commitSpanMs <= 0
      ) {
        return;
      }
      const commitEndMs = Number.isFinite(payload.commitTimeMs)
        ? payload.commitTimeMs
        : payload.nowMs;
      const commitStartMs = Number.isFinite(payload.startTimeMs)
        ? payload.startTimeMs
        : Math.max(0, commitEndMs - payload.commitSpanMs);
      if (!Number.isFinite(commitEndMs) || !Number.isFinite(commitStartMs)) {
        return;
      }

      const spans = shortcutProfilerSpanBufferRef.current;
      spans.push({
        runNumber: payload.runNumber,
        id: payload.id,
        phase: payload.phase,
        stageHint: payload.stageHint,
        actualDurationMs: payload.actualDurationMs,
        commitSpanMs: payload.commitSpanMs,
        startMs: commitStartMs,
        endMs: commitEndMs,
        nowMs: payload.nowMs,
      });
      if (spans.length > SHORTCUT_PROFILER_SPAN_MAX_BUFFER) {
        spans.splice(0, spans.length - SHORTCUT_PROFILER_SPAN_MAX_BUFFER);
      }
    },
    [isShortcutPerfHarnessScenario]
  );

  const resolveWindowProfilerOwners = React.useCallback(
    (
      runNumber: number,
      windowStartMs: number,
      windowEndMs: number
    ): ShortcutProfilerWindowOwner[] => {
      if (
        !Number.isFinite(windowStartMs) ||
        !Number.isFinite(windowEndMs) ||
        windowEndMs <= windowStartMs
      ) {
        return [];
      }
      const overlapById = new Map<string, ShortcutProfilerWindowOwner>();
      for (const span of shortcutProfilerSpanBufferRef.current) {
        if (span.runNumber !== runNumber) {
          continue;
        }
        const overlapMs = Math.max(
          0,
          Math.min(span.endMs, windowEndMs) - Math.max(span.startMs, windowStartMs)
        );
        if (overlapMs <= 0) {
          continue;
        }
        const previous = overlapById.get(span.id);
        if (previous) {
          previous.overlapMs += overlapMs;
          previous.maxCommitSpanMs = Math.max(previous.maxCommitSpanMs, span.commitSpanMs);
          previous.spanCount += 1;
          continue;
        }
        overlapById.set(span.id, {
          componentId: span.id,
          overlapMs,
          maxCommitSpanMs: span.commitSpanMs,
          spanCount: 1,
        });
      }
      return Array.from(overlapById.values())
        .sort((left, right) => {
          if (right.overlapMs !== left.overlapMs) {
            return right.overlapMs - left.overlapMs;
          }
          if (right.maxCommitSpanMs !== left.maxCommitSpanMs) {
            return right.maxCommitSpanMs - left.maxCommitSpanMs;
          }
          if (right.spanCount !== left.spanCount) {
            return right.spanCount - left.spanCount;
          }
          return left.componentId.localeCompare(right.componentId);
        })
        .slice(0, SHORTCUT_WINDOW_OWNER_LIMIT);
    },
    []
  );

  const startShortcutHarnessRun = React.useCallback(
    (runNumber: number) => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (lifecycle.loopCompleteEmitted) {
        return;
      }
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      const now = getPerfNow();
      lifecycle.runNumber = runNumber;
      lifecycle.runStartedAtMs = now;
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.settleCandidateRequestKey = null;
      lifecycle.settleCandidateVisibleCount = 0;
      lifecycle.settleCandidateVisiblePinCount = 0;
      lifecycle.settleCandidateVisibleDotCount = 0;
      lifecycle.observedLoading = false;
      lifecycle.responseObserved = false;
      lifecycle.runStartRequestKey = shortcutHarnessSnapshotRef.current.finalRequestKey;
      lifecycle.inProgress = true;
      shortcutProfilerSpanBufferRef.current = [];
      mapQueryBudget?.resetRun();
      searchSessionController.reset();
      runtimeWorkSchedulerRef?.current.resetPressureWindow();
      schedulerPressureBaselineRef.current =
        runtimeWorkSchedulerRef?.current.snapshotPressure() ?? null;
      const shadowStartState = searchSessionController.getState();
      const trace = shortcutPerfTraceRef.current;
      trace.sessionId = runNumber;
      trace.sessionStartedAtMs = now;
      trace.stage = 'submit_intent';
      trace.stageStartedAtMs = now;
      emitSearchPerfEvent('Harness', {
        event: 'shortcut_loop_run_start',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(now),
        runNumber,
        totalRuns: perfHarnessConfig.runs,
        shadowPhase: shadowStartState.phase,
        shadowTransitionViolations: shadowStartState.transitionViolationCount,
        shadowStaleDrops: shadowStartState.staleEventDropCount,
      });
      lifecycle.runTimeoutHandle = setTimeout(() => {
        completeShortcutHarnessRunRef.current('timeout');
      }, runTimeoutMs);
      const desiredScoreMode = perfHarnessConfig.shortcutLoop.scoreMode;
      if (scoreMode !== desiredScoreMode) {
        setPreferredScoreMode(desiredScoreMode);
      }
      const submitShortcutSearch = () =>
        submitShortcutSearchRef.current({
          targetTab: perfHarnessConfig.shortcutLoop.targetTab,
          label: perfHarnessConfig.shortcutLoop.label,
          preserveSheetState: perfHarnessConfig.shortcutLoop.preserveSheetState,
          transitionFromDockedPolls: perfHarnessConfig.shortcutLoop.transitionFromDockedPolls,
          scoreMode: perfHarnessConfig.shortcutLoop.scoreMode,
        });
      void submitShortcutSearch().catch((error) => {
        emitSearchPerfEvent('Harness', {
          event: 'shortcut_loop_run_error',
          harnessRunId: shortcutHarnessRunId,
          nowMs: roundPerfValue(getPerfNow()),
          runNumber,
          message: error instanceof Error ? error.message : 'unknown error',
        });
      });
    },
    [
      emitSearchPerfEvent,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      mapQueryBudget,
      roundPerfValue,
      scoreMode,
      searchSessionController,
      runtimeWorkSchedulerRef,
      setPreferredScoreMode,
      shortcutHarnessRunId,
      submitShortcutSearchRef,
      schedulerPressureBaselineRef,
      runTimeoutMs,
    ]
  );

  const completeShortcutHarnessRun = React.useCallback(
    (settleStatus: string) => {
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (!lifecycle.inProgress) {
        return;
      }
      lifecycle.inProgress = false;
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      const trace = shortcutPerfTraceRef.current;
      trace.sessionId = null;
      trace.sessionStartedAtMs = null;
      trace.stage = null;
      trace.stageStartedAtMs = null;
      shortcutProfilerSpanBufferRef.current = [];
      const now = getPerfNow();
      const snapshot = shortcutHarnessSnapshotRef.current;
      const shadowState = searchSessionController.getState();
      const mapRuntimeSnapshot = mapQueryBudget?.snapshot() ?? {};
      const schedulerPressureSnapshot = runtimeWorkSchedulerRef?.current.snapshotPressure() ?? null;
      const schedulerBaselineSnapshot = schedulerPressureBaselineRef.current;
      const schedulerYieldCount = Math.max(
        0,
        (schedulerPressureSnapshot?.yieldCount ?? 0) - (schedulerBaselineSnapshot?.yieldCount ?? 0)
      );
      const schedulerLaneDeferrals = (
        Object.keys(schedulerPressureSnapshot?.laneDeferrals ?? {}) as Array<
          keyof NonNullable<typeof schedulerPressureSnapshot>['laneDeferrals']
        >
      ).reduce<Record<string, number>>((acc, lane) => {
        const currentValue = schedulerPressureSnapshot?.laneDeferrals?.[lane] ?? 0;
        const baselineValue = schedulerBaselineSnapshot?.laneDeferrals?.[lane] ?? 0;
        const delta = Math.max(0, currentValue - baselineValue);
        if (delta > 0) {
          acc[String(lane)] = delta;
        }
        return acc;
      }, {});
      const schedulerMaxQueueDepth = schedulerPressureSnapshot?.maxQueueDepth ?? 0;
      const runNumber = lifecycle.runNumber;
      const durationMs = Math.max(0, now - lifecycle.runStartedAtMs);
      lifecycle.completedRuns = runNumber;
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.settleCandidateRequestKey = null;
      lifecycle.settleCandidateVisibleCount = 0;
      lifecycle.settleCandidateVisiblePinCount = 0;
      lifecycle.settleCandidateVisibleDotCount = 0;
      lifecycle.observedLoading = false;
      lifecycle.responseObserved = false;
      lifecycle.runStartRequestKey = null;
      schedulerPressureBaselineRef.current = null;
      emitSearchPerfEvent('Harness', {
        event: 'shortcut_loop_run_complete',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(now),
        runNumber,
        durationMs: roundPerfValue(durationMs),
        settleStatus,
        settleWaitMs: roundPerfValue(durationMs),
        finalStage: snapshot.finalStage,
        finalVisualSyncPending: snapshot.isVisualSyncPending,
        finalVisibleCount: snapshot.finalVisibleCount,
        finalSectionedCount: snapshot.finalSectionedCount,
        finalVisiblePinCount: snapshot.finalVisiblePinCount,
        finalVisibleDotCount: snapshot.finalVisibleDotCount,
        finalRequestKey: snapshot.finalRequestKey,
        shadowPhase: shadowState.phase,
        shadowTransitionViolations: shadowState.transitionViolationCount,
        shadowStaleDrops: shadowState.staleEventDropCount,
        shadowLastEventType: shadowState.lastEventType,
        mapRuntime: mapRuntimeSnapshot,
        schedulerYieldCount,
        schedulerLaneDeferrals,
        schedulerMaxQueueDepth,
      });
      if (lifecycle.completedRuns >= perfHarnessConfig.runs) {
        if (!lifecycle.loopCompleteEmitted) {
          lifecycle.loopCompleteEmitted = true;
          emitSearchPerfEvent('Harness', {
            event: 'shortcut_loop_complete',
            harnessRunId: shortcutHarnessRunId,
            nowMs: roundPerfValue(now),
            completedRuns: lifecycle.completedRuns,
          });
        }
        return;
      }
      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
      }
      lifecycle.cooldownHandle = setTimeout(() => {
        startShortcutHarnessRun(lifecycle.completedRuns + 1);
      }, perfHarnessConfig.cooldownMs);
    },
    [
      emitSearchPerfEvent,
      getPerfNow,
      mapQueryBudget,
      roundPerfValue,
      searchSessionController,
      runtimeWorkSchedulerRef,
      schedulerPressureBaselineRef,
      shortcutHarnessRunId,
      startShortcutHarnessRun,
    ]
  );
  completeShortcutHarnessRunRef.current = completeShortcutHarnessRun;

  const evaluateShortcutHarnessSettleBoundary = React.useCallback(
    (source: 'shadow_subscription' | 'settle_retry_timeout') => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (!lifecycle.inProgress) {
        return;
      }
      emitHarnessMechanismEvent('shortcut_harness_settle_eval', {
        source,
        runNumber: lifecycle.runNumber,
      });
      const clearSettleCheckHandle = () => {
        if (lifecycle.settleCheckHandle) {
          clearTimeout(lifecycle.settleCheckHandle);
          lifecycle.settleCheckHandle = null;
        }
      };
      const scheduleSettleRetry = () => {
        clearSettleCheckHandle();
        lifecycle.settleCheckHandle = setTimeout(() => {
          lifecycle.settleCheckHandle = null;
          if (!lifecycle.inProgress) {
            return;
          }
          evaluateShortcutHarnessSettleBoundaryRef.current('settle_retry_timeout');
        }, settleQuietPeriodMs);
      };
      const resetSettleCandidate = () => {
        clearSettleCheckHandle();
        lifecycle.settleCandidateAtMs = 0;
        lifecycle.settleCandidateRequestKey = null;
        lifecycle.settleCandidateVisibleCount = 0;
        lifecycle.settleCandidateVisiblePinCount = 0;
        lifecycle.settleCandidateVisibleDotCount = 0;
      };
      const isShadowConverged = (): boolean => {
        const usesShadowConvergenceBoundary =
          perfHarnessConfig.shortcutLoop.settleBoundaryPolicy ===
          'shadow_converged_or_quiet_snapshot';
        if (!usesShadowConvergenceBoundary) {
          return false;
        }
        const shadowState = searchSessionController.getState();
        return shadowState.phase === 'settled' && shadowState.lastEventType === 'settled';
      };
      const settleBlocked = (shadowConverged: boolean): boolean => {
        const settleBoundaryPolicy = perfHarnessConfig.shortcutLoop.settleBoundaryPolicy;
        const usesShadowConvergenceBoundary =
          settleBoundaryPolicy === 'shadow_converged_or_quiet_snapshot';
        const inputs = harnessInputsRef.current;
        const runtimeState = searchRuntimeBus?.getState();
        const activeOperationId = runtimeState?.activeOperationId ?? inputs.activeOperationId;
        const activeOperationLane = runtimeState?.activeOperationLane ?? inputs.activeOperationLane;
        const isResultsHydrationSettled =
          runtimeState?.isResultsHydrationSettled ?? inputs.isResultsHydrationSettled;
        const shouldHydrateResultsForRenderRuntime =
          runtimeState?.shouldHydrateResultsForRender ?? inputs.shouldHydrateResultsForRender;
        const schedulerPressure = runtimeWorkSchedulerRef?.current.snapshotPressure() ?? null;
        const snapshot = shortcutHarnessSnapshotRef.current;
        if (snapshot.finalRequestKey && snapshot.finalRequestKey !== lifecycle.runStartRequestKey) {
          lifecycle.responseObserved = true;
        }
        if (inputs.isSearchLoading) {
          lifecycle.observedLoading = true;
          return true;
        }
        if (
          activeOperationId != null ||
          activeOperationLane !== 'idle' ||
          !isResultsHydrationSettled ||
          shouldHydrateResultsForRenderRuntime
        ) {
          lifecycle.observedLoading = true;
        }
        if (!snapshot.finalRequestKey) {
          return true;
        }
        if (!lifecycle.observedLoading && !lifecycle.responseObserved) {
          return true;
        }
        if (inputs.isLoadingMore || inputs.isShortcutCoverageLoading) {
          return true;
        }
        if (!usesShadowConvergenceBoundary) {
          if (shouldHydrateResultsForRenderRuntime) {
            return true;
          }
          if (
            snapshot.finalVisibleCount > 0 &&
            snapshot.finalVisiblePinCount <= 0 &&
            snapshot.finalVisibleDotCount <= 0
          ) {
            return true;
          }
          return false;
        }
        if (activeOperationId != null || activeOperationLane !== 'idle') {
          return true;
        }
        if (!isResultsHydrationSettled || shouldHydrateResultsForRenderRuntime) {
          return true;
        }
        if ((schedulerPressure?.queueDepth ?? 0) > 0) {
          return true;
        }
        if (!shadowConverged && inputs.searchMode === 'shortcut' && inputs.isRunOneHandoffActive) {
          return true;
        }
        if (
          inputs.isVisualSyncPending ||
          shouldHydrateResultsForRenderRuntime
        ) {
          return true;
        }
        if (!shadowConverged && shortcutPerfTraceRef.current.stage !== 'results_list_ramp') {
          return true;
        }
        const interactionState = searchInteractionRef.current;
        if (!shadowConverged && interactionState.isInteracting) {
          return true;
        }
        return false;
      };
      const scheduleSettleCheck = () => {
        clearSettleCheckHandle();
        lifecycle.settleCheckHandle = setTimeout(() => {
          lifecycle.settleCheckHandle = null;
          if (!lifecycle.inProgress) {
            return;
          }
          if (lifecycle.settleCandidateAtMs <= 0) {
            scheduleSettleRetry();
            return;
          }
          const shadowConverged = isShadowConverged();
          if (settleBlocked(shadowConverged)) {
            resetSettleCandidate();
            scheduleSettleRetry();
            return;
          }
          const latestSnapshot = shortcutHarnessSnapshotRef.current;
          if (!latestSnapshot.finalRequestKey) {
            resetSettleCandidate();
            scheduleSettleRetry();
            return;
          }
          const latestRequestKey = latestSnapshot.finalRequestKey;
          const latestVisibleCount = latestSnapshot.finalVisibleCount;
          const hasSnapshotChanged =
            lifecycle.settleCandidateRequestKey !== latestRequestKey ||
            lifecycle.settleCandidateVisibleCount !== latestVisibleCount;
          const hasMapPresentationChanged =
            !shadowConverged &&
            (lifecycle.settleCandidateVisiblePinCount !== latestSnapshot.finalVisiblePinCount ||
              lifecycle.settleCandidateVisibleDotCount !== latestSnapshot.finalVisibleDotCount);
          const now = getPerfNow();
          if (hasSnapshotChanged || hasMapPresentationChanged) {
            lifecycle.settleCandidateAtMs = now;
            lifecycle.settleCandidateRequestKey = latestRequestKey;
            lifecycle.settleCandidateVisibleCount = latestVisibleCount;
            lifecycle.settleCandidateVisiblePinCount = latestSnapshot.finalVisiblePinCount;
            lifecycle.settleCandidateVisibleDotCount = latestSnapshot.finalVisibleDotCount;
            scheduleSettleCheck();
            return;
          }
          if (now - lifecycle.settleCandidateAtMs < settleQuietPeriodMs) {
            scheduleSettleCheck();
            return;
          }
          completeShortcutHarnessRunRef.current('settled');
        }, settleQuietPeriodMs);
      };
      const shadowConverged = isShadowConverged();
      if (settleBlocked(shadowConverged)) {
        resetSettleCandidate();
        scheduleSettleRetry();
        return;
      }
      const snapshot = shortcutHarnessSnapshotRef.current;
      if (!snapshot.finalRequestKey) {
        resetSettleCandidate();
        scheduleSettleRetry();
        return;
      }
      const candidateRequestKey = snapshot.finalRequestKey;
      const candidateVisibleCount = snapshot.finalVisibleCount;
      const now = getPerfNow();
      if (lifecycle.settleCandidateAtMs <= 0) {
        lifecycle.settleCandidateAtMs = now;
        lifecycle.settleCandidateRequestKey = candidateRequestKey;
        lifecycle.settleCandidateVisibleCount = candidateVisibleCount;
        lifecycle.settleCandidateVisiblePinCount = snapshot.finalVisiblePinCount;
        lifecycle.settleCandidateVisibleDotCount = snapshot.finalVisibleDotCount;
        scheduleSettleCheck();
        return;
      }
      const hasSnapshotChanged =
        lifecycle.settleCandidateRequestKey !== candidateRequestKey ||
        lifecycle.settleCandidateVisibleCount !== candidateVisibleCount;
      const hasMapPresentationChanged =
        !shadowConverged &&
        (lifecycle.settleCandidateVisiblePinCount !== snapshot.finalVisiblePinCount ||
          lifecycle.settleCandidateVisibleDotCount !== snapshot.finalVisibleDotCount);
      if (hasSnapshotChanged || hasMapPresentationChanged) {
        lifecycle.settleCandidateAtMs = now;
        lifecycle.settleCandidateRequestKey = candidateRequestKey;
        lifecycle.settleCandidateVisibleCount = candidateVisibleCount;
        lifecycle.settleCandidateVisiblePinCount = snapshot.finalVisiblePinCount;
        lifecycle.settleCandidateVisibleDotCount = snapshot.finalVisibleDotCount;
        scheduleSettleCheck();
        return;
      }
      if (now - lifecycle.settleCandidateAtMs < settleQuietPeriodMs) {
        scheduleSettleCheck();
        return;
      }
      clearSettleCheckHandle();
      completeShortcutHarnessRunRef.current('settled');
    },
    [
      emitHarnessMechanismEvent,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      runtimeWorkSchedulerRef,
      searchRuntimeBus,
      searchInteractionRef,
      searchSessionController,
      settleQuietPeriodMs,
    ]
  );
  evaluateShortcutHarnessSettleBoundaryRef.current = evaluateShortcutHarnessSettleBoundary;

  React.useEffect(() => {
    if (!isShortcutPerfHarnessScenario) {
      return;
    }
    return searchSessionController.subscribe((result) => {
      shortcutShadowStateForStageRef.current = result.state;
      syncShortcutTraceStage();
      // If the search session errored, complete the run immediately
      // instead of waiting for the full timeout.
      if (result.state.phase === 'error' && shortcutHarnessLifecycleRef.current.inProgress) {
        completeShortcutHarnessRunRef.current('error');
        return;
      }
      evaluateShortcutHarnessSettleBoundary('shadow_subscription');
    });
  }, [
    evaluateShortcutHarnessSettleBoundary,
    isShortcutPerfHarnessScenario,
    searchSessionController,
    syncShortcutTraceStage,
  ]);

  React.useEffect(() => {
    if (!isShortcutPerfHarnessScenario || !isSearchOverlay || !isInitialCameraReady) {
      return;
    }
    const lifecycle = shortcutHarnessLifecycleRef.current;
    if (lifecycle.bootstrapped || lifecycle.loopCompleteEmitted) {
      return;
    }
    lifecycle.bootstrapped = true;
    lifecycle.runNumber = 0;
    lifecycle.completedRuns = 0;
    lifecycle.settleCandidateAtMs = 0;
    lifecycle.settleCandidateRequestKey = null;
    lifecycle.settleCandidateVisibleCount = 0;
    lifecycle.settleCandidateVisiblePinCount = 0;
    lifecycle.settleCandidateVisibleDotCount = 0;
    lifecycle.observedLoading = false;
    lifecycle.responseObserved = false;
    lifecycle.runStartRequestKey = null;
    lifecycle.inProgress = false;
    const now = getPerfNow();
    emitSearchPerfEvent('Harness', {
      event: 'shortcut_loop_start',
      harnessRunId: shortcutHarnessRunId,
      nowMs: roundPerfValue(now),
      scenario: perfHarnessConfig.scenario,
      runs: perfHarnessConfig.runs,
      startDelayMs: perfHarnessConfig.startDelayMs,
      cooldownMs: perfHarnessConfig.cooldownMs,
      signature: perfHarnessConfig.signature,
    });
    lifecycle.launchHandle = setTimeout(() => {
      startShortcutHarnessRun(1);
    }, perfHarnessConfig.startDelayMs);
    return () => {
      if (lifecycle.launchHandle) {
        clearTimeout(lifecycle.launchHandle);
        lifecycle.launchHandle = null;
      }
      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
        lifecycle.cooldownHandle = null;
      }
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      if (!lifecycle.loopCompleteEmitted) {
        lifecycle.bootstrapped = false;
        lifecycle.inProgress = false;
        lifecycle.settleCandidateAtMs = 0;
        lifecycle.settleCandidateRequestKey = null;
        lifecycle.settleCandidateVisibleCount = 0;
        lifecycle.settleCandidateVisiblePinCount = 0;
        lifecycle.settleCandidateVisibleDotCount = 0;
        lifecycle.observedLoading = false;
        lifecycle.responseObserved = false;
        lifecycle.runStartRequestKey = null;
      }
    };
  }, [
    emitSearchPerfEvent,
    getPerfNow,
    isInitialCameraReady,
    isSearchOverlay,
    isShortcutPerfHarnessScenario,
    roundPerfValue,
    shortcutHarnessRunId,
    startShortcutHarnessRun,
  ]);

  React.useEffect(() => {
    if (!perfHarnessConfig.jsFrameSampler.enabled) {
      return;
    }
    const stop = startJsFrameSampler({
      windowMs: perfHarnessConfig.jsFrameSampler.windowMs,
      stallFrameMs: perfHarnessConfig.jsFrameSampler.stallFrameMs,
      logOnlyBelowFps: perfHarnessConfig.jsFrameSampler.logOnlyBelowFps,
      getNow: getPerfNow,
      onWindow: (summary) => {
        if (!isShortcutPerfHarnessScenario) {
          return;
        }
        const trace = shortcutPerfTraceRef.current;
        if (trace.sessionId == null) {
          return;
        }
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('JsFrameSampler', {
          ...summary,
          harnessRunId: shortcutHarnessRunId,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
          ...(() => {
            const windowEndMs =
              typeof summary.nowMs === 'number' && Number.isFinite(summary.nowMs)
                ? summary.nowMs
                : traceNowMs;
            const windowMs =
              typeof summary.windowMs === 'number' && Number.isFinite(summary.windowMs)
                ? summary.windowMs
                : perfHarnessConfig.jsFrameSampler.windowMs;
            const windowStartMs = windowEndMs - Math.max(0, windowMs);
            const owners = resolveWindowProfilerOwners(trace.sessionId, windowStartMs, windowEndMs);
            if (owners.length === 0) {
              return {
                windowOwnerPrimaryComponentId: null,
                windowOwnerPrimaryOverlapMs: 0,
                windowOwnerPrimaryMaxCommitSpanMs: 0,
                windowOwnerPrimarySpanCount: 0,
                windowOwnerTopComponents: [],
              };
            }
            const primaryOwner = owners[0];
            return {
              windowOwnerPrimaryComponentId: primaryOwner.componentId,
              windowOwnerPrimaryOverlapMs: roundPerfValue(primaryOwner.overlapMs),
              windowOwnerPrimaryMaxCommitSpanMs: roundPerfValue(primaryOwner.maxCommitSpanMs),
              windowOwnerPrimarySpanCount: primaryOwner.spanCount,
              windowOwnerTopComponents: owners.map((owner) => ({
                componentId: owner.componentId,
                overlapMs: roundPerfValue(owner.overlapMs),
                maxCommitSpanMs: roundPerfValue(owner.maxCommitSpanMs),
                spanCount: owner.spanCount,
              })),
            };
          })(),
        });
      },
      onStall: () => undefined,
    });
    return stop;
  }, [
    emitSearchPerfEvent,
    getPerfNow,
    isShortcutPerfHarnessScenario,
    resolveWindowProfilerOwners,
    roundPerfValue,
    shortcutHarnessRunId,
  ]);

  React.useEffect(() => {
    if (!perfHarnessConfig.uiFrameSampler.enabled) {
      return;
    }
    const stop = startUiFrameSampler({
      windowMs: perfHarnessConfig.uiFrameSampler.windowMs,
      stallFrameMs: perfHarnessConfig.uiFrameSampler.stallFrameMs,
      logOnlyBelowFps: perfHarnessConfig.uiFrameSampler.logOnlyBelowFps,
      onWindow: (summary) => {
        if (!isShortcutPerfHarnessScenario) {
          return;
        }
        const trace = shortcutPerfTraceRef.current;
        if (trace.sessionId == null) {
          return;
        }
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('UiFrameSampler', {
          ...summary,
          harnessRunId: shortcutHarnessRunId,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
        });
      },
      onStall: () => undefined,
    });
    return stop;
  }, [
    emitSearchPerfEvent,
    getPerfNow,
    isShortcutPerfHarnessScenario,
    roundPerfValue,
    shortcutHarnessRunId,
  ]);

  return {
    isShortcutPerfHarnessScenario,
    shortcutHarnessRunId,
    getActiveShortcutRunNumber,
    recordProfilerSpan,
    emitHarnessMechanismEvent,
    emitRuntimeMechanismEvent,
  };
};
