type JsFrameSamplerWindowSummary = {
  event: 'window';
  nowMs: number;
  windowMs: number;
  frameCount: number;
  avgFrameMs: number;
  avgFps: number;
  floorFps: number;
  p95FrameMs: number;
  p95Fps: number;
  maxFrameMs: number;
  stallCount: number;
  stallLongestMs: number;
  droppedFrameEstimate: number;
  droppedFrameRatio: number;
};

type JsFrameSamplerStallEvent = {
  event: 'stall';
  nowMs: number;
  frameMs: number;
  fps: number | null;
};

type JsFrameSamplerOptions = {
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
  getNow?: () => number;
  onWindow?: (summary: JsFrameSamplerWindowSummary) => void;
  onStall?: (event: JsFrameSamplerStallEvent) => void;
};

const FRAME_MS_AT_60_FPS = 1000 / 60;
const MAX_TRACKED_FRAME_MS = 5000;

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

const toFps = (frameMs: number): number => {
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    return 0;
  }
  return 1000 / frameMs;
};

const toOptionalFps = (frameMs: number): number | null => {
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    return null;
  }
  return 1000 / frameMs;
};

const startJsFrameSampler = (options: JsFrameSamplerOptions): (() => void) => {
  if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
    return () => undefined;
  }

  const getNow = options.getNow ?? defaultNow;
  const windowMs = clamp(options.windowMs, 120, 60000);
  const stallFrameMs = clamp(options.stallFrameMs, FRAME_MS_AT_60_FPS, MAX_TRACKED_FRAME_MS);
  const logOnlyBelowFps = clamp(options.logOnlyBelowFps, 1, 240);

  let stopped = false;
  let rafHandle: number | null = null;
  let windowStartedAtMs = 0;
  let lastFrameAtMs = 0;
  let frameCount = 0;
  let totalFrameMs = 0;
  let maxFrameMs = 0;
  let stallCount = 0;
  let stallLongestMs = 0;
  let frameDurations: number[] = [];

  const resetWindow = (nowMs: number) => {
    windowStartedAtMs = nowMs;
    frameCount = 0;
    totalFrameMs = 0;
    maxFrameMs = 0;
    stallCount = 0;
    stallLongestMs = 0;
    frameDurations = [];
  };

  const flushWindow = (nowMs: number) => {
    if (frameCount <= 0) {
      resetWindow(nowMs);
      return;
    }
    const elapsedWindowMs = nowMs - windowStartedAtMs;
    if (!Number.isFinite(elapsedWindowMs) || elapsedWindowMs <= 0) {
      resetWindow(nowMs);
      return;
    }
    const avgFrameMs = totalFrameMs / frameCount;
    const p95FrameMs = percentile(frameDurations, 95);
    const avgFps = toFps(avgFrameMs);
    const floorFps = toFps(maxFrameMs);
    const p95Fps = toFps(p95FrameMs);
    const expectedFrames = elapsedWindowMs / FRAME_MS_AT_60_FPS;
    const droppedFrameEstimate = Math.max(0, expectedFrames - frameCount);
    const droppedFrameRatio = expectedFrames > 0 ? droppedFrameEstimate / expectedFrames : 0;
    const summary: JsFrameSamplerWindowSummary = {
      event: 'window',
      nowMs: round1(nowMs),
      windowMs: round1(elapsedWindowMs),
      frameCount,
      avgFrameMs: round1(avgFrameMs),
      avgFps: round1(avgFps),
      floorFps: round1(floorFps),
      p95FrameMs: round1(p95FrameMs),
      p95Fps: round1(p95Fps),
      maxFrameMs: round1(maxFrameMs),
      stallCount,
      stallLongestMs: round1(stallLongestMs),
      droppedFrameEstimate: round1(droppedFrameEstimate),
      droppedFrameRatio: round1(droppedFrameRatio),
    };
    const shouldLogWindow = stallCount > 0 || avgFps < logOnlyBelowFps || floorFps < logOnlyBelowFps;
    if (shouldLogWindow) {
      options.onWindow?.(summary);
    }
    resetWindow(nowMs);
  };

  const onFrame = () => {
    if (stopped) {
      return;
    }
    const nowMs = getNow();
    if (windowStartedAtMs <= 0) {
      windowStartedAtMs = nowMs;
      lastFrameAtMs = nowMs;
      rafHandle = requestAnimationFrame(onFrame);
      return;
    }
    const frameMs = nowMs - lastFrameAtMs;
    lastFrameAtMs = nowMs;
    if (frameMs <= 0 || !Number.isFinite(frameMs) || frameMs > MAX_TRACKED_FRAME_MS) {
      flushWindow(nowMs);
      rafHandle = requestAnimationFrame(onFrame);
      return;
    }

    frameCount += 1;
    totalFrameMs += frameMs;
    maxFrameMs = Math.max(maxFrameMs, frameMs);
    frameDurations.push(frameMs);

    if (frameMs >= stallFrameMs) {
      stallCount += 1;
      stallLongestMs = Math.max(stallLongestMs, frameMs);
      options.onStall?.({
        event: 'stall',
        nowMs: round1(nowMs),
        frameMs: round1(frameMs),
        fps: (() => {
          const fps = toOptionalFps(frameMs);
          return fps == null ? null : round1(fps);
        })(),
      });
    }

    if (nowMs - windowStartedAtMs >= windowMs) {
      flushWindow(nowMs);
    }

    rafHandle = requestAnimationFrame(onFrame);
  };

  rafHandle = requestAnimationFrame(onFrame);

  return () => {
    stopped = true;
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  };
};

export type { JsFrameSamplerOptions, JsFrameSamplerStallEvent, JsFrameSamplerWindowSummary };
export { startJsFrameSampler };
