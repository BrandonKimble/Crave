// F873: clamp/round1/percentile live in perf-clock.ts — one declaration, both samplers.
import { clamp, percentile, round1 } from './perf-clock';

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
  /**
   * F851 — TRUE when the gap exceeded MAX_TRACKED_FRAME_MS.
   *
   * A gap that large is EITHER the app being suspended (backgrounded, debugger
   * paused, sim lid closed) OR the single worst JS block the sampler exists to
   * catch. The sampler cannot tell those apart, so it must not decide: it used
   * to DROP the gap silently, which meant a 6-second freeze produced FEWER
   * stall events than a 200ms one — the most severe defect was the one the
   * instrument was blind to. Now the gap is REPORTED with `clamped:true`, and
   * the consumer (which knows about backgrounding) decides.
   *
   * It is deliberately excluded from the window's frame statistics — a 6000ms
   * sample would swamp avg/p95 and make every other number unreadable — so the
   * window still flushes at the boundary; only the silence is gone.
   */
  clamped?: boolean;
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

/**
 * F852 — THE UNCONDITIONAL HALF. `shouldLogWindow` (below) stays RED-only —
 * proven on-device (2026-08-05) to emit a steady stream when
 * `logOnlyBelowFps` is raised above the refresh rate, and to go silent
 * whenever the rAF loop truly isn't running. But per-window RED-only logging
 * still means "no output" during a normal run is ambiguous by construction.
 * `windowsObserved`/`badWindowsObserved` are counted regardless of the log
 * gate and handed back via `getLiveness()` on the returned stop handle, so a
 * caller can emit ONE unconditional liveness fact at scenario end
 * (`windowsObserved > 0` proves the loop ran; `badWindowsObserved` says how
 * much of it was bad) without turning the per-window channel chatty.
 */
type JsFrameSamplerLiveness = {
  windowsObserved: number;
  badWindowsObserved: number;
};

type JsFrameSamplerStopHandle = (() => void) & {
  getLiveness: () => JsFrameSamplerLiveness;
};

const startJsFrameSampler = (options: JsFrameSamplerOptions): JsFrameSamplerStopHandle => {
  let windowsObserved = 0;
  let badWindowsObserved = 0;
  const getLiveness = (): JsFrameSamplerLiveness => ({ windowsObserved, badWindowsObserved });

  if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
    const noop = (() => undefined) as JsFrameSamplerStopHandle;
    noop.getLiveness = getLiveness;
    return noop;
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
    // F852 — RED-ONLY LOGGING, AND WHAT THAT COSTS. A window is emitted only when
    // it is BAD, which is right for a log you grep during a run. The price is that
    // "no output" now covers several worlds: a perfect run, a sampler that never
    // started, a scenario that never fired, and a JS thread so blocked that rAF
    // never ran at all. F850 closed the "never started" case for the UI sampler by
    // reporting the attach verdict unconditionally; the JS samplers cannot fail to
    // attach, so their silence still needs the scenario_sampling_started line to be
    // read alongside it.
    //
    // RED RECIPE (needs a device — no cheap in-process mutation exists for the
    // rAF loop's real timing): run any perf scenario with
    // `logOnlyBelowFps` raised above the device's refresh rate (e.g. 200) — every
    // window then qualifies as bad and the channel must produce a steady stream of
    // [SearchPerf][JsFrameSampler] window lines. If it stays silent at 200, the
    // sampler is not running and the silence at 55 meant nothing.
    windowsObserved += 1;
    const shouldLogWindow =
      stallCount > 0 || avgFps < logOnlyBelowFps || floorFps < logOnlyBelowFps;
    if (shouldLogWindow) {
      badWindowsObserved += 1;
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
      // F851: an over-ceiling gap is REPORTED before the window is cut, tagged
      // `clamped` so a consumer can attribute it to suspension if it knows
      // better. A nonsensical delta (<=0, NaN) is genuinely not a measurement
      // and stays unreported.
      if (Number.isFinite(frameMs) && frameMs > MAX_TRACKED_FRAME_MS) {
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
          clamped: true,
        });
      }
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

  const stop = (() => {
    stopped = true;
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }) as JsFrameSamplerStopHandle;
  stop.getLiveness = getLiveness;
  return stop;
};

export type {
  JsFrameSamplerLiveness,
  JsFrameSamplerOptions,
  JsFrameSamplerStallEvent,
  JsFrameSamplerWindowSummary,
};
export { startJsFrameSampler };
