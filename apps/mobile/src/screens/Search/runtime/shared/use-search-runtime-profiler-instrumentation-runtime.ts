import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO,
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { getActiveSearchNavSwitchAttributionProbe } from './search-nav-switch-perf-probe';
import { logSearchProfilerSpan } from './search-runtime-profiler-log-runtime';
import { applySearchSurfaceRedrawCommitSpanPressure } from './search-runtime-profiler-pressure-runtime';
import {
  normalizeProfilerContributorId,
  recordProfilerAttribution,
} from './search-runtime-profiler-attribution-runtime';

import type {
  InstrumentationMapQueryBudget,
  SearchSurfaceRedrawCoordinatorLike,
} from './use-search-runtime-instrumentation-runtime-contract';

const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION === '1';
const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS = 0.25;
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG === '1';

const isMeasuredSubmitDismissProfilerScenario = (scenario: string): boolean =>
  scenario === SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO ||
  scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO}_`) ||
  scenario === SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO ||
  scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO}_`);

const shouldEmitScenarioProfilerSample = ({
  actualDuration,
  commitSpanMs,
  id,
  scenario,
  stageHint,
}: {
  actualDuration: number;
  commitSpanMs: number;
  id: string;
  scenario: string;
  stageHint: string;
}): boolean => {
  if (!isMeasuredSubmitDismissProfilerScenario(scenario)) {
    return true;
  }
  if (stageHint === 'results_hydration_commit' || stageHint === 'results_list_materialization') {
    return actualDuration >= 4 || commitSpanMs >= 10 || id === 'SearchMountedResultsListTarget';
  }
  if (stageHint === 'post_visual' || stageHint === 'visual_sync_state') {
    return actualDuration >= 8 || commitSpanMs >= 14;
  }
  return actualDuration >= 4 || commitSpanMs >= 12;
};

type UseSearchRuntimeProfilerInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  getActiveScenarioRunNumber: () => number | null;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  resolveProfilerStageHint: () => string;
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
  searchMode: 'natural' | 'shortcut' | null;
  scenarioRunId: string | null;
};

export const useSearchRuntimeProfilerInstrumentationRuntime = ({
  getPerfNow,
  getActiveScenarioRunNumber,
  mapQueryBudget,
  resolveProfilerStageHint,
  searchSurfaceRedrawCommitSpanPressureByOperationRef,
  searchSurfaceRedrawCoordinatorRef,
  searchMode,
  scenarioRunId,
}: UseSearchRuntimeProfilerInstrumentationRuntimeArgs): React.ProfilerOnRenderCallback | null => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);

  const profilerRender = React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      const activeNavSwitchProbe = getActiveSearchNavSwitchAttributionProbe();
      const shouldRecordProfilerAttribution =
        JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE && searchMode === 'shortcut';
      const shouldEmitProfilerSpanLog =
        JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE && searchMode === 'shortcut';
      const shouldEmitScenarioProfilerSpan = isPerfScenarioAttributionActive(activeScenarioConfig);
      const shouldEmitNavSwitchProfilerLog = activeNavSwitchProbe != null;
      if (
        !shouldRecordProfilerAttribution &&
        !shouldEmitProfilerSpanLog &&
        !shouldEmitScenarioProfilerSpan &&
        !shouldEmitNavSwitchProfilerLog
      ) {
        return;
      }

      const activeScenarioRunNumber = getActiveScenarioRunNumber();
      const resolvedRunNumber = activeScenarioRunNumber ?? 0;

      const contributorBase = normalizeProfilerContributorId(id);

      if (Number.isFinite(startTime) && Number.isFinite(commitTime)) {
        const commitSpanMs = Math.max(0, commitTime - startTime);
        const stageHint = resolveProfilerStageHint();
        const nowMs = getPerfNow();
        const spanPayload = {
          id,
          phase,
          stageHint,
          actualDurationMs: Number(actualDuration.toFixed(3)),
          commitSpanMs: Number(commitSpanMs.toFixed(3)),
          startTimeMs: Number(startTime.toFixed(3)),
          commitTimeMs: Number(commitTime.toFixed(3)),
          nowMs: Number(nowMs.toFixed(3)),
        };
        recordProfilerAttribution({
          shouldRecordProfilerAttribution,
          mapQueryBudget,
          contributorBase,
          actualDuration,
          commitSpanMs,
          minDurationMs: JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS,
        });
        applySearchSurfaceRedrawCommitSpanPressure({
          id,
          commitSpanMs,
          resolvedRunNumber,
          getPerfNow,
          searchSurfaceRedrawCommitSpanPressureByOperationRef,
          searchSurfaceRedrawCoordinatorRef,
        });
        logSearchProfilerSpan({
          id,
          phase,
          actualDuration,
          baseDuration,
          commitSpanMs,
          stageHint,
          nowMs,
          runNumber: resolvedRunNumber,
          scenarioRunId,
          shouldEmitProfilerSpanLog,
          shouldEmitNavSwitchProfilerLog,
          activeNavSwitchProbe,
        });
        if (
          shouldEmitScenarioProfilerSpan &&
          shouldEmitScenarioProfilerSample({
            actualDuration,
            commitSpanMs,
            id,
            scenario: activeScenarioConfig.scenario,
            stageHint,
          })
        ) {
          const handoffSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
          logPerfScenarioAttributionEvent('Profiler', activeScenarioConfig, {
            event: 'scenario_profiler_span',
            id,
            phase,
            stageHint,
            actualDurationMs: Number(actualDuration.toFixed(3)),
            baseDurationMs: Number(baseDuration.toFixed(3)),
            commitSpanMs: Number(commitSpanMs.toFixed(3)),
            startTimeMs: Number(startTime.toFixed(3)),
            commitTimeMs: Number(commitTime.toFixed(3)),
            nowMs: Number(nowMs.toFixed(3)),
            searchMode,
            handoffOperationId: handoffSnapshot.operationId,
            handoffPhase: handoffSnapshot.phase,
            handoffSeq: handoffSnapshot.seq,
            handoffPage: handoffSnapshot.page,
          });
        }
      }
    },
    [
      activeScenarioConfig,
      getActiveScenarioRunNumber,
      getPerfNow,
      mapQueryBudget,
      resolveProfilerStageHint,
      searchSurfaceRedrawCommitSpanPressureByOperationRef,
      searchSurfaceRedrawCoordinatorRef,
      searchMode,
      scenarioRunId,
    ]
  );

  return profilerRender;
};
