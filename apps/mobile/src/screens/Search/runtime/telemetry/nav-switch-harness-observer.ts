import React from 'react';

import perfHarnessConfig, { type PerfNavSwitchOverlay } from '../../../../perf/harness-config';
import { usePerfHarnessRuntimeStore } from '../../../../perf/perf-harness-runtime-store';
import type { RuntimePerfHarnessConfig } from '../../../../perf/perf-harness-runtime-store';
import { startJsFrameSampler } from '../../../../perf/js-frame-sampler';
import { startJsTaskLatencySampler } from '../../../../perf/js-task-latency-sampler';
import { startUiFrameSampler } from '../../../../perf/ui-frame-sampler';
import { logger } from '../../../../utils';
import { beginSearchNavSwitchPerfProbe } from '../shared/search-nav-switch-perf-probe';
import {
  pruneSearchNavSwitchRuntimeAttributionBefore,
  recordSearchNavSwitchRuntimeAttributionSpan,
  resolveSearchNavSwitchRuntimeAttributionOwners,
  withSearchNavSwitchRuntimeAttribution,
} from '../shared/search-nav-switch-runtime-attribution';

type SelectOverlayHarnessRef = React.MutableRefObject<(target: PerfNavSwitchOverlay) => void>;

type UseNavSwitchHarnessObserverArgs = {
  getPerfNow: () => number;
  roundPerfValue: (value: number) => number;
  selectOverlayHarnessRef: SelectOverlayHarnessRef;
  isSearchOverlay: boolean;
  rootOverlay: string;
  activeOverlayKey: string;
  getRouteOverlayIdentitySnapshot?: () => {
    rootOverlay: string;
    activeOverlayKey: string;
    isSearchOverlay: boolean;
  };
  getRouteActiveSceneKey?: () => string | null;
  isInitialCameraReady: boolean;
};

type UseNavSwitchHarnessObserverResult = {
  isNavSwitchPerfHarnessScenario: boolean;
  getActiveNavSwitchRunNumber: () => number | null;
  recordNavSwitchProfilerSpan: (payload: {
    id: string;
    phase: string;
    stageHint: string | null;
    actualDurationMs: number;
    commitSpanMs: number;
    startTimeMs: number;
    commitTimeMs: number;
    nowMs: number;
    runNumber: number;
  }) => void;
};

type NavSwitchHarnessTrace = {
  sessionId: number | null;
  sessionStartedAtMs: number | null;
  stage: string | null;
  stageStartedAtMs: number | null;
  stepIndex: number | null;
  targetOverlay: PerfNavSwitchOverlay | null;
};

type NavSwitchProfilerSpanRecord = {
  runNumber: number;
  id: string;
  phase: string;
  stageHint: string | null;
  actualDurationMs: number;
  commitSpanMs: number;
  startMs: number;
  endMs: number;
  nowMs: number;
};

type NavSwitchProfilerWindowOwner = {
  componentId: string;
  overlapMs: number;
  actualDurationMs: number;
  maxActualDurationMs: number;
  maxCommitSpanMs: number;
  spanCount: number;
};

type ResolvedNavSwitchHarnessConfig = {
  enabled: boolean;
  runId: string;
  runs: number;
  startDelayMs: number;
  cooldownMs: number;
  signature: string;
  navSwitchLoop: RuntimePerfHarnessConfig['navSwitchLoop'];
  jsFrameSampler: RuntimePerfHarnessConfig['jsFrameSampler'];
  jsTaskLatencySampler: RuntimePerfHarnessConfig['jsTaskLatencySampler'];
  uiFrameSampler: RuntimePerfHarnessConfig['uiFrameSampler'];
  activationKey: string | null;
};

const hasRouteIdentitySettledForTarget = ({
  targetOverlay,
  rootOverlay,
  activeOverlayKey,
  routeActiveSceneKey,
}: {
  targetOverlay: PerfNavSwitchOverlay | null;
  rootOverlay: string;
  activeOverlayKey: string;
  routeActiveSceneKey: string | null;
}): boolean => {
  if (targetOverlay == null) {
    return false;
  }
  if (targetOverlay === 'polls') {
    return rootOverlay === 'search' && routeActiveSceneKey === 'polls';
  }
  if (targetOverlay === 'search') {
    return (
      rootOverlay === 'search' &&
      activeOverlayKey === 'search' &&
      (routeActiveSceneKey == null || routeActiveSceneKey === 'search')
    );
  }
  return rootOverlay === targetOverlay && activeOverlayKey === targetOverlay;
};

const NAV_SWITCH_PROFILER_SPAN_MAX_BUFFER = 2000;
const NAV_SWITCH_WINDOW_OWNER_LIMIT = 24;
const NAV_SWITCH_RUNTIME_OWNER_LIMIT = 160;

const useNavSwitchHarnessObserver = ({
  getPerfNow,
  roundPerfValue,
  selectOverlayHarnessRef,
  isSearchOverlay,
  rootOverlay,
  activeOverlayKey,
  getRouteOverlayIdentitySnapshot,
  getRouteActiveSceneKey,
  isInitialCameraReady,
}: UseNavSwitchHarnessObserverArgs): UseNavSwitchHarnessObserverResult => {
  const runtimeHarnessConfig = usePerfHarnessRuntimeStore((state) => state.activeConfig);
  const resolvedHarnessConfig = React.useMemo<ResolvedNavSwitchHarnessConfig>(() => {
    if (runtimeHarnessConfig?.scenario === 'search_nav_switch_loop') {
      return {
        enabled: true,
        runId: runtimeHarnessConfig.runId,
        runs: runtimeHarnessConfig.runs,
        startDelayMs: runtimeHarnessConfig.startDelayMs,
        cooldownMs: runtimeHarnessConfig.cooldownMs,
        signature: runtimeHarnessConfig.signature,
        navSwitchLoop: runtimeHarnessConfig.navSwitchLoop,
        jsFrameSampler: runtimeHarnessConfig.jsFrameSampler,
        jsTaskLatencySampler: runtimeHarnessConfig.jsTaskLatencySampler,
        uiFrameSampler: runtimeHarnessConfig.uiFrameSampler,
        activationKey: `runtime:${runtimeHarnessConfig.requestId}`,
      };
    }

    if (!(perfHarnessConfig.enabled && perfHarnessConfig.scenario === 'search_nav_switch_loop')) {
      return {
        enabled: false,
        runId: 'nav-switch-loop-no-run-id',
        runs: 0,
        startDelayMs: 0,
        cooldownMs: 0,
        signature: '',
        navSwitchLoop: perfHarnessConfig.navSwitchLoop,
        jsFrameSampler: perfHarnessConfig.jsFrameSampler,
        jsTaskLatencySampler: perfHarnessConfig.jsTaskLatencySampler,
        uiFrameSampler: perfHarnessConfig.uiFrameSampler,
        activationKey: null,
      };
    }

    return {
      enabled: true,
      runId: perfHarnessConfig.runId ?? 'nav-switch-loop-no-run-id',
      runs: perfHarnessConfig.runs,
      startDelayMs: perfHarnessConfig.startDelayMs,
      cooldownMs: perfHarnessConfig.cooldownMs,
      signature: perfHarnessConfig.signature,
      navSwitchLoop: perfHarnessConfig.navSwitchLoop,
      jsFrameSampler: perfHarnessConfig.jsFrameSampler,
      jsTaskLatencySampler: perfHarnessConfig.jsTaskLatencySampler,
      uiFrameSampler: perfHarnessConfig.uiFrameSampler,
      activationKey: `env:${perfHarnessConfig.runId ?? 'nav-switch-loop-no-run-id'}`,
    };
  }, [runtimeHarnessConfig]);
  const isNavSwitchPerfHarnessScenario = resolvedHarnessConfig.enabled;
  const navSwitchHarnessRunId = resolvedHarnessConfig.runId;
  const resolvedHarnessConfigRef = React.useRef(resolvedHarnessConfig);
  resolvedHarnessConfigRef.current = resolvedHarnessConfig;
  const rootOverlayRef = React.useRef(rootOverlay);
  const activeOverlayKeyRef = React.useRef(activeOverlayKey);
  const navSwitchTraceRef = React.useRef<NavSwitchHarnessTrace>({
    sessionId: null,
    sessionStartedAtMs: null,
    stage: null,
    stageStartedAtMs: null,
    stepIndex: null,
    targetOverlay: null,
  });
  const navSwitchProfilerSpanBufferRef = React.useRef<NavSwitchProfilerSpanRecord[]>([]);
  const navSwitchProfilerOwnerHandleRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );
  const lifecycleRef = React.useRef<{
    bootstrapped: boolean;
    loopCompleteEmitted: boolean;
    inProgress: boolean;
    runNumber: number;
    completedRuns: number;
    runStartedAtMs: number;
    currentStepIndex: number;
    currentTarget: PerfNavSwitchOverlay | null;
    stepStartedAtMs: number;
    settleCandidateAtMs: number;
    launchHandle: ReturnType<typeof setTimeout> | null;
    cooldownHandle: ReturnType<typeof setTimeout> | null;
    stepSettleHandle: ReturnType<typeof setTimeout> | null;
    settlePollHandle: ReturnType<typeof setTimeout> | null;
    runTimeoutHandle: ReturnType<typeof setTimeout> | null;
    stepTimeoutHandle: ReturnType<typeof setTimeout> | null;
    activationKey: string | null;
  }>({
    bootstrapped: false,
    loopCompleteEmitted: false,
    inProgress: false,
    runNumber: 0,
    completedRuns: 0,
    runStartedAtMs: 0,
    currentStepIndex: -1,
    currentTarget: null,
    stepStartedAtMs: 0,
    settleCandidateAtMs: 0,
    launchHandle: null,
    cooldownHandle: null,
    stepSettleHandle: null,
    settlePollHandle: null,
    runTimeoutHandle: null,
    stepTimeoutHandle: null,
    activationKey: null,
  });

  const emitSearchPerfEvent = React.useCallback(
    (
      channel: 'Harness' | 'JsFrameSampler' | 'JsTaskLatencySampler' | 'UiFrameSampler',
      payload: Record<string, unknown>
    ) => {
      logger.debug(`[SearchPerf][${channel}]`, payload);
    },
    []
  );

  const clearStepHandles = React.useCallback(() => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle.settlePollHandle) {
      clearTimeout(lifecycle.settlePollHandle);
      lifecycle.settlePollHandle = null;
    }
    if (lifecycle.stepSettleHandle) {
      clearTimeout(lifecycle.stepSettleHandle);
      lifecycle.stepSettleHandle = null;
    }
    if (lifecycle.stepTimeoutHandle) {
      clearTimeout(lifecycle.stepTimeoutHandle);
      lifecycle.stepTimeoutHandle = null;
    }
  }, []);

  const syncRouteIdentityRefs = React.useCallback(() => {
    const routeIdentitySnapshot = getRouteOverlayIdentitySnapshot?.() ?? {
      rootOverlay,
      activeOverlayKey,
      isSearchOverlay,
    };
    rootOverlayRef.current = routeIdentitySnapshot.rootOverlay;
    activeOverlayKeyRef.current = routeIdentitySnapshot.activeOverlayKey;
    return {
      rootOverlayKey: routeIdentitySnapshot.rootOverlay,
      activeOverlayRouteKey: routeIdentitySnapshot.activeOverlayKey,
      routeActiveSceneKey: getRouteActiveSceneKey?.() ?? routeIdentitySnapshot.activeOverlayKey,
      isSearchOverlay: routeIdentitySnapshot.isSearchOverlay,
    };
  }, [
    activeOverlayKey,
    getRouteActiveSceneKey,
    getRouteOverlayIdentitySnapshot,
    isSearchOverlay,
    rootOverlay,
  ]);

  const resetTrace = React.useCallback(() => {
    navSwitchTraceRef.current = {
      sessionId: null,
      sessionStartedAtMs: null,
      stage: null,
      stageStartedAtMs: null,
      stepIndex: null,
      targetOverlay: null,
    };
  }, []);

  const clearDeferredProfilerOwnerHandles = React.useCallback(() => {
    navSwitchProfilerOwnerHandleRef.current.forEach((handle) => {
      clearTimeout(handle);
    });
    navSwitchProfilerOwnerHandleRef.current.clear();
  }, []);

  const scheduleDeferredSearchPerfEvent = React.useCallback(
    (
      channel: 'JsFrameSampler' | 'JsTaskLatencySampler' | 'UiFrameSampler',
      payload: Record<string, unknown>
    ) => {
      const handle = setTimeout(() => {
        navSwitchProfilerOwnerHandleRef.current.delete(handle);
        emitSearchPerfEvent(channel, payload);
      }, 0);
      navSwitchProfilerOwnerHandleRef.current.add(handle);
    },
    [emitSearchPerfEvent]
  );

  const completeRunRef = React.useRef<(status: string) => void>(() => undefined);
  const startRunRef = React.useRef<(runNumber: number) => void>(() => undefined);
  const startStepRef = React.useRef<(index: number) => void>(() => undefined);
  const checkRouteIdentitySettleRef = React.useRef<() => void>(() => undefined);
  const getActiveNavSwitchRunNumber = React.useCallback((): number | null => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle.inProgress || lifecycle.runNumber <= 0) {
      return null;
    }
    return lifecycle.runNumber;
  }, []);

  const recordNavSwitchProfilerSpan = React.useCallback<
    UseNavSwitchHarnessObserverResult['recordNavSwitchProfilerSpan']
  >(
    (payload) => {
      if (!isNavSwitchPerfHarnessScenario) {
        return;
      }
      const lifecycle = lifecycleRef.current;
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

      const spans = navSwitchProfilerSpanBufferRef.current;
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
      if (spans.length > NAV_SWITCH_PROFILER_SPAN_MAX_BUFFER) {
        spans.splice(0, spans.length - NAV_SWITCH_PROFILER_SPAN_MAX_BUFFER);
      }
    },
    [isNavSwitchPerfHarnessScenario]
  );

  const resolveWindowProfilerOwners = React.useCallback(
    (
      runNumber: number,
      windowStartMs: number,
      windowEndMs: number
    ): NavSwitchProfilerWindowOwner[] => {
      if (
        !Number.isFinite(windowStartMs) ||
        !Number.isFinite(windowEndMs) ||
        windowEndMs <= windowStartMs
      ) {
        return [];
      }
      const overlapById = new Map<string, NavSwitchProfilerWindowOwner>();
      for (const span of navSwitchProfilerSpanBufferRef.current) {
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
          previous.actualDurationMs += span.actualDurationMs;
          previous.maxActualDurationMs = Math.max(
            previous.maxActualDurationMs,
            span.actualDurationMs
          );
          previous.maxCommitSpanMs = Math.max(previous.maxCommitSpanMs, span.commitSpanMs);
          previous.spanCount += 1;
          continue;
        }
        overlapById.set(span.id, {
          componentId: span.id,
          overlapMs,
          actualDurationMs: span.actualDurationMs,
          maxActualDurationMs: span.actualDurationMs,
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
          if (right.actualDurationMs !== left.actualDurationMs) {
            return right.actualDurationMs - left.actualDurationMs;
          }
          if (right.spanCount !== left.spanCount) {
            return right.spanCount - left.spanCount;
          }
          return left.componentId.localeCompare(right.componentId);
        })
        .slice(0, NAV_SWITCH_WINDOW_OWNER_LIMIT);
    },
    []
  );

  const scheduleWindowProfilerOwnerEvent = React.useCallback(
    ({
      channel,
      event,
      runNumber,
      stage,
      stepIndex,
      targetOverlay,
      windowMs,
      windowEndMs,
    }: {
      channel: 'JsFrameSampler' | 'JsTaskLatencySampler';
      event: 'nav_switch_js_window_profiler_owners' | 'nav_switch_task_window_profiler_owners';
      runNumber: number;
      stage: string | null;
      stepIndex: number | null;
      targetOverlay: PerfNavSwitchOverlay | null;
      windowMs: number;
      windowEndMs: number;
    }) => {
      const windowStartMs = windowEndMs - Math.max(0, windowMs);
      const handle = setTimeout(() => {
        navSwitchProfilerOwnerHandleRef.current.delete(handle);
        const owners = resolveWindowProfilerOwners(runNumber, windowStartMs, windowEndMs);
        if (owners.length === 0) {
          emitSearchPerfEvent(channel, {
            event,
            harnessRunId: navSwitchHarnessRunId,
            navRunNumber: runNumber,
            navStage: stage,
            navStepIndex: stepIndex,
            navTargetOverlay: targetOverlay,
            windowEndMs: roundPerfValue(windowEndMs),
            windowMs: roundPerfValue(windowMs),
            windowOwnerPrimaryComponentId: null,
            windowOwnerPrimaryOverlapMs: 0,
            windowOwnerPrimaryMaxCommitSpanMs: 0,
            windowOwnerPrimarySpanCount: 0,
            windowOwnerTopComponents: [],
          });
          return;
        }

        const primaryOwner = owners[0];
        emitSearchPerfEvent(channel, {
          event,
          harnessRunId: navSwitchHarnessRunId,
          navRunNumber: runNumber,
          navStage: stage,
          navStepIndex: stepIndex,
          navTargetOverlay: targetOverlay,
          windowEndMs: roundPerfValue(windowEndMs),
          windowMs: roundPerfValue(windowMs),
          windowOwnerPrimaryComponentId: primaryOwner.componentId,
          windowOwnerPrimaryOverlapMs: roundPerfValue(primaryOwner.overlapMs),
          windowOwnerPrimaryMaxCommitSpanMs: roundPerfValue(primaryOwner.maxCommitSpanMs),
          windowOwnerPrimarySpanCount: primaryOwner.spanCount,
          windowOwnerTopComponents: owners.map((owner) => ({
            componentId: owner.componentId,
            overlapMs: roundPerfValue(owner.overlapMs),
            actualDurationMs: roundPerfValue(owner.actualDurationMs),
            maxActualDurationMs: roundPerfValue(owner.maxActualDurationMs),
            maxCommitSpanMs: roundPerfValue(owner.maxCommitSpanMs),
            spanCount: owner.spanCount,
          })),
        });
      }, 0);
      navSwitchProfilerOwnerHandleRef.current.add(handle);
    },
    [emitSearchPerfEvent, navSwitchHarnessRunId, resolveWindowProfilerOwners, roundPerfValue]
  );

  const emitRuntimeAttributionEvent = React.useCallback(
    ({
      event,
      channel,
      runNumber,
      stage,
      stepIndex,
      targetOverlay,
      windowEndMs,
      windowMs,
    }: {
      event:
        | 'nav_switch_js_window_runtime_owners'
        | 'nav_switch_task_window_runtime_owners'
        | 'nav_switch_task_max_lag_runtime_owners'
        | 'nav_switch_step_runtime_owners';
      channel: 'JsFrameSampler' | 'JsTaskLatencySampler' | 'Harness';
      runNumber: number;
      stage: string | null;
      stepIndex: number | null;
      targetOverlay: PerfNavSwitchOverlay | null;
      windowEndMs: number;
      windowMs: number;
    }) => {
      const windowStartMs = windowEndMs - Math.max(0, windowMs);
      const owners = resolveSearchNavSwitchRuntimeAttributionOwners({
        windowStartMs,
        windowEndMs,
        limit: NAV_SWITCH_RUNTIME_OWNER_LIMIT,
      });
      const primaryOwner = owners[0] ?? null;
      emitSearchPerfEvent(channel, {
        event,
        harnessRunId: navSwitchHarnessRunId,
        navRunNumber: runNumber,
        navStage: stage,
        navStepIndex: stepIndex,
        navTargetOverlay: targetOverlay,
        windowEndMs: roundPerfValue(windowEndMs),
        windowMs: roundPerfValue(windowMs),
        runtimeOwnerPrimaryId: primaryOwner?.ownerId ?? null,
        runtimeOwnerPrimaryTotalDurationMs: primaryOwner?.totalDurationMs ?? 0,
        runtimeOwnerPrimaryMaxDurationMs: primaryOwner?.maxDurationMs ?? 0,
        runtimeOwnerPrimarySpanCount: primaryOwner?.spanCount ?? 0,
        runtimeOwnerTopComponents: owners,
      });
      pruneSearchNavSwitchRuntimeAttributionBefore(windowStartMs - 1000);
    },
    [emitSearchPerfEvent, navSwitchHarnessRunId, roundPerfValue]
  );

  const completeRun = React.useCallback(
    (status: string) => {
      const lifecycle = lifecycleRef.current;
      if (!lifecycle.inProgress) {
        return;
      }
      lifecycle.inProgress = false;
      clearStepHandles();
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }

      const nowMs = getPerfNow();
      const durationMs = Math.max(0, nowMs - lifecycle.runStartedAtMs);
      lifecycle.completedRuns = lifecycle.runNumber;
      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_run_complete',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(nowMs),
        runNumber: lifecycle.runNumber,
        completedSteps: Math.max(0, lifecycle.currentStepIndex + 1),
        totalSteps: resolvedHarnessConfigRef.current.navSwitchLoop.sequence.length,
        finalRootOverlay: rootOverlayRef.current,
        finalActiveOverlayKey: activeOverlayKeyRef.current,
        status,
        finalStepDurationMs: roundPerfValue(durationMs),
      });

      lifecycle.currentStepIndex = -1;
      lifecycle.currentTarget = null;
      lifecycle.runStartedAtMs = 0;
      lifecycle.stepStartedAtMs = 0;
      lifecycle.settleCandidateAtMs = 0;
      resetTrace();

      if (lifecycle.completedRuns >= resolvedHarnessConfigRef.current.runs) {
        if (!lifecycle.loopCompleteEmitted) {
          lifecycle.loopCompleteEmitted = true;
          emitSearchPerfEvent('Harness', {
            event: 'nav_switch_loop_complete',
            harnessRunId: navSwitchHarnessRunId,
            nowMs: roundPerfValue(nowMs),
            completedRuns: lifecycle.completedRuns,
          });
        }
        return;
      }

      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
      }
      lifecycle.cooldownHandle = setTimeout(() => {
        startRunRef.current(lifecycle.completedRuns + 1);
      }, resolvedHarnessConfigRef.current.cooldownMs);
    },
    [
      clearStepHandles,
      emitSearchPerfEvent,
      getPerfNow,
      navSwitchHarnessRunId,
      resetTrace,
      roundPerfValue,
    ]
  );
  completeRunRef.current = completeRun;

  const startStep = React.useCallback(
    (index: number) => {
      const lifecycle = lifecycleRef.current;
      const targetOverlay = resolvedHarnessConfigRef.current.navSwitchLoop.sequence[index];
      if (!lifecycle.inProgress || !targetOverlay) {
        completeRunRef.current('step_resolution_failed');
        return;
      }

      clearStepHandles();
      lifecycle.currentStepIndex = index;
      lifecycle.currentTarget = targetOverlay;
      lifecycle.stepStartedAtMs = getPerfNow();
      beginSearchNavSwitchPerfProbe({
        from: rootOverlayRef.current,
        to: targetOverlay,
        windowMs:
          resolvedHarnessConfigRef.current.navSwitchLoop.stepTimeoutMs +
          resolvedHarnessConfigRef.current.navSwitchLoop.settleQuietPeriodMs +
          500,
      });
      lifecycle.settleCandidateAtMs = 0;
      navSwitchTraceRef.current = {
        sessionId: lifecycle.runNumber,
        sessionStartedAtMs: lifecycle.stepStartedAtMs,
        stage: `overlay:${rootOverlayRef.current}->${targetOverlay}`,
        stageStartedAtMs: lifecycle.stepStartedAtMs,
        stepIndex: index,
        targetOverlay,
      };

      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_step_start',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(lifecycle.stepStartedAtMs),
        runNumber: lifecycle.runNumber,
        stepIndex: index,
        totalSteps: resolvedHarnessConfigRef.current.navSwitchLoop.sequence.length,
        from: rootOverlayRef.current,
        to: targetOverlay,
      });

      lifecycle.stepTimeoutHandle = setTimeout(() => {
        completeRunRef.current(`step_timeout:${targetOverlay}`);
      }, resolvedHarnessConfigRef.current.navSwitchLoop.stepTimeoutMs);

      const dispatchStartedAtMs = getPerfNow();
      withSearchNavSwitchRuntimeAttribution('navSwitchHarness', 'selectOverlayDispatch', () => {
        selectOverlayHarnessRef.current(targetOverlay);
      });
      const dispatchEndedAtMs = getPerfNow();
      recordSearchNavSwitchRuntimeAttributionSpan({
        owner: 'navSwitchHarness',
        operation: 'selectOverlayDispatchBoundary',
        startedAtMs: dispatchStartedAtMs,
        endedAtMs: dispatchEndedAtMs,
      });

      const recordPostDispatchBoundary = (operation: string) => {
        const gapEndedAtMs = getPerfNow();
        const gapDurationMs = Math.max(0, gapEndedAtMs - dispatchEndedAtMs);
        const runtimeOwners = resolveSearchNavSwitchRuntimeAttributionOwners({
          windowStartMs: dispatchEndedAtMs,
          windowEndMs: gapEndedAtMs,
          limit: NAV_SWITCH_RUNTIME_OWNER_LIMIT,
        }).filter((owner) => owner.owner !== 'navSwitchHarness');
        const attributedRuntimeOverlapMs = runtimeOwners.reduce(
          (total, owner) => total + owner.overlapMs,
          0
        );
        const unattributedGapMs = Math.max(0, gapDurationMs - attributedRuntimeOverlapMs);
        const attributionCoverageRatio =
          gapDurationMs <= 0 ? 0 : Math.min(1, attributedRuntimeOverlapMs / gapDurationMs);
        const primaryOwner = runtimeOwners[0] ?? null;
        emitSearchPerfEvent('Harness', {
          event: 'nav_switch_post_dispatch_gap_attribution',
          harnessRunId: navSwitchHarnessRunId,
          nowMs: roundPerfValue(gapEndedAtMs),
          runNumber: lifecycle.runNumber,
          stepIndex: index,
          targetOverlay,
          operation,
          gapDurationMs: roundPerfValue(gapDurationMs),
          attributedRuntimeOverlapMs: roundPerfValue(attributedRuntimeOverlapMs),
          unattributedGapMs: roundPerfValue(unattributedGapMs),
          attributionCoverageRatio: roundPerfValue(attributionCoverageRatio),
          queueDelayMs: roundPerfValue(unattributedGapMs),
          queueDelayClassification:
            attributionCoverageRatio < 0.25 ? 'scheduler_or_native_wait' : 'runtime_covered',
          runtimeOwnerPrimaryId: primaryOwner?.ownerId ?? null,
          runtimeOwnerPrimaryOverlapMs: primaryOwner?.overlapMs ?? 0,
          runtimeOwnerPrimaryMaxDurationMs: primaryOwner?.maxDurationMs ?? 0,
          runtimeOwnerPrimarySpanCount: primaryOwner?.spanCount ?? 0,
          runtimeOwnerTopComponents: runtimeOwners,
        });
      };

      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          recordPostDispatchBoundary('postDispatchMicrotaskGap');
        });
      } else {
        void Promise.resolve().then(() => {
          recordPostDispatchBoundary('postDispatchMicrotaskGap');
        });
      }
      setTimeout(() => {
        recordPostDispatchBoundary('postDispatchMacrotaskGap');
        checkRouteIdentitySettleRef.current();
      }, 0);
    },
    [
      clearStepHandles,
      emitSearchPerfEvent,
      getPerfNow,
      navSwitchHarnessRunId,
      roundPerfValue,
      selectOverlayHarnessRef,
    ]
  );
  startStepRef.current = startStep;

  const startRun = React.useCallback(
    (runNumber: number) => {
      const lifecycle = lifecycleRef.current;
      if (lifecycle.loopCompleteEmitted) {
        return;
      }
      clearStepHandles();
      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
        lifecycle.cooldownHandle = null;
      }
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
      }
      lifecycle.inProgress = true;
      lifecycle.runNumber = runNumber;
      lifecycle.runStartedAtMs = getPerfNow();
      lifecycle.currentStepIndex = -1;
      lifecycle.currentTarget = null;
      lifecycle.stepStartedAtMs = lifecycle.runStartedAtMs;
      lifecycle.settleCandidateAtMs = 0;
      navSwitchProfilerSpanBufferRef.current = [];
      clearDeferredProfilerOwnerHandles();

      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_run_start',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(lifecycle.stepStartedAtMs),
        runNumber,
        totalRuns: resolvedHarnessConfigRef.current.runs,
        sequence: resolvedHarnessConfigRef.current.navSwitchLoop.sequence,
      });

      lifecycle.runTimeoutHandle = setTimeout(() => {
        completeRunRef.current('run_timeout');
      }, Math.max(resolvedHarnessConfigRef.current.navSwitchLoop.stepTimeoutMs, 1000) * Math.max(1, resolvedHarnessConfigRef.current.navSwitchLoop.sequence.length));

      startStepRef.current(0);
    },
    [
      clearDeferredProfilerOwnerHandles,
      clearStepHandles,
      emitSearchPerfEvent,
      getPerfNow,
      navSwitchHarnessRunId,
      roundPerfValue,
    ]
  );
  startRunRef.current = startRun;

  const checkRouteIdentitySettle = React.useCallback(() => {
    if (!isNavSwitchPerfHarnessScenario) {
      return;
    }
    const lifecycle = lifecycleRef.current;
    if (!lifecycle.inProgress || lifecycle.currentTarget == null) {
      return;
    }

    const routeIdentitySnapshot = syncRouteIdentityRefs();
    const rootOverlay = routeIdentitySnapshot.rootOverlayKey;
    const activeOverlayKey = routeIdentitySnapshot.activeOverlayRouteKey;
    const routeActiveSceneKey = routeIdentitySnapshot.routeActiveSceneKey;

    if (
      !hasRouteIdentitySettledForTarget({
        targetOverlay: lifecycle.currentTarget,
        rootOverlay,
        activeOverlayKey,
        routeActiveSceneKey,
      })
    ) {
      if (lifecycle.settleCandidateAtMs > 0) {
        emitSearchPerfEvent('Harness', {
          event: 'nav_switch_settle_reset',
          harnessRunId: navSwitchHarnessRunId,
          nowMs: roundPerfValue(getPerfNow()),
          runNumber: lifecycle.runNumber,
          stepIndex: lifecycle.currentStepIndex,
          target: lifecycle.currentTarget,
          rootOverlay,
          activeOverlayKey,
          routeActiveSceneKey,
        });
      }
      lifecycle.settleCandidateAtMs = 0;
      if (lifecycle.stepSettleHandle) {
        clearTimeout(lifecycle.stepSettleHandle);
        lifecycle.stepSettleHandle = null;
      }
      if (!lifecycle.settlePollHandle) {
        lifecycle.settlePollHandle = setTimeout(() => {
          lifecycle.settlePollHandle = null;
          checkRouteIdentitySettle();
        }, 16);
      }
      return;
    }

    const candidateAtMs =
      lifecycle.settleCandidateAtMs > 0 ? lifecycle.settleCandidateAtMs : getPerfNow();
    const isNewCandidate = lifecycle.settleCandidateAtMs <= 0;
    lifecycle.settleCandidateAtMs = candidateAtMs;

    if (isNewCandidate) {
      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_settle_candidate',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(getPerfNow()),
        runNumber: lifecycle.runNumber,
        stepIndex: lifecycle.currentStepIndex,
        target: lifecycle.currentTarget,
        rootOverlay,
        activeOverlayKey,
        candidateAtMs: roundPerfValue(candidateAtMs),
        isNewCandidate,
      });
    }

    if (lifecycle.stepSettleHandle) {
      clearTimeout(lifecycle.stepSettleHandle);
    }
    lifecycle.stepSettleHandle = setTimeout(() => {
      const latestLifecycle = lifecycleRef.current;
      const target = latestLifecycle.currentTarget;
      const latestRouteIdentitySnapshot = syncRouteIdentityRefs();
      if (
        !latestLifecycle.inProgress ||
        target == null ||
        !hasRouteIdentitySettledForTarget({
          targetOverlay: target,
          rootOverlay: rootOverlayRef.current,
          activeOverlayKey: activeOverlayKeyRef.current,
          routeActiveSceneKey: latestRouteIdentitySnapshot.routeActiveSceneKey,
        })
      ) {
        checkRouteIdentitySettle();
        return;
      }

      clearStepHandles();
      const nowMs = getPerfNow();
      emitRuntimeAttributionEvent({
        event: 'nav_switch_step_runtime_owners',
        channel: 'Harness',
        runNumber: latestLifecycle.runNumber,
        stage: navSwitchTraceRef.current.stage,
        stepIndex: latestLifecycle.currentStepIndex,
        targetOverlay: target,
        windowEndMs: nowMs,
        windowMs: Math.max(0, nowMs - latestLifecycle.stepStartedAtMs),
      });
      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_step_complete',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(nowMs),
        runNumber: latestLifecycle.runNumber,
        stepIndex: latestLifecycle.currentStepIndex,
        to: target,
        durationMs: roundPerfValue(nowMs - latestLifecycle.stepStartedAtMs),
        settleQuietPeriodMs: resolvedHarnessConfigRef.current.navSwitchLoop.settleQuietPeriodMs,
      });

      const nextStepIndex = latestLifecycle.currentStepIndex + 1;
      if (nextStepIndex >= resolvedHarnessConfigRef.current.navSwitchLoop.sequence.length) {
        completeRunRef.current('settled');
        return;
      }
      latestLifecycle.stepSettleHandle = setTimeout(() => {
        startStepRef.current(nextStepIndex);
      }, resolvedHarnessConfigRef.current.navSwitchLoop.stepCooldownMs);
    }, resolvedHarnessConfigRef.current.navSwitchLoop.settleQuietPeriodMs);
  }, [
    clearStepHandles,
    emitRuntimeAttributionEvent,
    emitSearchPerfEvent,
    getPerfNow,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    roundPerfValue,
    syncRouteIdentityRefs,
  ]);
  checkRouteIdentitySettleRef.current = checkRouteIdentitySettle;

  React.useEffect(() => {
    const routeIdentitySnapshot = syncRouteIdentityRefs();
    if (
      !isNavSwitchPerfHarnessScenario ||
      !routeIdentitySnapshot.isSearchOverlay ||
      !isInitialCameraReady ||
      routeIdentitySnapshot.rootOverlayKey !== 'search'
    ) {
      return;
    }
    const lifecycle = lifecycleRef.current;
    if (lifecycle.bootstrapped && lifecycle.activationKey === resolvedHarnessConfig.activationKey) {
      return;
    }

    clearStepHandles();
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

    lifecycle.bootstrapped = true;
    lifecycle.loopCompleteEmitted = false;
    lifecycle.runNumber = 0;
    lifecycle.completedRuns = 0;
    lifecycle.inProgress = false;
    lifecycle.runStartedAtMs = 0;
    lifecycle.currentStepIndex = -1;
    lifecycle.currentTarget = null;
    lifecycle.stepStartedAtMs = 0;
    lifecycle.settleCandidateAtMs = 0;
    lifecycle.activationKey = resolvedHarnessConfig.activationKey;
    navSwitchProfilerSpanBufferRef.current = [];
    resetTrace();

    const nowMs = getPerfNow();
    emitSearchPerfEvent('Harness', {
      event: 'nav_switch_loop_start',
      harnessRunId: navSwitchHarnessRunId,
      nowMs: roundPerfValue(nowMs),
      scenario: 'search_nav_switch_loop',
      runs: resolvedHarnessConfig.runs,
      startDelayMs: resolvedHarnessConfig.startDelayMs,
      cooldownMs: resolvedHarnessConfig.cooldownMs,
      sequence: resolvedHarnessConfig.navSwitchLoop.sequence,
      settleQuietPeriodMs: resolvedHarnessConfig.navSwitchLoop.settleQuietPeriodMs,
      stepCooldownMs: resolvedHarnessConfig.navSwitchLoop.stepCooldownMs,
      stepTimeoutMs: resolvedHarnessConfig.navSwitchLoop.stepTimeoutMs,
      signature: resolvedHarnessConfig.signature,
    });

    lifecycle.launchHandle = setTimeout(() => {
      startRunRef.current(1);
    }, resolvedHarnessConfig.startDelayMs);
  }, [
    clearStepHandles,
    emitSearchPerfEvent,
    getPerfNow,
    isInitialCameraReady,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    resetTrace,
    resolvedHarnessConfig,
    roundPerfValue,
    syncRouteIdentityRefs,
  ]);

  React.useEffect(() => {
    return () => {
      const lifecycle = lifecycleRef.current;
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
      clearStepHandles();
      lifecycle.bootstrapped = false;
      lifecycle.inProgress = false;
      lifecycle.runStartedAtMs = 0;
      lifecycle.currentStepIndex = -1;
      lifecycle.currentTarget = null;
      lifecycle.stepStartedAtMs = 0;
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.activationKey = null;
      navSwitchProfilerSpanBufferRef.current = [];
      clearDeferredProfilerOwnerHandles();
      resetTrace();
    };
  }, [clearDeferredProfilerOwnerHandles, clearStepHandles, resetTrace]);

  React.useEffect(() => {
    if (!resolvedHarnessConfig.jsFrameSampler.enabled) {
      return;
    }
    const stop = startJsFrameSampler({
      windowMs: resolvedHarnessConfig.jsFrameSampler.windowMs,
      stallFrameMs: resolvedHarnessConfig.jsFrameSampler.stallFrameMs,
      logOnlyBelowFps: resolvedHarnessConfig.jsFrameSampler.logOnlyBelowFps,
      getNow: getPerfNow,
      onWindow: (summary) => {
        if (!isNavSwitchPerfHarnessScenario) {
          return;
        }
        const trace = navSwitchTraceRef.current;
        if (trace.sessionId == null) {
          return;
        }
        const nowMs = getPerfNow();
        const windowEndMs =
          typeof summary.nowMs === 'number' && Number.isFinite(summary.nowMs)
            ? summary.nowMs
            : nowMs;
        const windowMs =
          typeof summary.windowMs === 'number' && Number.isFinite(summary.windowMs)
            ? summary.windowMs
            : resolvedHarnessConfigRef.current.jsFrameSampler.windowMs;
        scheduleWindowProfilerOwnerEvent({
          channel: 'JsFrameSampler',
          event: 'nav_switch_js_window_profiler_owners',
          runNumber: trace.sessionId,
          stage: trace.stage,
          stepIndex: trace.stepIndex,
          targetOverlay: trace.targetOverlay,
          windowEndMs,
          windowMs,
        });
        emitRuntimeAttributionEvent({
          event: 'nav_switch_js_window_runtime_owners',
          channel: 'JsFrameSampler',
          runNumber: trace.sessionId,
          stage: trace.stage,
          stepIndex: trace.stepIndex,
          targetOverlay: trace.targetOverlay,
          windowEndMs,
          windowMs,
        });
        scheduleDeferredSearchPerfEvent('JsFrameSampler', {
          ...summary,
          harnessRunId: navSwitchHarnessRunId,
          navRunNumber: trace.sessionId,
          navStage: trace.stage,
          navStepIndex: trace.stepIndex,
          navTargetOverlay: trace.targetOverlay,
          navElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(nowMs - trace.sessionStartedAtMs),
          navStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(nowMs - trace.stageStartedAtMs),
        });
      },
      onStall: () => undefined,
    });
    return stop;
  }, [
    emitRuntimeAttributionEvent,
    emitSearchPerfEvent,
    getPerfNow,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    resolvedHarnessConfig.jsFrameSampler.enabled,
    resolvedHarnessConfig.jsFrameSampler.logOnlyBelowFps,
    resolvedHarnessConfig.jsFrameSampler.stallFrameMs,
    resolvedHarnessConfig.jsFrameSampler.windowMs,
    roundPerfValue,
    scheduleDeferredSearchPerfEvent,
    scheduleWindowProfilerOwnerEvent,
  ]);

  React.useEffect(() => {
    if (!resolvedHarnessConfig.jsTaskLatencySampler.enabled) {
      return;
    }
    const stop = startJsTaskLatencySampler({
      windowMs: resolvedHarnessConfig.jsTaskLatencySampler.windowMs,
      sampleIntervalMs: resolvedHarnessConfig.jsTaskLatencySampler.sampleIntervalMs,
      stallLagMs: resolvedHarnessConfig.jsTaskLatencySampler.stallLagMs,
      logOnlyAboveLagMs: resolvedHarnessConfig.jsTaskLatencySampler.logOnlyAboveLagMs,
      getNow: getPerfNow,
      onWindow: (summary) => {
        if (!isNavSwitchPerfHarnessScenario) {
          return;
        }
        const trace = navSwitchTraceRef.current;
        if (trace.sessionId == null) {
          return;
        }
        const nowMs = getPerfNow();
        const windowEndMs =
          typeof summary.nowMs === 'number' && Number.isFinite(summary.nowMs)
            ? summary.nowMs
            : nowMs;
        const windowMs =
          typeof summary.windowMs === 'number' && Number.isFinite(summary.windowMs)
            ? summary.windowMs
            : resolvedHarnessConfigRef.current.jsTaskLatencySampler.windowMs;
        scheduleWindowProfilerOwnerEvent({
          channel: 'JsTaskLatencySampler',
          event: 'nav_switch_task_window_profiler_owners',
          runNumber: trace.sessionId,
          stage: trace.stage,
          stepIndex: trace.stepIndex,
          targetOverlay: trace.targetOverlay,
          windowEndMs,
          windowMs,
        });
        emitRuntimeAttributionEvent({
          event: 'nav_switch_task_window_runtime_owners',
          channel: 'JsTaskLatencySampler',
          runNumber: trace.sessionId,
          stage: trace.stage,
          stepIndex: trace.stepIndex,
          targetOverlay: trace.targetOverlay,
          windowEndMs,
          windowMs,
        });
        if (
          typeof summary.maxLagStartedAtMs === 'number' &&
          Number.isFinite(summary.maxLagStartedAtMs) &&
          typeof summary.maxLagEndedAtMs === 'number' &&
          Number.isFinite(summary.maxLagEndedAtMs) &&
          summary.maxLagEndedAtMs > summary.maxLagStartedAtMs
        ) {
          emitRuntimeAttributionEvent({
            event: 'nav_switch_task_max_lag_runtime_owners',
            channel: 'JsTaskLatencySampler',
            runNumber: trace.sessionId,
            stage: trace.stage,
            stepIndex: trace.stepIndex,
            targetOverlay: trace.targetOverlay,
            windowEndMs: summary.maxLagEndedAtMs,
            windowMs: summary.maxLagEndedAtMs - summary.maxLagStartedAtMs,
          });
        }
        scheduleDeferredSearchPerfEvent('JsTaskLatencySampler', {
          ...summary,
          harnessRunId: navSwitchHarnessRunId,
          navRunNumber: trace.sessionId,
          navStage: trace.stage,
          navStepIndex: trace.stepIndex,
          navTargetOverlay: trace.targetOverlay,
          navElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(nowMs - trace.sessionStartedAtMs),
          navStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(nowMs - trace.stageStartedAtMs),
        });
      },
      onStall: () => undefined,
    });
    return stop;
  }, [
    emitRuntimeAttributionEvent,
    getPerfNow,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    resolvedHarnessConfig.jsTaskLatencySampler.enabled,
    resolvedHarnessConfig.jsTaskLatencySampler.logOnlyAboveLagMs,
    resolvedHarnessConfig.jsTaskLatencySampler.sampleIntervalMs,
    resolvedHarnessConfig.jsTaskLatencySampler.stallLagMs,
    resolvedHarnessConfig.jsTaskLatencySampler.windowMs,
    roundPerfValue,
    scheduleDeferredSearchPerfEvent,
    scheduleWindowProfilerOwnerEvent,
  ]);

  React.useEffect(() => {
    if (!resolvedHarnessConfig.uiFrameSampler.enabled) {
      return;
    }
    const stop = startUiFrameSampler({
      windowMs: resolvedHarnessConfig.uiFrameSampler.windowMs,
      stallFrameMs: resolvedHarnessConfig.uiFrameSampler.stallFrameMs,
      logOnlyBelowFps: resolvedHarnessConfig.uiFrameSampler.logOnlyBelowFps,
      onWindow: (summary) => {
        if (!isNavSwitchPerfHarnessScenario) {
          return;
        }
        const trace = navSwitchTraceRef.current;
        if (trace.sessionId == null) {
          return;
        }
        const nowMs = getPerfNow();
        scheduleDeferredSearchPerfEvent('UiFrameSampler', {
          ...summary,
          harnessRunId: navSwitchHarnessRunId,
          navRunNumber: trace.sessionId,
          navStage: trace.stage,
          navStepIndex: trace.stepIndex,
          navTargetOverlay: trace.targetOverlay,
          navElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(nowMs - trace.sessionStartedAtMs),
          navStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(nowMs - trace.stageStartedAtMs),
        });
      },
      onStall: () => undefined,
    });
    return stop;
  }, [
    emitSearchPerfEvent,
    getPerfNow,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    resolvedHarnessConfig.uiFrameSampler.enabled,
    resolvedHarnessConfig.uiFrameSampler.logOnlyBelowFps,
    resolvedHarnessConfig.uiFrameSampler.stallFrameMs,
    resolvedHarnessConfig.uiFrameSampler.windowMs,
    roundPerfValue,
    scheduleDeferredSearchPerfEvent,
  ]);

  return {
    isNavSwitchPerfHarnessScenario,
    getActiveNavSwitchRunNumber,
    recordNavSwitchProfilerSpan,
  };
};

export type { UseNavSwitchHarnessObserverArgs, UseNavSwitchHarnessObserverResult };
export { useNavSwitchHarnessObserver };
