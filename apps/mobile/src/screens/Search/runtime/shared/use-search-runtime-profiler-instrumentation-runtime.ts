import React from 'react';

import { logger } from '../../../../utils';
import { getActiveSearchNavSwitchPerfProbe } from './search-nav-switch-perf-probe';

import type {
  InstrumentationMapQueryBudget,
  RunOneHandoffCoordinatorLike,
} from './use-search-runtime-instrumentation-runtime-contract';

const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION === '1';
const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS = 0.25;
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG === '1';
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS = 12;
const RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS = 45;
const RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS = new Set([
  'SearchScreen',
  'SearchMapTree',
  'AppOverlayRouteHost',
  'SearchOverlayChrome',
  'BottomNav',
]);
const SHOULD_LOG_PROFILER = false;
const PROFILER_MIN_MS = Number.POSITIVE_INFINITY;
const NAV_SWITCH_PROFILER_LOG_MIN_MS = 4;

type UseSearchRuntimeProfilerInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  getActiveShortcutRunNumber: () => number | null;
  recordProfilerSpan: (args: {
    id: string;
    phase: string;
    stageHint: string;
    actualDurationMs: number;
    commitSpanMs: number;
    startTimeMs: number;
    commitTimeMs: number;
    nowMs: number;
    runNumber: number;
  }) => void;
  isShortcutPerfHarnessScenario: boolean;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  resolveProfilerStageHint: () => string;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  searchMode: 'natural' | 'shortcut' | null;
  shortcutHarnessRunId: string | null;
};

const normalizeProfilerContributorId = (id: string): string => {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
};

export const useSearchRuntimeProfilerInstrumentationRuntime = ({
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
}: UseSearchRuntimeProfilerInstrumentationRuntimeArgs): React.ProfilerOnRenderCallback =>
  React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      const activeNavSwitchProbe = getActiveSearchNavSwitchPerfProbe();
      if (SHOULD_LOG_PROFILER && actualDuration >= PROFILER_MIN_MS) {
        logger.debug(
          `[SearchPerf] Profiler ${id} ${phase} actual=${actualDuration.toFixed(
            1
          )}ms base=${baseDuration.toFixed(1)}ms`
        );
      }
      const shouldRecordProfilerAttribution =
        JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE && searchMode === 'shortcut';
      const shouldEmitProfilerSpanLog =
        JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE && searchMode === 'shortcut';
      const shouldCaptureProfilerSpanForHarness = isShortcutPerfHarnessScenario;
      const shouldEmitNavSwitchProfilerLog = activeNavSwitchProbe != null;
      if (
        !shouldRecordProfilerAttribution &&
        !shouldEmitProfilerSpanLog &&
        !shouldCaptureProfilerSpanForHarness &&
        !shouldEmitNavSwitchProfilerLog
      ) {
        return;
      }

      const activeRunNumber =
        shouldRecordProfilerAttribution ||
        shouldEmitProfilerSpanLog ||
        shouldCaptureProfilerSpanForHarness
          ? getActiveShortcutRunNumber()
          : null;
      if (
        (shouldRecordProfilerAttribution ||
          shouldEmitProfilerSpanLog ||
          shouldCaptureProfilerSpanForHarness) &&
        activeRunNumber == null
      ) {
        return;
      }

      const contributorBase = normalizeProfilerContributorId(id);
      if (
        shouldRecordProfilerAttribution &&
        actualDuration >= JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS
      ) {
        mapQueryBudget?.recordRuntimeAttributionDurationMs(
          `profiler_render_${contributorBase}`,
          actualDuration
        );
      }

      if (Number.isFinite(startTime) && Number.isFinite(commitTime)) {
        const commitSpanMs = Math.max(0, commitTime - startTime);
        const stageHint = resolveProfilerStageHint();
        recordProfilerSpan({
          id,
          phase,
          stageHint,
          actualDurationMs: Number(actualDuration.toFixed(3)),
          commitSpanMs: Number(commitSpanMs.toFixed(3)),
          startTimeMs: Number(startTime.toFixed(3)),
          commitTimeMs: Number(commitTime.toFixed(3)),
          nowMs: Number(getPerfNow().toFixed(3)),
          runNumber: activeRunNumber,
        });
        if (
          shouldRecordProfilerAttribution &&
          commitSpanMs >= JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS
        ) {
          mapQueryBudget?.recordRuntimeAttributionDurationMs(
            `profiler_commit_span_${contributorBase}`,
            commitSpanMs
          );
        }
        if (
          activeRunNumber === 1 &&
          commitSpanMs >= RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS &&
          RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS.has(id)
        ) {
          const handoffSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
          const operationId = handoffSnapshot.operationId;
          if (operationId && handoffSnapshot.phase !== 'idle') {
            const previousMaxCommitSpanMs =
              runOneCommitSpanPressureByOperationRef.current.get(operationId) ?? 0;
            const nextMaxCommitSpanMs = Math.max(previousMaxCommitSpanMs, commitSpanMs);
            if (nextMaxCommitSpanMs > previousMaxCommitSpanMs) {
              runOneCommitSpanPressureByOperationRef.current.set(operationId, nextMaxCommitSpanMs);
            }
            if (previousMaxCommitSpanMs <= 0) {
              runOneHandoffCoordinatorRef.current.advancePhase(handoffSnapshot.phase, {
                operationId,
                commitSpanPressure: true,
                maxRun1CommitSpanMs: Number(nextMaxCommitSpanMs.toFixed(1)),
                commitSpanPressureComponent: id,
                commitSpanPressureDetectedAtMs: Number(getPerfNow().toFixed(1)),
              });
            }
          }
        }
        if (
          shouldEmitProfilerSpanLog &&
          (actualDuration >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS ||
            commitSpanMs >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS)
        ) {
          logger.debug('[SearchPerf][Profiler]', {
            event: 'profiler_span',
            id,
            phase,
            stageHint,
            actualDurationMs: Number(actualDuration.toFixed(1)),
            commitSpanMs: Number(commitSpanMs.toFixed(1)),
            nowMs: Number(getPerfNow().toFixed(1)),
            runNumber: activeRunNumber,
            harnessRunId: shortcutHarnessRunId,
          });
        }
        if (
          shouldEmitNavSwitchProfilerLog &&
          activeNavSwitchProbe &&
          (actualDuration >= NAV_SWITCH_PROFILER_LOG_MIN_MS ||
            commitSpanMs >= NAV_SWITCH_PROFILER_LOG_MIN_MS)
        ) {
          logger.debug('[NAV-SWITCH-PERF] profilerSpan', {
            seq: activeNavSwitchProbe.seq,
            from: activeNavSwitchProbe.from,
            to: activeNavSwitchProbe.to,
            id,
            phase,
            actualDurationMs: Number(actualDuration.toFixed(1)),
            baseDurationMs: Number(baseDuration.toFixed(1)),
            commitSpanMs: Number(commitSpanMs.toFixed(1)),
            ageMs: Number((getPerfNow() - activeNavSwitchProbe.startedAtMs).toFixed(1)),
          });
        }
      }
    },
    [
      getActiveShortcutRunNumber,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      mapQueryBudget,
      recordProfilerSpan,
      resolveProfilerStageHint,
      runOneCommitSpanPressureByOperationRef,
      runOneHandoffCoordinatorRef,
      searchMode,
      shortcutHarnessRunId,
    ]
  );
