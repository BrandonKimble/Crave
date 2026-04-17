import React from 'react';

import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { useShortcutHarnessObserver } from '../telemetry/shortcut-harness-observer';
import { useNavSwitchHarnessObserver } from '../telemetry/nav-switch-harness-observer';
import {
  type ShortcutHarnessObserverArgs,
  type UseSearchRuntimeInstrumentationRuntimeArgs,
  type UseSearchRuntimeInstrumentationRuntimeResult,
} from './use-search-runtime-instrumentation-runtime-contract';
import { useSearchRuntimeProfilerInstrumentationRuntime } from './use-search-runtime-profiler-instrumentation-runtime';
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
  isSearchOverlay,
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
  resultsPage,
}: UseSearchRuntimeInstrumentationRuntimeArgs): UseSearchRuntimeInstrumentationRuntimeResult => {
  const logSearchCompute = React.useCallback((_label: string, _duration: number) => {}, []);
  const submitShortcutSearchRef = React.useRef<
    ShortcutHarnessObserverArgs['submitShortcutSearchRef']['current']
  >(async () => undefined);
  const toggleOpenNowHarnessRef = React.useRef<
    ShortcutHarnessObserverArgs['toggleOpenNowRef']['current']
  >(() => undefined);
  const selectOverlayHarnessRef = React.useRef<
    (target: 'search' | 'bookmarks' | 'profile') => void
  >(() => undefined);

  const profilerRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      shouldHydrateResultsForRender: state.shouldHydrateResultsForRender,
      isLoadingMore: state.isLoadingMore,
      resultsPresentation: state.resultsPresentation,
    }),
    (left, right) =>
      left.shouldHydrateResultsForRender === right.shouldHydrateResultsForRender &&
      left.isLoadingMore === right.isLoadingMore &&
      areResultsPresentationReadModelsEqual(left.resultsPresentation, right.resultsPresentation),
    ['shouldHydrateResultsForRender', 'isLoadingMore', 'resultsPresentation'] as const
  );
  const profilerShouldHydrateResultsForRenderRef = React.useRef(
    profilerRuntimeState.shouldHydrateResultsForRender
  );
  const profilerIsResultsPresentationPendingRef = React.useRef(
    profilerRuntimeState.resultsPresentation.isPending
  );
  React.useEffect(() => {
    profilerIsResultsPresentationPendingRef.current =
      profilerRuntimeState.resultsPresentation.isPending;
  }, [profilerRuntimeState.resultsPresentation]);
  React.useEffect(() => {
    profilerShouldHydrateResultsForRenderRef.current =
      profilerRuntimeState.shouldHydrateResultsForRender;
  }, [profilerRuntimeState.shouldHydrateResultsForRender]);

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
    mapQueryBudget,
    searchMode,
    isSearchLoading,
    isLoadingMore: profilerRuntimeState.isLoadingMore,
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
  useNavSwitchHarnessObserver({
    getPerfNow,
    roundPerfValue,
    selectOverlayHarnessRef,
    isSearchOverlay,
    isInitialCameraReady,
    rootOverlay,
    activeOverlayKey,
  });

  const resolveProfilerStageHint = React.useCallback(() => {
    if (profilerShouldHydrateResultsForRenderRef.current) {
      return 'results_hydration_commit';
    }
    if (profilerIsResultsPresentationPendingRef.current) {
      return 'visual_sync_state';
    }
    if (isSearchRequestLoadingRef.current) {
      return 'results_list_materialization';
    }
    return 'post_visual';
  }, [isSearchRequestLoadingRef]);

  const handleProfilerRender = useSearchRuntimeProfilerInstrumentationRuntime({
    getPerfNow,
    getActiveShortcutRunNumber,
    recordProfilerSpan,
    isShortcutPerfHarnessScenario,
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
