type PerfHarnessScenario =
  | 'none'
  | 'search_shortcut_loop'
  | 'search_shortcut_loop_open_now_roundtrip'
  | 'search_nav_switch_loop';
type PerfShortcutTab = 'dishes' | 'restaurants';
type PerfNavSwitchOverlay = 'search' | 'bookmarks' | 'profile';
type PerfShortcutSettleBoundaryPolicy =
  | 'quiet_snapshot_only'
  | 'shadow_converged_or_quiet_snapshot';

type PerfShortcutLoopConfig = {
  label: string;
  targetTab: PerfShortcutTab;
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
  settleBoundaryPolicy: PerfShortcutSettleBoundaryPolicy;
};

type PerfNavSwitchLoopConfig = {
  sequence: PerfNavSwitchOverlay[];
  stepCooldownMs: number;
  settleQuietPeriodMs: number;
  stepTimeoutMs: number;
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
  navSwitchLoop: PerfNavSwitchLoopConfig;
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
  if (value === 'search_shortcut_loop') {
    return 'search_shortcut_loop';
  }
  if (value === 'search_shortcut_loop_open_now_roundtrip') {
    return 'search_shortcut_loop_open_now_roundtrip';
  }
  if (value === 'search_nav_switch_loop') {
    return 'search_nav_switch_loop';
  }
  return 'none';
};

const parseShortcutTab = (value: string | undefined): PerfShortcutTab => {
  if (!value) {
    return 'restaurants';
  }
  return value === 'dishes' ? 'dishes' : 'restaurants';
};

const parseSettleBoundaryPolicy = (value: string | undefined): PerfShortcutSettleBoundaryPolicy => {
  if (!value) {
    return 'shadow_converged_or_quiet_snapshot';
  }
  return value === 'quiet_snapshot_only'
    ? 'quiet_snapshot_only'
    : 'shadow_converged_or_quiet_snapshot';
};

const parseNavSwitchOverlay = (value: string | undefined): PerfNavSwitchOverlay | null => {
  if (!value) {
    return null;
  }
  if (value === 'search' || value === 'bookmarks' || value === 'profile') {
    return value;
  }
  return null;
};

const DEFAULT_NAV_SWITCH_SEQUENCE: PerfNavSwitchOverlay[] = [
  'bookmarks',
  'profile',
  'bookmarks',
  'search',
];

const parseNavSwitchSequence = (value: string | undefined): PerfNavSwitchOverlay[] => {
  if (!value) {
    return DEFAULT_NAV_SWITCH_SEQUENCE;
  }
  const parsed = value
    .split(',')
    .map((entry) => parseNavSwitchOverlay(entry.trim().toLowerCase()))
    .filter((entry): entry is PerfNavSwitchOverlay => entry != null);
  return parsed.length > 0 ? parsed : DEFAULT_NAV_SWITCH_SEQUENCE;
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
const defaultRuns = scenario === 'search_shortcut_loop_open_now_roundtrip' ? 1 : 3;
const runs = parseInteger(readEnv('EXPO_PUBLIC_PERF_HARNESS_RUNS'), defaultRuns, 1, 1000);
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
  50,
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
  50,
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
    preserveSheetState: parseBoolean(readEnv('EXPO_PUBLIC_PERF_SHORTCUT_PRESERVE_SHEET_STATE')),
    transitionFromDockedPolls: parseBoolean(
      readEnv('EXPO_PUBLIC_PERF_SHORTCUT_TRANSITION_FROM_DOCKED_POLLS'),
      true
    ),
    settleBoundaryPolicy: parseSettleBoundaryPolicy(
      normalizeEnv(readEnv('EXPO_PUBLIC_PERF_SHORTCUT_SETTLE_BOUNDARY_POLICY'))
    ),
  },
  navSwitchLoop: {
    sequence: parseNavSwitchSequence(readEnv('EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE')),
    stepCooldownMs: parseInteger(
      readEnv('EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_COOLDOWN_MS'),
      250,
      0,
      10000
    ),
    settleQuietPeriodMs: parseInteger(
      readEnv('EXPO_PUBLIC_PERF_NAV_SWITCH_SETTLE_QUIET_PERIOD_MS'),
      250,
      50,
      10000
    ),
    stepTimeoutMs: parseInteger(
      readEnv('EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_TIMEOUT_MS'),
      2500,
      100,
      30000
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
  `preserve:${perfHarnessConfig.shortcutLoop.preserveSheetState ? 1 : 0}`,
  `dock:${perfHarnessConfig.shortcutLoop.transitionFromDockedPolls ? 1 : 0}`,
  `settleBoundary:${perfHarnessConfig.shortcutLoop.settleBoundaryPolicy}`,
  `navSequence:${perfHarnessConfig.navSwitchLoop.sequence.join('>')}`,
  `navStepCooldown:${perfHarnessConfig.navSwitchLoop.stepCooldownMs}`,
  `navSettleQuiet:${perfHarnessConfig.navSwitchLoop.settleQuietPeriodMs}`,
  `navStepTimeout:${perfHarnessConfig.navSwitchLoop.stepTimeoutMs}`,
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
  PerfNavSwitchLoopConfig,
  PerfNavSwitchOverlay,
  PerfJsFrameSamplerConfig,
  PerfUiFrameSamplerConfig,
  PerfShortcutLoopConfig,
  PerfShortcutSettleBoundaryPolicy,
  PerfShortcutTab,
};
export default perfHarnessConfig;
