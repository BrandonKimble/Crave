import React from 'react';

import { logger } from '../../../../utils';

const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE = false;
const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MIN_MS = 120;
const SHOULD_LOG_JS_STALLS = false;
const JS_STALL_MIN_MS = Number.POSITIVE_INFINITY;

type UseSearchRuntimeStallInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  getActiveShortcutRunNumber: () => number | null;
  resolveProfilerStageHint: () => string;
  searchInteractionRef: React.MutableRefObject<{
    isResultsSheetDragging: boolean;
    isResultsListScrolling: boolean;
    isResultsSheetSettling: boolean;
  }>;
  readRuntimeMemoryDiagnostics: () => unknown;
  shortcutHarnessRunId: string | null;
};

export const useSearchRuntimeStallInstrumentationRuntime = ({
  getPerfNow,
  getActiveShortcutRunNumber,
  resolveProfilerStageHint,
  searchInteractionRef,
  readRuntimeMemoryDiagnostics,
  shortcutHarnessRunId,
}: UseSearchRuntimeStallInstrumentationRuntimeArgs): void => {
  React.useEffect(() => {
    const shouldRunJsStallTicker = SHOULD_LOG_JS_STALLS || JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE;
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
          const activeRunNumber = getActiveShortcutRunNumber();
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
              harnessRunId: shortcutHarnessRunId,
            });
          }
        }
        lastLog = now;
        maxDrift = 0;
        stallCount = 0;
      }
      lastTick = now;
    }, intervalMs);
    return () => clearInterval(handle);
  }, [
    getActiveShortcutRunNumber,
    getPerfNow,
    readRuntimeMemoryDiagnostics,
    resolveProfilerStageHint,
    searchInteractionRef,
    shortcutHarnessRunId,
  ]);
};
