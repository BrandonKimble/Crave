import React from 'react';

import type { PerfNavSwitchOverlay } from '../../../../perf/harness-config';
import { useShortcutHarnessObserver } from '../telemetry/shortcut-harness-observer';
import { useNavSwitchHarnessObserver } from '../telemetry/nav-switch-harness-observer';
import {
  type ShortcutHarnessObserverArgs,
  type UseSearchRuntimeInstrumentationRuntimeArgs,
  type UseSearchRuntimeInstrumentationRuntimeResult,
} from './use-search-runtime-instrumentation-runtime-contract';
import { useSearchRuntimeProfilerInstrumentationRuntime } from './use-search-runtime-profiler-instrumentation-runtime';
import { useSearchRuntimeProfilerStageHintRuntime } from './use-search-runtime-profiler-stage-hint-runtime';
import { useSearchRuntimeRunOneTelemetryRuntime } from './use-search-runtime-run-one-telemetry-runtime';
import { useSearchRuntimeStallInstrumentationRuntime } from './use-search-runtime-stall-instrumentation-runtime';
import { useSearchRuntimeStateTelemetryRuntime } from './use-search-runtime-state-telemetry-runtime';

const SHOULD_LOG_MAP_EVENT_RATES = false;
const MAP_EVENT_LOG_INTERVAL_MS = 0;
const SHOULD_LOG_SEARCH_COMPUTES = false;
const SHOULD_LOG_SEARCH_STATE_CHANGES = false;
const SHOULD_LOG_RESULTS_VIEWABILITY = false;
export const useSearchRuntimeInstrumentationRuntime = ({
  getPerfNow,
  roundPerfValue,
  searchSessionController,
  searchMode,
  isSearchLoading,
  isLoadingMore: _isLoadingMore,
  isRunOneHandoffActive,
  resultsRequestKey,
  searchInteractionRef,
  isInitialCameraReady,
  runTimeoutMs,
  settleQuietPeriodMs,
  runtimeWorkSchedulerRef,
  searchRuntimeBus,
  mapQueryBudget,
  runOneHandoffCoordinatorRef,
  runOneCommitSpanPressureByOperationRef,
  isSearchRequestLoadingRef,
  readRuntimeMemoryDiagnostics,
  isSearchSessionActive,
  isAutocompleteSuppressed,
  rootOverlay,
  activeOverlayKey,
  isSearchOverlay,
  getRouteOverlayIdentitySnapshot,
  getRouteActiveSceneKey,
  resultsPage,
}: UseSearchRuntimeInstrumentationRuntimeArgs): UseSearchRuntimeInstrumentationRuntimeResult => {
  const logSearchCompute = React.useCallback((_label: string, _duration: number) => {}, []);
  const submitShortcutSearchRef = React.useRef<
    ShortcutHarnessObserverArgs['submitShortcutSearchRef']['current']
  >(async () => undefined);
  const toggleOpenNowHarnessRef = React.useRef<
    ShortcutHarnessObserverArgs['toggleOpenNowRef']['current']
  >(() => undefined);
  const closeSearchHarnessRef = React.useRef<() => void>(() => undefined);
  const selectOverlayHarnessRef = React.useRef<(target: PerfNavSwitchOverlay) => void>(
    () => undefined
  );
  const { profilerRuntimeState, resolveProfilerStageHint } =
    useSearchRuntimeProfilerStageHintRuntime({
      searchRuntimeBus,
      isSearchRequestLoadingRef,
    });

  const {
    emitRuntimeMechanismEvent,
    shortcutHarnessRunId,
    getActiveShortcutRunNumber,
    recordProfilerSpan,
    isShortcutPerfHarnessScenario,
  } = useShortcutHarnessObserver({
    getPerfNow,
    roundPerfValue,
    searchSessionController,
    submitShortcutSearchRef,
    toggleOpenNowRef: toggleOpenNowHarnessRef,
    closeSearchRef: closeSearchHarnessRef,
    mapQueryBudget,
    searchMode,
    isSearchLoading,
    isLoadingMore: profilerRuntimeState.isLoadingMore,
    isSearchSessionActive,
    isRunOneHandoffActive,
    resultsRequestKey,
    searchInteractionRef,
    isSearchOverlay,
    isInitialCameraReady,
    runTimeoutMs,
    settleQuietPeriodMs,
    searchRuntimeBus,
    runtimeWorkSchedulerRef,
  });
  const {
    getActiveNavSwitchRunNumber,
    recordNavSwitchProfilerSpan,
    isNavSwitchPerfHarnessScenario,
  } = useNavSwitchHarnessObserver({
    getPerfNow,
    roundPerfValue,
    selectOverlayHarnessRef,
    isSearchOverlay,
    rootOverlay,
    activeOverlayKey,
    getRouteOverlayIdentitySnapshot,
    getRouteActiveSceneKey,
    isInitialCameraReady,
  });

  const handleProfilerRender = useSearchRuntimeProfilerInstrumentationRuntime({
    getPerfNow,
    getActiveShortcutRunNumber,
    getActiveNavSwitchRunNumber,
    recordProfilerSpan,
    recordNavSwitchProfilerSpan,
    isShortcutPerfHarnessScenario,
    isNavSwitchPerfHarnessScenario,
    mapQueryBudget,
    resolveProfilerStageHint,
    runOneCommitSpanPressureByOperationRef,
    runOneHandoffCoordinatorRef,
    searchMode,
    shortcutHarnessRunId,
  });

  useSearchRuntimeStallInstrumentationRuntime({
    getPerfNow,
    getActiveShortcutRunNumber,
    resolveProfilerStageHint,
    searchInteractionRef,
    readRuntimeMemoryDiagnostics,
    shortcutHarnessRunId,
  });

  useSearchRuntimeRunOneTelemetryRuntime({
    searchRuntimeBus,
    getActiveShortcutRunNumber,
    emitRuntimeMechanismEvent,
    runOneHandoffCoordinatorRef,
    shortcutHarnessRunId,
  });

  useSearchRuntimeStateTelemetryRuntime({
    searchRuntimeBus,
    getActiveShortcutRunNumber,
    emitRuntimeMechanismEvent,
    searchMode,
    isSearchSessionActive,
    isSearchLoading,
    isAutocompleteSuppressed,
    rootOverlay,
    activeOverlayKey,
    isSearchOverlay,
    resultsRequestKey,
    resultsPage,
  });

  return {
    emitRuntimeMechanismEvent,
    submitShortcutSearchRef,
    toggleOpenNowHarnessRef,
    closeSearchHarnessRef,
    selectOverlayHarnessRef,
    handleProfilerRender,
    shouldLogSearchComputes: SHOULD_LOG_SEARCH_COMPUTES,
    logSearchCompute,
    shouldLogSearchStateChanges: SHOULD_LOG_SEARCH_STATE_CHANGES,
    shouldLogResultsViewability: SHOULD_LOG_RESULTS_VIEWABILITY,
    shouldLogMapEventRates: SHOULD_LOG_MAP_EVENT_RATES,
    mapEventLogIntervalMs: MAP_EVENT_LOG_INTERVAL_MS,
  };
};
