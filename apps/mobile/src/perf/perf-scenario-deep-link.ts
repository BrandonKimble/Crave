import type {
  PerfJsFrameSamplerConfig,
  PerfJsTaskLatencySamplerConfig,
  PerfUiFrameSamplerConfig,
} from './perf-sampler-types';
import type { RuntimePerfScenarioConfig } from './perf-scenario-runtime-store';

type PerfScenarioDeepLinkEvent =
  | { type: 'start'; config: RuntimePerfScenarioConfig }
  | { type: 'clear'; scenarioRunId: string | null }
  | { type: 'mark'; phase: string; label: string | null; scenarioRunId: string | null }
  | {
      type: 'command';
      action: string;
      delayMs: number;
      lat: number | null;
      lng: number | null;
      resubmitDelayMs: number;
      scenarioRunId: string | null;
      label: string | null;
      zoom: number | null;
    };

const parseBoolean = (value: string | null, fallback: boolean): boolean => {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return fallback;
};

const parseInteger = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value == null || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const parseNumber = (value: string | null, min: number, max: number): number | null => {
  if (value == null || value.trim().length === 0) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
};

const normalizeScenarioName = (value: string | null): string => {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_') ?? '';
  return normalized.length > 0 ? normalized : 'external_flow';
};

const buildFrameSamplerConfig = (
  searchParams: URLSearchParams,
  prefix: 'js' | 'ui'
): PerfJsFrameSamplerConfig | PerfUiFrameSamplerConfig => ({
  enabled: parseBoolean(searchParams.get(`${prefix}Sampler`), true),
  windowMs: parseInteger(searchParams.get(`${prefix}WindowMs`), 500, 120, 60000),
  stallFrameMs: parseInteger(searchParams.get(`${prefix}StallFrameMs`), 50, 16, 5000),
  logOnlyBelowFps: parseInteger(searchParams.get(`${prefix}FpsThreshold`), 58, 1, 240),
});

const buildTaskLatencySamplerConfig = (
  searchParams: URLSearchParams
): PerfJsTaskLatencySamplerConfig => ({
  enabled: parseBoolean(searchParams.get('taskSampler'), true),
  windowMs: parseInteger(searchParams.get('taskWindowMs'), 500, 120, 60000),
  sampleIntervalMs: parseInteger(searchParams.get('taskSampleIntervalMs'), 8, 1, 1000),
  stallLagMs: parseInteger(searchParams.get('taskStallLagMs'), 50, 1, 5000),
  logOnlyAboveLagMs: parseInteger(searchParams.get('taskLogOnlyAboveLagMs'), 12, 0, 5000),
});

const firstPathSegment = (url: URL): string | null =>
  url.pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)[0] ?? null;

const isPerfScenarioStartTarget = (url: URL): boolean => {
  const host = url.host.trim().toLowerCase();
  const pathSegment = firstPathSegment(url);
  return host === 'perf-scenario' || pathSegment === 'perf-scenario';
};

const isPerfScenarioClearTarget = (url: URL): boolean => {
  const host = url.host.trim().toLowerCase();
  const pathSegment = firstPathSegment(url);
  return host === 'perf-scenario-clear' || pathSegment === 'perf-scenario-clear';
};

const isPerfScenarioMarkTarget = (url: URL): boolean => {
  const host = url.host.trim().toLowerCase();
  const pathSegment = firstPathSegment(url);
  return host === 'perf-scenario-mark' || pathSegment === 'perf-scenario-mark';
};

const isPerfScenarioCommandTarget = (url: URL): boolean => {
  const host = url.host.trim().toLowerCase();
  const pathSegment = firstPathSegment(url);
  return host === 'perf-scenario-command' || pathSegment === 'perf-scenario-command';
};

export const isPerfScenarioUrl = (rawUrl: string | null): boolean => {
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    return (
      isPerfScenarioStartTarget(parsed) ||
      isPerfScenarioClearTarget(parsed) ||
      isPerfScenarioMarkTarget(parsed) ||
      isPerfScenarioCommandTarget(parsed)
    );
  } catch {
    return false;
  }
};

export const parsePerfScenarioDeepLinkEvent = (
  rawUrl: string | null
): PerfScenarioDeepLinkEvent | null => {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (isPerfScenarioClearTarget(parsed)) {
      return {
        type: 'clear',
        scenarioRunId: parsed.searchParams.get('scenarioRunId')?.trim() || null,
      };
    }
    if (isPerfScenarioMarkTarget(parsed)) {
      return {
        type: 'mark',
        phase: normalizeScenarioName(parsed.searchParams.get('phase')),
        label: parsed.searchParams.get('label')?.trim() || null,
        scenarioRunId: parsed.searchParams.get('scenarioRunId')?.trim() || null,
      };
    }
    if (isPerfScenarioCommandTarget(parsed)) {
      return {
        type: 'command',
        action: normalizeScenarioName(parsed.searchParams.get('action')),
        delayMs: parseInteger(parsed.searchParams.get('delayMs'), 100, 0, 5000),
        lat: parseNumber(parsed.searchParams.get('lat'), -90, 90),
        lng: parseNumber(parsed.searchParams.get('lng'), -180, 180),
        resubmitDelayMs: parseInteger(parsed.searchParams.get('resubmitDelayMs'), 140, 0, 5000),
        scenarioRunId: parsed.searchParams.get('scenarioRunId')?.trim() || null,
        label: parsed.searchParams.get('label')?.trim() || null,
        zoom: parseNumber(parsed.searchParams.get('zoom'), 0, 24),
      };
    }
    if (!isPerfScenarioStartTarget(parsed)) {
      return null;
    }

    const scenario = normalizeScenarioName(parsed.searchParams.get('scenario'));
    const runId = parsed.searchParams.get('scenarioRunId')?.trim() || `${scenario}-${Date.now()}`;
    const requestId = parsed.searchParams.get('requestId')?.trim() || `${runId}:${Date.now()}`;
    const durationMs = parseInteger(parsed.searchParams.get('durationMs'), 60000, 1000, 600000);

    return {
      type: 'start',
      config: {
        requestId,
        scenario,
        runId,
        durationMs,
        jsFrameSampler: buildFrameSamplerConfig(parsed.searchParams, 'js'),
        jsTaskLatencySampler: buildTaskLatencySamplerConfig(parsed.searchParams),
        uiFrameSampler: buildFrameSamplerConfig(parsed.searchParams, 'ui'),
        signature:
          parsed.searchParams.get('signature')?.trim() ||
          [`scenario:${scenario}`, `scenarioRunId:${runId}`, `durationMs:${durationMs}`].join('|'),
      },
    };
  } catch {
    return null;
  }
};
