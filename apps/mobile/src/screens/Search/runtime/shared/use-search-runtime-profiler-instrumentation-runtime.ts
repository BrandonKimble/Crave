import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO,
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  getActiveSearchNavSwitchAttributionProbe,
  shouldLogSearchNavSwitchAttribution,
} from './search-nav-switch-perf-probe';
import { logSearchProfilerSpan } from './search-runtime-profiler-log-runtime';

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
  resolveProfilerStageHint: () => string;
  searchMode: 'natural' | 'shortcut' | null;
  scenarioRunId: string | null;
};

export const useSearchRuntimeProfilerInstrumentationRuntime = ({
  getPerfNow,
  getActiveScenarioRunNumber,
  resolveProfilerStageHint,
  searchMode,
  scenarioRunId,
}: UseSearchRuntimeProfilerInstrumentationRuntimeArgs): React.ProfilerOnRenderCallback | null => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);

  // F6601: THE OFF-SWITCH DECIDED PER COMMIT WHAT IT MUST DECIDE PER MOUNT.
  //
  // The three emit-reasons below were computed inside the callback, which then
  // returned early when none held — so the hook's declared `| null` had no
  // producer, `React.Profiler` was permanently mounted across the overlay tree,
  // and every host's "no profiler" arm was unreachable. All three reasons are
  // knowable at render time: two are hook inputs, and the nav-switch reason is
  // gated by `EXPO_PUBLIC_PERF_NAV_SWITCH_ATTRIBUTION` — a module constant, so
  // when it is off no probe can ever be active and no commit can change that.
  // Hoisting them here loses no sample: in exactly the case the hook now
  // returns null, the callback would have returned at its first branch.
  const shouldEmitProfilerSpanLog =
    JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE && searchMode === 'shortcut';
  const shouldEmitScenarioProfilerSpan = isPerfScenarioAttributionActive(activeScenarioConfig);
  const isProfilerInstrumentationArmed =
    shouldEmitProfilerSpanLog ||
    shouldEmitScenarioProfilerSpan ||
    shouldLogSearchNavSwitchAttribution();

  const profilerRender = React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      // Still narrowed per commit: the nav-switch probe opens and expires on a
      // wall clock, not on a render, so being armed is not being active.
      const activeNavSwitchProbe = getActiveSearchNavSwitchAttributionProbe();
      const shouldEmitNavSwitchProfilerLog = activeNavSwitchProbe != null;
      if (
        !shouldEmitProfilerSpanLog &&
        !shouldEmitScenarioProfilerSpan &&
        !shouldEmitNavSwitchProfilerLog
      ) {
        return;
      }

      const activeScenarioRunNumber = getActiveScenarioRunNumber();
      const resolvedRunNumber = activeScenarioRunNumber ?? 0;

      if (Number.isFinite(startTime) && Number.isFinite(commitTime)) {
        const commitSpanMs = Math.max(0, commitTime - startTime);
        const stageHint = resolveProfilerStageHint();
        const nowMs = getPerfNow();
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
          });
        }
      }
    },
    [
      activeScenarioConfig,
      getActiveScenarioRunNumber,
      getPerfNow,
      resolveProfilerStageHint,
      searchMode,
      scenarioRunId,
      shouldEmitProfilerSpanLog,
      shouldEmitScenarioProfilerSpan,
    ]
  );

  return isProfilerInstrumentationArmed ? profilerRender : null;
};
