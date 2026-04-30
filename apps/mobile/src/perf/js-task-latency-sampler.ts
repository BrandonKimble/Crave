type JsTaskLatencySamplerWindowSummary = {
  event: 'task_window';
  nowMs: number;
  windowMs: number;
  sampleCount: number;
  avgLagMs: number;
  p95LagMs: number;
  maxLagMs: number;
  maxLagStartedAtMs: number;
  maxLagEndedAtMs: number;
  stallCount: number;
  stallLongestMs: number;
};

type JsTaskLatencySamplerStallEvent = {
  event: 'task_stall';
  nowMs: number;
  lagMs: number;
};

type JsTaskLatencySamplerOptions = {
  windowMs: number;
  sampleIntervalMs: number;
  stallLagMs: number;
  logOnlyAboveLagMs: number;
  getNow?: () => number;
  onWindow?: (summary: JsTaskLatencySamplerWindowSummary) => void;
  onStall?: (event: JsTaskLatencySamplerStallEvent) => void;
};

const MAX_TRACKED_LAG_MS = 5000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round1 = (value: number): number => Math.round(value * 10) / 10;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index] ?? 0;
};

const defaultNow = (): number => {
  if (typeof performance?.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const startJsTaskLatencySampler = (options: JsTaskLatencySamplerOptions): (() => void) => {
  const getNow = options.getNow ?? defaultNow;
  const windowMs = clamp(options.windowMs, 120, 60000);
  const sampleIntervalMs = clamp(options.sampleIntervalMs, 1, 1000);
  const stallLagMs = clamp(options.stallLagMs, 1, MAX_TRACKED_LAG_MS);
  const logOnlyAboveLagMs = clamp(options.logOnlyAboveLagMs, 0, MAX_TRACKED_LAG_MS);

  let stopped = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let windowStartedAtMs = getNow();
  let expectedSampleAtMs = windowStartedAtMs + sampleIntervalMs;
  let sampleCount = 0;
  let totalLagMs = 0;
  let maxLagMs = 0;
  let maxLagStartedAtMs = windowStartedAtMs;
  let maxLagEndedAtMs = windowStartedAtMs;
  let stallCount = 0;
  let stallLongestMs = 0;
  let lagDurations: number[] = [];

  const resetWindow = (nowMs: number) => {
    windowStartedAtMs = nowMs;
    sampleCount = 0;
    totalLagMs = 0;
    maxLagMs = 0;
    maxLagStartedAtMs = nowMs;
    maxLagEndedAtMs = nowMs;
    stallCount = 0;
    stallLongestMs = 0;
    lagDurations = [];
  };

  const flushWindow = (nowMs: number) => {
    if (sampleCount <= 0) {
      resetWindow(nowMs);
      return;
    }
    const elapsedWindowMs = nowMs - windowStartedAtMs;
    if (!Number.isFinite(elapsedWindowMs) || elapsedWindowMs <= 0) {
      resetWindow(nowMs);
      return;
    }
    const avgLagMs = totalLagMs / sampleCount;
    const p95LagMs = percentile(lagDurations, 95);
    const summary: JsTaskLatencySamplerWindowSummary = {
      event: 'task_window',
      nowMs: round1(nowMs),
      windowMs: round1(elapsedWindowMs),
      sampleCount,
      avgLagMs: round1(avgLagMs),
      p95LagMs: round1(p95LagMs),
      maxLagMs: round1(maxLagMs),
      maxLagStartedAtMs: round1(maxLagStartedAtMs),
      maxLagEndedAtMs: round1(maxLagEndedAtMs),
      stallCount,
      stallLongestMs: round1(stallLongestMs),
    };
    if (stallCount > 0 || avgLagMs >= logOnlyAboveLagMs || maxLagMs >= logOnlyAboveLagMs) {
      options.onWindow?.(summary);
    }
    resetWindow(nowMs);
  };

  const scheduleNext = () => {
    if (stopped) {
      return;
    }
    expectedSampleAtMs = getNow() + sampleIntervalMs;
    timeoutHandle = setTimeout(onSample, sampleIntervalMs);
  };

  const onSample = () => {
    if (stopped) {
      return;
    }
    const nowMs = getNow();
    const lagMs = Math.max(0, nowMs - expectedSampleAtMs);

    if (Number.isFinite(lagMs) && lagMs <= MAX_TRACKED_LAG_MS) {
      sampleCount += 1;
      totalLagMs += lagMs;
      if (lagMs > maxLagMs) {
        maxLagMs = lagMs;
        maxLagStartedAtMs = expectedSampleAtMs;
        maxLagEndedAtMs = nowMs;
      }
      lagDurations.push(lagMs);
      if (lagMs >= stallLagMs) {
        stallCount += 1;
        stallLongestMs = Math.max(stallLongestMs, lagMs);
        options.onStall?.({
          event: 'task_stall',
          nowMs: round1(nowMs),
          lagMs: round1(lagMs),
        });
      }
    } else {
      flushWindow(nowMs);
    }

    if (nowMs - windowStartedAtMs >= windowMs) {
      flushWindow(nowMs);
    }
    scheduleNext();
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timeoutHandle != null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };
};

export type {
  JsTaskLatencySamplerOptions,
  JsTaskLatencySamplerStallEvent,
  JsTaskLatencySamplerWindowSummary,
};
export { startJsTaskLatencySampler };
