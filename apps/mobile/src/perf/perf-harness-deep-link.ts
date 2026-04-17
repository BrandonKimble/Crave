import type {
  PerfHarnessScenario,
  PerfJsFrameSamplerConfig,
  PerfNavSwitchLoopConfig,
  PerfNavSwitchOverlay,
  PerfUiFrameSamplerConfig,
} from './perf-harness-runtime-types';
import type { RuntimePerfHarnessConfig } from './perf-harness-runtime-store';

const DEFAULT_NAV_SEQUENCE: PerfNavSwitchOverlay[] = [
  'bookmarks',
  'profile',
  'bookmarks',
  'search',
];

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

const parseScenario = (value: string | null): PerfHarnessScenario => {
  if (value === 'search_nav_switch_loop') {
    return value;
  }
  if (value === 'search_shortcut_loop' || value === 'search_shortcut_loop_open_now_roundtrip') {
    return value;
  }
  return 'none';
};

const parseNavSwitchOverlay = (value: string | null): PerfNavSwitchOverlay | null => {
  if (value === 'search' || value === 'bookmarks' || value === 'profile') {
    return value;
  }
  return null;
};

const parseNavSwitchSequence = (value: string | null): PerfNavSwitchOverlay[] => {
  if (!value) {
    return DEFAULT_NAV_SEQUENCE;
  }
  const parsed = value
    .split(',')
    .map((segment) => parseNavSwitchOverlay(segment.trim().toLowerCase()))
    .filter((segment): segment is PerfNavSwitchOverlay => segment != null);
  return parsed.length > 0 ? parsed : DEFAULT_NAV_SEQUENCE;
};

const isPerfHarnessTarget = (url: URL): boolean => {
  const host = url.host.trim().toLowerCase();
  const firstPathSegment = url.pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)[0];
  return host === 'perf-harness' || firstPathSegment === 'perf-harness';
};

export const isPerfHarnessUrl = (rawUrl: string | null): boolean => {
  if (!rawUrl) {
    return false;
  }
  try {
    return isPerfHarnessTarget(new URL(rawUrl));
  } catch {
    return false;
  }
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

export const parsePerfHarnessConfigFromUrl = (
  rawUrl: string | null
): RuntimePerfHarnessConfig | null => {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!isPerfHarnessTarget(parsed)) {
      return null;
    }

    const scenario = parseScenario(parsed.searchParams.get('scenario'));
    if (scenario !== 'search_nav_switch_loop') {
      return null;
    }

    const runId = parsed.searchParams.get('runId')?.trim() || `nav-switch-runtime-${Date.now()}`;
    const requestId = parsed.searchParams.get('requestId')?.trim() || `${runId}:${Date.now()}`;
    const navSwitchLoop: PerfNavSwitchLoopConfig = {
      sequence: parseNavSwitchSequence(parsed.searchParams.get('navSequence')),
      stepCooldownMs: parseInteger(parsed.searchParams.get('navStepCooldownMs'), 250, 0, 10000),
      settleQuietPeriodMs: parseInteger(
        parsed.searchParams.get('navSettleQuietPeriodMs'),
        250,
        0,
        10000
      ),
      stepTimeoutMs: parseInteger(parsed.searchParams.get('navStepTimeoutMs'), 2500, 250, 30000),
    };

    return {
      requestId,
      scenario,
      runId,
      runs: parseInteger(parsed.searchParams.get('runs'), 3, 1, 1000),
      startDelayMs: parseInteger(parsed.searchParams.get('startDelayMs'), 3000, 0, 60000),
      cooldownMs: parseInteger(parsed.searchParams.get('cooldownMs'), 1200, 0, 60000),
      navSwitchLoop,
      jsFrameSampler: buildFrameSamplerConfig(parsed.searchParams, 'js'),
      uiFrameSampler: buildFrameSamplerConfig(parsed.searchParams, 'ui'),
      signature:
        parsed.searchParams.get('signature')?.trim() ||
        [
          `scenario:${scenario}`,
          `runId:${runId}`,
          `runs:${parseInteger(parsed.searchParams.get('runs'), 3, 1, 1000)}`,
          `sequence:${navSwitchLoop.sequence.join('>')}`,
        ].join('|'),
    };
  } catch {
    return null;
  }
};
