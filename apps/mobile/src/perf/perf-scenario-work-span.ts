// F873: ONE clock for the whole perf directory (was six identical re-declarations).
import { perfNow } from './perf-clock';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from './perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from './perf-scenario-runtime-store';

export const getPerfScenarioWorkNow = (): number => perfNow();

export const logPerfScenarioWorkSpan = ({
  owner,
  path,
  startedAtMs,
  details,
}: {
  owner: string;
  path: string;
  startedAtMs: number;
  details?: Record<string, unknown>;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner,
    path,
    durationMs: Number(Math.max(0, getPerfScenarioWorkNow() - startedAtMs).toFixed(3)),
    ...(details ?? null),
  });
};

export const measurePerfScenarioWorkSpan = <T>(
  owner: string,
  path: string,
  callback: () => T,
  details?: Record<string, unknown>
): T => {
  const startedAtMs = getPerfScenarioWorkNow();
  try {
    return callback();
  } finally {
    logPerfScenarioWorkSpan({
      owner,
      path,
      startedAtMs,
      details,
    });
  }
};
