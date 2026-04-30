import React from 'react';

import { getActiveSearchNavSwitchAttributionProbe } from './search-nav-switch-perf-probe';
import { logSearchProfilerSpan } from './search-runtime-profiler-log-runtime';
import { applyRunOneCommitSpanPressure } from './search-runtime-profiler-pressure-runtime';
import {
  normalizeProfilerContributorId,
  recordProfilerAttribution,
} from './search-runtime-profiler-attribution-runtime';

import type {
  InstrumentationMapQueryBudget,
  RunOneHandoffCoordinatorLike,
} from './use-search-runtime-instrumentation-runtime-contract';

const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION === '1';
const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS = 0.25;
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG === '1';

type UseSearchRuntimeProfilerInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  getActiveShortcutRunNumber: () => number | null;
  getActiveNavSwitchRunNumber: () => number | null;
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
  recordNavSwitchProfilerSpan: (args: {
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
  isNavSwitchPerfHarnessScenario: boolean;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  resolveProfilerStageHint: () => string;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  searchMode: 'natural' | 'shortcut' | null;
  shortcutHarnessRunId: string | null;
};

export const useSearchRuntimeProfilerInstrumentationRuntime = ({
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
}: UseSearchRuntimeProfilerInstrumentationRuntimeArgs): React.ProfilerOnRenderCallback =>
  React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      const activeNavSwitchProbe = getActiveSearchNavSwitchAttributionProbe();
      const shouldRecordProfilerAttribution =
        JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE && searchMode === 'shortcut';
      const shouldEmitProfilerSpanLog =
        JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE && searchMode === 'shortcut';
      const shouldCaptureProfilerSpanForHarness = isShortcutPerfHarnessScenario;
      const shouldCaptureNavSwitchProfilerSpanForHarness = isNavSwitchPerfHarnessScenario;
      const shouldEmitNavSwitchProfilerLog = activeNavSwitchProbe != null;
      if (
        !shouldRecordProfilerAttribution &&
        !shouldEmitProfilerSpanLog &&
        !shouldCaptureProfilerSpanForHarness &&
        !shouldCaptureNavSwitchProfilerSpanForHarness &&
        !shouldEmitNavSwitchProfilerLog
      ) {
        return;
      }

      const activeShortcutRunNumber =
        shouldRecordProfilerAttribution ||
        shouldEmitProfilerSpanLog ||
        shouldCaptureProfilerSpanForHarness
          ? getActiveShortcutRunNumber()
          : null;
      const activeNavSwitchRunNumber = shouldCaptureNavSwitchProfilerSpanForHarness
        ? getActiveNavSwitchRunNumber()
        : null;
      const shouldRecordShortcutHarnessSpan =
        shouldCaptureProfilerSpanForHarness && activeShortcutRunNumber != null;
      const shouldRecordNavSwitchHarnessSpan =
        shouldCaptureNavSwitchProfilerSpanForHarness && activeNavSwitchRunNumber != null;
      const requiresShortcutRunNumber =
        shouldRecordProfilerAttribution ||
        shouldEmitProfilerSpanLog ||
        shouldCaptureProfilerSpanForHarness;
      if (
        requiresShortcutRunNumber &&
        activeShortcutRunNumber == null &&
        !shouldRecordNavSwitchHarnessSpan
      ) {
        return;
      }
      if (
        shouldCaptureNavSwitchProfilerSpanForHarness &&
        activeNavSwitchRunNumber == null &&
        !requiresShortcutRunNumber &&
        !shouldEmitNavSwitchProfilerLog
      ) {
        return;
      }
      const resolvedRunNumber = activeShortcutRunNumber ?? activeNavSwitchRunNumber ?? 0;

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
        if (shouldRecordShortcutHarnessSpan) {
          recordProfilerSpan({
            ...spanPayload,
            runNumber: activeShortcutRunNumber,
          });
        }
        if (shouldRecordNavSwitchHarnessSpan) {
          recordNavSwitchProfilerSpan({
            ...spanPayload,
            runNumber: activeNavSwitchRunNumber,
          });
        }
        recordProfilerAttribution({
          shouldRecordProfilerAttribution,
          mapQueryBudget,
          contributorBase,
          actualDuration,
          commitSpanMs,
          minDurationMs: JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS,
        });
        applyRunOneCommitSpanPressure({
          id,
          commitSpanMs,
          resolvedRunNumber,
          getPerfNow,
          runOneCommitSpanPressureByOperationRef,
          runOneHandoffCoordinatorRef,
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
          shortcutHarnessRunId,
          shouldEmitProfilerSpanLog,
          shouldEmitNavSwitchProfilerLog,
          activeNavSwitchProbe,
        });
      }
    },
    [
      getActiveShortcutRunNumber,
      getActiveNavSwitchRunNumber,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      isNavSwitchPerfHarnessScenario,
      mapQueryBudget,
      recordNavSwitchProfilerSpan,
      recordProfilerSpan,
      resolveProfilerStageHint,
      runOneCommitSpanPressureByOperationRef,
      runOneHandoffCoordinatorRef,
      searchMode,
      shortcutHarnessRunId,
    ]
  );
