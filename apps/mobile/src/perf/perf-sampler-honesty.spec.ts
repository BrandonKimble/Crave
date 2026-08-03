/**
 * F850 + F851 — THE SAMPLERS MUST BE ABLE TO SHOW RED.
 *
 * These are mutate-and-observe cases against the real sampler modules: each one
 * drives a defect (a missing native module, a native `start` that throws, a
 * 6-second freeze) and asserts the instrument SAYS SO. Before this pass all
 * three defects produced silence, and silence read as a perfect run.
 *
 * RED recipes:
 *   F850 — make `startUiFrameSampler` return a bare no-op again (drop the
 *          attachment result): the "missing module" cases stop reporting
 *          `attached:false` and fail.
 *   F851 — restore the bare `flushWindow(nowMs); return;` clamp branch in
 *          js-frame-sampler.ts / js-task-latency-sampler.ts: the freeze cases
 *          observe zero stalls and fail.
 */
const nativeModules: Record<string, unknown> = {};

jest.mock(
  'react-native',
  () => ({
    Platform: { OS: 'ios' },
    NativeModules: nativeModules,
    NativeEventEmitter: class {
      addListener() {
        return { remove: () => undefined };
      }
    },
  }),
  { virtual: true }
);

jest.mock(
  '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution',
  () => ({
    withSearchNavSwitchRuntimeAttribution: (
      _source: string,
      _phase: string,
      run: () => void
    ): void => run(),
  }),
  { virtual: true }
);

import { startUiFrameSampler, UI_FRAME_SAMPLER_MODULE_NAME } from './ui-frame-sampler';
import { startJsFrameSampler, type JsFrameSamplerStallEvent } from './js-frame-sampler';
import {
  startJsTaskLatencySampler,
  type JsTaskLatencySamplerStallEvent,
} from './js-task-latency-sampler';

describe('F851 — an over-ceiling frame gap is REPORTED, not discarded', () => {
  const MAX_TRACKED_FRAME_MS = 5000;

  /** Drives startJsFrameSampler over a scripted sequence of frame gaps. */
  const runFrameGaps = (gapsMs: number[]): JsFrameSamplerStallEvent[] => {
    let nowMs = 1000;
    const pending: Array<() => void> = [];
    const originalRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
    const originalCancel = (globalThis as Record<string, unknown>).cancelAnimationFrame;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => {
      pending.push(cb);
      return pending.length;
    };
    (globalThis as Record<string, unknown>).cancelAnimationFrame = () => undefined;

    const stalls: JsFrameSamplerStallEvent[] = [];
    const stop = startJsFrameSampler({
      windowMs: 1000,
      stallFrameMs: 100,
      logOnlyBelowFps: 55,
      getNow: () => nowMs,
      onStall: (event) => stalls.push(event),
    });

    // The first callback only seeds the clock; then one callback per gap.
    const step = (advanceMs: number) => {
      nowMs += advanceMs;
      const next = pending.shift();
      next?.();
    };
    step(0);
    gapsMs.forEach((gap) => step(gap));

    stop();
    (globalThis as Record<string, unknown>).requestAnimationFrame = originalRaf;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = originalCancel;
    return stalls;
  };

  it('a 6-second freeze produces a stall event tagged clamped', () => {
    const stalls = runFrameGaps([MAX_TRACKED_FRAME_MS + 1000]);
    expect(stalls).toHaveLength(1);
    expect(stalls[0]).toMatchObject({ event: 'stall', clamped: true });
    expect(stalls[0].frameMs).toBeGreaterThan(MAX_TRACKED_FRAME_MS);
  });

  it('THE DEFECT THIS EXISTS TO CATCH: a 6s freeze is not quieter than a 200ms one', () => {
    const mild = runFrameGaps([200]);
    const severe = runFrameGaps([MAX_TRACKED_FRAME_MS + 1000]);
    expect(severe.length).toBeGreaterThanOrEqual(mild.length);
    expect(Math.max(...severe.map((s) => s.frameMs))).toBeGreaterThan(
      Math.max(...mild.map((s) => s.frameMs))
    );
  });

  it('a nonsensical delta is still NOT reported (it is not a measurement)', () => {
    expect(runFrameGaps([0])).toHaveLength(0);
  });
});

describe('F851 — an over-ceiling task lag is REPORTED, not discarded', () => {
  const MAX_TRACKED_LAG_MS = 5000;

  const runLags = (lagsMs: number[]): JsTaskLatencySamplerStallEvent[] => {
    jest.useFakeTimers();
    let nowMs = 1000;
    let nextLagIndex = 0;
    const stalls: JsTaskLatencySamplerStallEvent[] = [];
    const stop = startJsTaskLatencySampler({
      windowMs: 1000,
      sampleIntervalMs: 16,
      stallLagMs: 100,
      logOnlyAboveLagMs: 100,
      getNow: () => nowMs,
      onStall: (event) => stalls.push(event),
    });
    for (const lag of lagsMs) {
      // The sampler scheduled a 16ms timer and expects to wake at now+16;
      // waking `lag` late IS the lag it measures.
      nowMs += 16 + lag;
      nextLagIndex += 1;
      jest.advanceTimersByTime(16);
    }
    expect(nextLagIndex).toBe(lagsMs.length);
    stop();
    jest.useRealTimers();
    return stalls;
  };

  it('a 6-second block produces a stall event tagged clamped', () => {
    const stalls = runLags([MAX_TRACKED_LAG_MS + 1000]);
    expect(stalls).toHaveLength(1);
    expect(stalls[0]).toMatchObject({ event: 'task_stall', clamped: true });
    expect(stalls[0].lagMs).toBeGreaterThan(MAX_TRACKED_LAG_MS);
  });

  it('a normal in-range stall is reported without the clamped tag', () => {
    const stalls = runLags([200]);
    expect(stalls).toHaveLength(1);
    expect(stalls[0].clamped).toBeUndefined();
  });
});

describe('F850 — a missing UI frame sampler reads as MISSING, never as a perfect run', () => {
  const samplerOptions = {
    windowMs: 1000,
    stallFrameMs: 100,
    logOnlyBelowFps: 55,
  };

  afterEach(() => {
    delete nativeModules[UI_FRAME_SAMPLER_MODULE_NAME];
  });

  it('no native module at all: attached=false with a named reason', () => {
    const attachment = startUiFrameSampler(samplerOptions);
    expect(attachment.attached).toBe(false);
    expect(attachment.reason).toBe('native_module_missing');
    // The stop callback is still safe to call — the caller does not branch.
    expect(() => attachment.stop()).not.toThrow();
  });

  it('a RENAMED / half-implemented module is malformed, not silently ignored', () => {
    nativeModules[UI_FRAME_SAMPLER_MODULE_NAME] = { start: 'not a function' };
    const attachment = startUiFrameSampler(samplerOptions);
    expect(attachment.attached).toBe(false);
    expect(attachment.reason).toBe('native_module_malformed');
  });

  it('a native start that THROWS is reported, and nothing claims to be sampling', () => {
    nativeModules[UI_FRAME_SAMPLER_MODULE_NAME] = {
      start: () => {
        throw new Error('sampler unavailable on this device');
      },
      stop: () => undefined,
    };
    const attachment = startUiFrameSampler(samplerOptions);
    expect(attachment.attached).toBe(false);
    expect(attachment.reason).toBe('native_start_threw');
    expect(attachment.detail).toContain('sampler unavailable');
  });

  it('a working module attaches, and stop() reaches native stop exactly once', () => {
    let started = 0;
    let stopped = 0;
    nativeModules[UI_FRAME_SAMPLER_MODULE_NAME] = {
      start: () => {
        started += 1;
      },
      stop: () => {
        stopped += 1;
      },
    };
    const attachment = startUiFrameSampler(samplerOptions);
    expect(attachment).toMatchObject({ attached: true, reason: null });
    expect(started).toBe(1);
    attachment.stop();
    expect(stopped).toBe(1);
  });
});
