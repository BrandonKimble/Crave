export type PerfJsFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};

export type PerfJsTaskLatencySamplerConfig = {
  enabled: boolean;
  windowMs: number;
  sampleIntervalMs: number;
  stallLagMs: number;
  logOnlyAboveLagMs: number;
};

export type PerfUiFrameSamplerConfig = {
  enabled: boolean;
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
};
