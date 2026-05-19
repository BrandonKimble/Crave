import {
  isPerfScenarioAttributionActive,
  isPerfScenarioQuietMeasuredLoopActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';

type SearchResultsListAdmissionCounters = {
  listTargetRenderCount: number;
  preparedCardRenderCount: number;
  renderItemCount: number;
  restaurantCardRenderCount: number;
};

const countersByKey = new Map<string, SearchResultsListAdmissionCounters>();
let flushHandle: ReturnType<typeof setTimeout> | null = null;

const EMPTY_COUNTERS = (): SearchResultsListAdmissionCounters => ({
  listTargetRenderCount: 0,
  preparedCardRenderCount: 0,
  renderItemCount: 0,
  restaurantCardRenderCount: 0,
});

const hashAdmissionKey = (key: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const readAdmissionKeyPart = (key: string, label: string): string | null => {
  const marker = `|${label}:`;
  const start = key.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const valueStart = start + marker.length;
  const valueEnd = key.indexOf('|', valueStart);
  return key.slice(valueStart, valueEnd < 0 ? undefined : valueEnd);
};

const normalizeAdmissionKey = (key: string | null | undefined): string => {
  if (!key) {
    return 'unknown';
  }
  const pageMatch = key.match(/:page:([^|]+)/);
  const tab = readAdmissionKeyPart(key, 'tab') ?? 'unknown';
  return [
    'admission',
    hashAdmissionKey(key),
    `len:${key.length}`,
    `page:${pageMatch?.[1] ?? 'unknown'}`,
    `tab:${tab}`,
  ].join('|');
};

const flushSearchResultsListAdmissionAttribution = (): void => {
  flushHandle = null;
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig) || countersByKey.size === 0) {
    countersByKey.clear();
    return;
  }
  countersByKey.forEach((counters, key) => {
    logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
      event: 'scenario_work_span',
      owner: 'search_results_list_admission_counters',
      path: key,
      durationMs: 0,
      ...counters,
    });
  });
  countersByKey.clear();
};

const scheduleSearchResultsListAdmissionFlush = (): void => {
  if (flushHandle != null) {
    return;
  }
  flushHandle = setTimeout(flushSearchResultsListAdmissionAttribution, 0);
};

export const markSearchResultsListAdmissionCounter = (
  key: string | null | undefined,
  field: keyof SearchResultsListAdmissionCounters,
  count = 1
): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (
    !isPerfScenarioAttributionActive(scenarioConfig) ||
    isPerfScenarioQuietMeasuredLoopActive(scenarioConfig)
  ) {
    return;
  }
  const normalizedKey = normalizeAdmissionKey(key);
  const counters = countersByKey.get(normalizedKey) ?? EMPTY_COUNTERS();
  counters[field] += count;
  countersByKey.set(normalizedKey, counters);
  scheduleSearchResultsListAdmissionFlush();
};
