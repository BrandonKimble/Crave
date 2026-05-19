import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { logger } from '../../../../utils';

const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE = false;
const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MIN_MS = 120;
const SHOULD_LOG_JS_STALLS = false;
const JS_STALL_MIN_MS = Number.POSITIVE_INFINITY;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const summarizeRecentRuntimeMemory = (recent: unknown): Record<string, unknown> | undefined => {
  if (!Array.isArray(recent)) {
    return undefined;
  }
  const entries = recent.filter(isRecord);
  const latest = entries[entries.length - 1];
  if (latest == null) {
    return {
      count: 0,
    };
  }
  return {
    count: entries.length,
    latestKind: latest.kind,
    latestDurationMs: latest.durationMs,
    latestChangedKeyCount: Array.isArray(latest.changedKeys) ? latest.changedKeys.length : 0,
    latestListenerCount: latest.listenerCount,
    latestNotifiedListenerCount: latest.notifiedListenerCount,
    latestBatchDepth: latest.batchDepth,
    latestVersion: latest.version,
  };
};

const slimRuntimeMemoryDiagnostics = (runtimeMemory: unknown): unknown => {
  if (!isRecord(runtimeMemory)) {
    return runtimeMemory;
  }
  const searchRuntimeBus = runtimeMemory.searchRuntimeBus;
  if (!isRecord(searchRuntimeBus)) {
    return null;
  }
  const resultsPresentationSurfaceAuthority = runtimeMemory.resultsPresentationSurfaceAuthority;
  return {
    searchRuntimeBus: {
      version: searchRuntimeBus.version,
      listenerCount: searchRuntimeBus.listenerCount,
      batchDepth: searchRuntimeBus.batchDepth,
      pendingChangedKeyCount: Array.isArray(searchRuntimeBus.pendingChangedKeys)
        ? searchRuntimeBus.pendingChangedKeys.length
        : undefined,
      recent: summarizeRecentRuntimeMemory(searchRuntimeBus.recent),
    },
    resultsPresentationSurfaceAuthority: isRecord(resultsPresentationSurfaceAuthority)
      ? {
          version: resultsPresentationSurfaceAuthority.version,
          listenerCount: resultsPresentationSurfaceAuthority.listenerCount,
          recent: summarizeRecentRuntimeMemory(resultsPresentationSurfaceAuthority.recent),
        }
      : undefined,
  };
};

type UseSearchRuntimeStallInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  getActiveScenarioRunNumber: () => number | null;
  resolveProfilerStageHint: () => string;
  searchInteractionRef: React.MutableRefObject<{
    isResultsSheetDragging: boolean;
    isResultsListScrolling: boolean;
    isResultsSheetSettling: boolean;
  }>;
  readRuntimeMemoryDiagnostics: () => unknown;
  scenarioRunId: string | null;
};

export const useSearchRuntimeStallInstrumentationRuntime = ({
  getPerfNow,
  getActiveScenarioRunNumber,
  resolveProfilerStageHint,
  searchInteractionRef,
  readRuntimeMemoryDiagnostics,
  scenarioRunId,
}: UseSearchRuntimeStallInstrumentationRuntimeArgs): void => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);

  React.useEffect(() => {
    const shouldEmitScenarioStallProbe = isPerfScenarioAttributionActive(activeScenarioConfig);
    const shouldRunJsStallTicker =
      SHOULD_LOG_JS_STALLS || JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE || shouldEmitScenarioStallProbe;
    if (!shouldRunJsStallTicker) {
      return;
    }
    const intervalMs = 100;
    const logIntervalMs = 500;
    let lastTick = getPerfNow();
    let lastLog = lastTick;
    let maxDrift = 0;
    let stallCount = 0;
    const activeStallMinMs = SHOULD_LOG_JS_STALLS
      ? JS_STALL_MIN_MS
      : shouldEmitScenarioStallProbe
        ? 50
        : JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MIN_MS;
    const handle = setInterval(() => {
      const now = getPerfNow();
      const drift = now - lastTick - intervalMs;
      if (drift > activeStallMinMs) {
        maxDrift = Math.max(maxDrift, drift);
        stallCount += 1;
      }
      if (stallCount > 0 && now - lastLog >= logIntervalMs) {
        const interactionState = searchInteractionRef.current;
        const runtimeMemory = readRuntimeMemoryDiagnostics();
        if (SHOULD_LOG_JS_STALLS) {
          logger.debug(
            `[SearchPerf] JS stall max=${maxDrift.toFixed(1)}ms count=${stallCount} drag=${
              interactionState.isResultsSheetDragging
            } scroll=${interactionState.isResultsListScrolling} settle=${
              interactionState.isResultsSheetSettling
            }`,
            runtimeMemory ? { runtimeMemory } : undefined
          );
        }
        if (JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE) {
          const activeRunNumber = getActiveScenarioRunNumber();
          const stageHint = resolveProfilerStageHint();
          if (activeRunNumber != null) {
            logger.debug('[SearchPerf][StallProbe]', {
              event: 'js_stall_probe',
              nowMs: Number(now.toFixed(1)),
              maxDriftMs: Number(maxDrift.toFixed(1)),
              stallCount,
              stageHint,
              isResultsSheetDragging: interactionState.isResultsSheetDragging,
              isResultsListScrolling: interactionState.isResultsListScrolling,
              isResultsSheetSettling: interactionState.isResultsSheetSettling,
              runtimeMemory,
              runNumber: activeRunNumber,
              scenarioRunId,
            });
          }
        }
        if (shouldEmitScenarioStallProbe) {
          const stageHint = resolveProfilerStageHint();
          const slimRuntimeMemory = slimRuntimeMemoryDiagnostics(runtimeMemory);
          logPerfScenarioAttributionEvent('StallProbe', activeScenarioConfig, {
            event: 'scenario_js_stall_probe',
            nowMs: Number(now.toFixed(1)),
            maxDriftMs: Number(maxDrift.toFixed(1)),
            stallCount,
            stageHint,
            isResultsSheetDragging: interactionState.isResultsSheetDragging,
            isResultsListScrolling: interactionState.isResultsListScrolling,
            isResultsSheetSettling: interactionState.isResultsSheetSettling,
            runtimeMemory: slimRuntimeMemory,
          });
        }
        lastLog = now;
        maxDrift = 0;
        stallCount = 0;
      }
      lastTick = now;
    }, intervalMs);
    return () => clearInterval(handle);
  }, [
    activeScenarioConfig,
    getActiveScenarioRunNumber,
    getPerfNow,
    readRuntimeMemoryDiagnostics,
    resolveProfilerStageHint,
    searchInteractionRef,
    scenarioRunId,
  ]);
};
