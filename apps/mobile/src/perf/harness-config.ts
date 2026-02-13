type PerfHarnessScenario = 'none' | 'search_shortcut_loop';
type PerfShortcutTab = 'dishes' | 'restaurants';
type PerfShortcutScoreMode = 'global_quality' | 'coverage_display';

type PerfShortcutLoopConfig = {
  label: string;
  targetTab: PerfShortcutTab;
  scoreMode: PerfShortcutScoreMode;
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
};

type PerfJsFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};

type PerfUiFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};

type PerfHarnessConfig = {
  enabled: boolean;
  scenario: PerfHarnessScenario;
  runId: string | null;
  runs: number;
  startDelayMs: number;
  cooldownMs: number;
  shortcutLoop: PerfShortcutLoopConfig;
  jsFrameSampler: PerfJsFrameSamplerConfig;
  uiFrameSampler: PerfUiFrameSamplerConfig;
  signature: string;
};

const readEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return typeof value === 'string' ? value : undefined;
};

const normalizeEnv = (value: string | undefined): string | undefined => value?.trim().toLowerCase();

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
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

const parseInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number => {
  if (value == null || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const parseScenario = (value: string | undefined): PerfHarnessScenario => {
  if (!value) {
    return 'none';
  }
  return value === 'search_shortcut_loop' ? 'search_shortcut_loop' : 'none';
};

const parseShortcutTab = (value: string | undefined): PerfShortcutTab => {
  if (!value) {
    return 'restaurants';
  }
  return value === 'dishes' ? 'dishes' : 'restaurants';
};

const parseShortcutScoreMode = (value: string | undefined): PerfShortcutScoreMode => {
  if (!value) {
    return 'coverage_display';
  }
  return value === 'global_quality' ? 'global_quality' : 'coverage_display';
};

const isDevEnvironment = __DEV__;
const allowHarnessOutsideDev = parseBoolean(readEnv('EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV'));
const canEnableHarness = isDevEnvironment || allowHarnessOutsideDev;
const isHarnessEnabled =
  canEnableHarness && parseBoolean(readEnv('EXPO_PUBLIC_PERF_HARNESS_ENABLED'));
const scenario = isHarnessEnabled
  ? parseScenario(normalizeEnv(readEnv('EXPO_PUBLIC_PERF_HARNESS_SCENARIO')))
  : 'none';
const runIdRaw = readEnv('EXPO_PUBLIC_PERF_HARNESS_RUN_ID')?.trim() ?? '';
const runId = runIdRaw.length > 0 ? runIdRaw : null;
const runs = parseInteger(readEnv('EXPO_PUBLIC_PERF_HARNESS_RUNS'), 3, 1, 1000);
const startDelayMs = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS'),
  3000,
  0,
  60000
);
const cooldownMs = parseInteger(readEnv('EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS'), 1600, 0, 60000);
const jsFrameSamplerEnabled =
  canEnableHarness && parseBoolean(readEnv('EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER'), isHarnessEnabled);
const jsFrameWindowMs = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS'),
  500,
  120,
  60000
);
const jsFrameStallFrameMs = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS'),
  80,
  16,
  5000
);
const jsFrameLogOnlyBelowFps = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS'),
  58,
  1,
  240
);
const uiFrameSamplerEnabled =
  canEnableHarness && parseBoolean(readEnv('EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER'), isHarnessEnabled);
const uiFrameWindowMs = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS'),
  500,
  120,
  60000
);
const uiFrameStallFrameMs = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS'),
  80,
  16,
  5000
);
const uiFrameLogOnlyBelowFps = parseInteger(
  readEnv('EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS'),
  58,
  1,
  240
);

const perfHarnessConfig: PerfHarnessConfig = {
  enabled: isHarnessEnabled,
  scenario,
  runId,
  runs,
  startDelayMs,
  cooldownMs,
  shortcutLoop: {
    label: readEnv('EXPO_PUBLIC_PERF_SHORTCUT_LABEL')?.trim() || 'Best restaurants',
    targetTab: parseShortcutTab(normalizeEnv(readEnv('EXPO_PUBLIC_PERF_SHORTCUT_TAB'))),
    scoreMode: parseShortcutScoreMode(
      normalizeEnv(readEnv('EXPO_PUBLIC_PERF_SHORTCUT_SCORE_MODE'))
    ),
    preserveSheetState: parseBoolean(readEnv('EXPO_PUBLIC_PERF_SHORTCUT_PRESERVE_SHEET_STATE')),
    transitionFromDockedPolls: parseBoolean(
      readEnv('EXPO_PUBLIC_PERF_SHORTCUT_TRANSITION_FROM_DOCKED_POLLS'),
      true
    ),
  },
  jsFrameSampler: {
    enabled: jsFrameSamplerEnabled,
    windowMs: jsFrameWindowMs,
    stallFrameMs: jsFrameStallFrameMs,
    logOnlyBelowFps: jsFrameLogOnlyBelowFps,
  },
  uiFrameSampler: {
    enabled: uiFrameSamplerEnabled,
    windowMs: uiFrameWindowMs,
    stallFrameMs: uiFrameStallFrameMs,
    logOnlyBelowFps: uiFrameLogOnlyBelowFps,
  },
  signature: '',
};

perfHarnessConfig.signature = [
  `enabled:${perfHarnessConfig.enabled ? 1 : 0}`,
  `scenario:${perfHarnessConfig.scenario}`,
  `runId:${perfHarnessConfig.runId ?? 'none'}`,
  `runs:${perfHarnessConfig.runs}`,
  `start:${perfHarnessConfig.startDelayMs}`,
  `cooldown:${perfHarnessConfig.cooldownMs}`,
  `label:${perfHarnessConfig.shortcutLoop.label}`,
  `tab:${perfHarnessConfig.shortcutLoop.targetTab}`,
  `score:${perfHarnessConfig.shortcutLoop.scoreMode}`,
  `preserve:${perfHarnessConfig.shortcutLoop.preserveSheetState ? 1 : 0}`,
  `dock:${perfHarnessConfig.shortcutLoop.transitionFromDockedPolls ? 1 : 0}`,
  `sampler:${perfHarnessConfig.jsFrameSampler.enabled ? 1 : 0}`,
  `window:${perfHarnessConfig.jsFrameSampler.windowMs}`,
  `stall:${perfHarnessConfig.jsFrameSampler.stallFrameMs}`,
  `fps:${perfHarnessConfig.jsFrameSampler.logOnlyBelowFps}`,
  `uiSampler:${perfHarnessConfig.uiFrameSampler.enabled ? 1 : 0}`,
  `uiWindow:${perfHarnessConfig.uiFrameSampler.windowMs}`,
  `uiStall:${perfHarnessConfig.uiFrameSampler.stallFrameMs}`,
  `uiFps:${perfHarnessConfig.uiFrameSampler.logOnlyBelowFps}`,
].join('|');

export type {
  PerfHarnessConfig,
  PerfHarnessScenario,
  PerfJsFrameSamplerConfig,
  PerfUiFrameSamplerConfig,
  PerfShortcutLoopConfig,
  PerfShortcutScoreMode,
  PerfShortcutTab,
};
export default perfHarnessConfig;
