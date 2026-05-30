type SearchNavSwitchPerfProbe = {
  seq: number;
  from: string;
  to: string;
  startedAtMs: number;
  untilMs: number;
};

const SEARCH_NAV_SWITCH_ATTRIBUTION_ENABLED =
  process.env.EXPO_PUBLIC_PERF_NAV_SWITCH_ATTRIBUTION === '1';
const SEARCH_NAV_SWITCH_PROFILER_SPAN_LOGS_ENABLED =
  process.env.EXPO_PUBLIC_PERF_NAV_SWITCH_PROFILER_SPAN_LOGS === '1';
const SEARCH_NAV_SWITCH_RUNTIME_ATTRIBUTION_ENABLED =
  process.env.EXPO_PUBLIC_PERF_NAV_SWITCH_RUNTIME_ATTRIBUTION === '1';

let nextSearchNavSwitchPerfProbeSeq = 0;
let activeSearchNavSwitchPerfProbe: SearchNavSwitchPerfProbe | null = null;

export const getSearchNavSwitchNowMs = (): number => {
  const perfNow = globalThis.performance?.now?.();
  return typeof perfNow === 'number' && Number.isFinite(perfNow) ? perfNow : Date.now();
};

export const beginSearchNavSwitchPerfProbe = ({
  from,
  to,
  windowMs = 1200,
}: {
  from: string;
  to: string;
  windowMs?: number;
}): SearchNavSwitchPerfProbe => {
  nextSearchNavSwitchPerfProbeSeq += 1;
  activeSearchNavSwitchPerfProbe = {
    seq: nextSearchNavSwitchPerfProbeSeq,
    from,
    to,
    startedAtMs: getSearchNavSwitchNowMs(),
    untilMs: getSearchNavSwitchNowMs() + windowMs,
  };
  return activeSearchNavSwitchPerfProbe;
};

export const getActiveSearchNavSwitchPerfProbe = (): SearchNavSwitchPerfProbe | null => {
  if (!activeSearchNavSwitchPerfProbe) {
    return null;
  }
  if (getSearchNavSwitchNowMs() > activeSearchNavSwitchPerfProbe.untilMs) {
    activeSearchNavSwitchPerfProbe = null;
    return null;
  }
  return activeSearchNavSwitchPerfProbe;
};

export const shouldLogSearchNavSwitchAttribution = (): boolean =>
  SEARCH_NAV_SWITCH_ATTRIBUTION_ENABLED;

export const shouldLogSearchNavSwitchProfilerSpanLogs = (): boolean =>
  SEARCH_NAV_SWITCH_PROFILER_SPAN_LOGS_ENABLED;

export const shouldRecordSearchNavSwitchRuntimeAttribution = (): boolean =>
  SEARCH_NAV_SWITCH_RUNTIME_ATTRIBUTION_ENABLED;

export const getActiveSearchNavSwitchAttributionProbe = (): SearchNavSwitchPerfProbe | null =>
  shouldLogSearchNavSwitchAttribution() ? getActiveSearchNavSwitchPerfProbe() : null;

export const getActiveSearchNavSwitchProbeAgeMs = (): number | null => {
  const probe = getActiveSearchNavSwitchPerfProbe();
  if (!probe) {
    return null;
  }
  return Number((getSearchNavSwitchNowMs() - probe.startedAtMs).toFixed(1));
};
