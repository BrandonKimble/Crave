export type PerfHarnessScenario =
  | 'none'
  | 'search_shortcut_loop'
  | 'search_shortcut_loop_open_now_roundtrip'
  | 'search_nav_switch_loop';

export type PerfNavSwitchOverlay = 'search' | 'bookmarks' | 'profile';

export type PerfNavSwitchLoopConfig = {
  sequence: PerfNavSwitchOverlay[];
  stepCooldownMs: number;
  settleQuietPeriodMs: number;
  stepTimeoutMs: number;
};

export type PerfJsFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};

export type PerfUiFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};
