import React from 'react';

import perfHarnessConfig, { type PerfNavSwitchOverlay } from '../../../../perf/harness-config';
import { usePerfHarnessRuntimeStore } from '../../../../perf/perf-harness-runtime-store';
import type { RuntimePerfHarnessConfig } from '../../../../perf/perf-harness-runtime-store';
import { startJsFrameSampler } from '../../../../perf/js-frame-sampler';
import { startUiFrameSampler } from '../../../../perf/ui-frame-sampler';
import { logger } from '../../../../utils';

type SelectOverlayHarnessRef = React.MutableRefObject<(target: PerfNavSwitchOverlay) => void>;

type UseNavSwitchHarnessObserverArgs = {
  getPerfNow: () => number;
  roundPerfValue: (value: number) => number;
  selectOverlayHarnessRef: SelectOverlayHarnessRef;
  isSearchOverlay: boolean;
  isInitialCameraReady: boolean;
  rootOverlay: string;
  activeOverlayKey: string;
};

type UseNavSwitchHarnessObserverResult = {
  isNavSwitchPerfHarnessScenario: boolean;
};

type NavSwitchHarnessTrace = {
  sessionId: number | null;
  sessionStartedAtMs: number | null;
  stage: string | null;
  stageStartedAtMs: number | null;
  stepIndex: number | null;
  targetOverlay: PerfNavSwitchOverlay | null;
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
  uiFrameSampler: RuntimePerfHarnessConfig['uiFrameSampler'];
  activationKey: string | null;
};

const useNavSwitchHarnessObserver = ({
  getPerfNow,
  roundPerfValue,
  selectOverlayHarnessRef,
  isSearchOverlay,
  isInitialCameraReady,
  rootOverlay,
  activeOverlayKey,
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
    runTimeoutHandle: null,
    stepTimeoutHandle: null,
    activationKey: null,
  });

  const emitSearchPerfEvent = React.useCallback(
    (
      channel: 'Harness' | 'JsFrameSampler' | 'UiFrameSampler',
      payload: Record<string, unknown>
    ) => {
      logger.debug(`[SearchPerf][${channel}]`, payload);
    },
    []
  );

  const clearStepHandles = React.useCallback(() => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle.stepSettleHandle) {
      clearTimeout(lifecycle.stepSettleHandle);
      lifecycle.stepSettleHandle = null;
    }
    if (lifecycle.stepTimeoutHandle) {
      clearTimeout(lifecycle.stepTimeoutHandle);
      lifecycle.stepTimeoutHandle = null;
    }
  }, []);

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

  const completeRunRef = React.useRef<(status: string) => void>(() => undefined);
  const startRunRef = React.useRef<(runNumber: number) => void>(() => undefined);
  const startStepRef = React.useRef<(index: number) => void>(() => undefined);

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

      selectOverlayHarnessRef.current(targetOverlay);
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

      emitSearchPerfEvent('Harness', {
        event: 'nav_switch_run_start',
        harnessRunId: navSwitchHarnessRunId,
        nowMs: roundPerfValue(lifecycle.stepStartedAtMs),
        runNumber,
        totalRuns: resolvedHarnessConfigRef.current.runs,
        sequence: resolvedHarnessConfigRef.current.navSwitchLoop.sequence,
      });

      lifecycle.runTimeoutHandle = setTimeout(
        () => {
          completeRunRef.current('run_timeout');
        },
        Math.max(resolvedHarnessConfigRef.current.navSwitchLoop.stepTimeoutMs, 1000) *
          Math.max(1, resolvedHarnessConfigRef.current.navSwitchLoop.sequence.length)
      );

      startStepRef.current(0);
    },
    [clearStepHandles, emitSearchPerfEvent, getPerfNow, navSwitchHarnessRunId, roundPerfValue]
  );
  startRunRef.current = startRun;

  React.useEffect(() => {
    rootOverlayRef.current = rootOverlay;
    activeOverlayKeyRef.current = activeOverlayKey;

    if (!isNavSwitchPerfHarnessScenario) {
      return;
    }
    const lifecycle = lifecycleRef.current;
    if (!lifecycle.inProgress || lifecycle.currentTarget == null) {
      return;
    }

    if (rootOverlay !== lifecycle.currentTarget || activeOverlayKey !== lifecycle.currentTarget) {
      lifecycle.settleCandidateAtMs = 0;
      if (lifecycle.stepSettleHandle) {
        clearTimeout(lifecycle.stepSettleHandle);
        lifecycle.stepSettleHandle = null;
      }
      return;
    }

    const candidateAtMs =
      lifecycle.settleCandidateAtMs > 0 ? lifecycle.settleCandidateAtMs : getPerfNow();
    lifecycle.settleCandidateAtMs = candidateAtMs;

    if (lifecycle.stepSettleHandle) {
      clearTimeout(lifecycle.stepSettleHandle);
    }
    lifecycle.stepSettleHandle = setTimeout(() => {
      const latestLifecycle = lifecycleRef.current;
      const target = latestLifecycle.currentTarget;
      if (
        !latestLifecycle.inProgress ||
        target == null ||
        rootOverlayRef.current !== target ||
        activeOverlayKeyRef.current !== target
      ) {
        return;
      }

      clearStepHandles();
      const nowMs = getPerfNow();
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
    activeOverlayKey,
    clearStepHandles,
    emitSearchPerfEvent,
    getPerfNow,
    isNavSwitchPerfHarnessScenario,
    navSwitchHarnessRunId,
    rootOverlay,
    roundPerfValue,
  ]);

  React.useEffect(() => {
    if (
      !isNavSwitchPerfHarnessScenario ||
      !isSearchOverlay ||
      !isInitialCameraReady ||
      rootOverlay !== 'search'
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
    isSearchOverlay,
    navSwitchHarnessRunId,
    resetTrace,
    resolvedHarnessConfig,
    rootOverlay,
    roundPerfValue,
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
      resetTrace();
    };
  }, [clearStepHandles, resetTrace]);

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
        emitSearchPerfEvent('JsFrameSampler', {
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
    resolvedHarnessConfig.jsFrameSampler.enabled,
    resolvedHarnessConfig.jsFrameSampler.logOnlyBelowFps,
    resolvedHarnessConfig.jsFrameSampler.stallFrameMs,
    resolvedHarnessConfig.jsFrameSampler.windowMs,
    roundPerfValue,
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
        emitSearchPerfEvent('UiFrameSampler', {
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
  ]);

  return {
    isNavSwitchPerfHarnessScenario,
  };
};

export type { UseNavSwitchHarnessObserverArgs, UseNavSwitchHarnessObserverResult };
export { useNavSwitchHarnessObserver };
