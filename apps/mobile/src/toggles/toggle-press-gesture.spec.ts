// THE ONE PRESS LAYER's config contract (G3): both toggle controls ride this exact
// builder, so the T1/T2 press semantics live here or nowhere. RNGH/reanimated are
// mocked (hermetic node lane); the fake gesture records the chain.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

type Handler = (...args: unknown[]) => void;

const createFakeTap = () => {
  const calls: Record<string, unknown[]> = {};
  const handlers: Record<string, Handler> = {};
  const tap: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['maxDuration', 'shouldCancelWhenOutside']) {
    tap[method] = (...args: unknown[]) => {
      calls[method] = args;
      return tap;
    };
  }
  for (const method of ['onBegin', 'onFinalize', 'onEnd']) {
    tap[method] = (handler: unknown) => {
      handlers[method] = handler as Handler;
      return tap;
    };
  }
  return { tap, calls, handlers };
};

let fake = createFakeTap();

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Tap: () => fake.tap },
}));
jest.mock('react-native-reanimated', () => ({
  // Identity timing: the spec asserts the TARGET the worklet writes, not the ramp.
  withTiming: (value: number) => value,
}));

import { buildTogglePressGesture } from './toggle-press-gesture';

describe('buildTogglePressGesture (the one toggle press layer)', () => {
  beforeEach(() => {
    fake = createFakeTap();
  });

  it('states T1/T2 once: unbounded press-up (maxDuration 1e9) and no cancel-on-outside', () => {
    buildTogglePressGesture({ onEndWorklet: () => undefined });
    expect(fake.calls.maxDuration).toEqual([1e9]);
    expect(fake.calls.shouldCancelWhenOutside).toEqual([false]);
    expect(fake.handlers.onEnd).toBeDefined();
    // No pressedProgress declared → no pressed-face handlers (the pill's ruling:
    // its pressed face is the traveling highlight).
    expect(fake.handlers.onBegin).toBeUndefined();
    expect(fake.handlers.onFinalize).toBeUndefined();
  });

  it('drives the pressed face on the UI thread: 0→1 on touch-down, →0 on finalize', () => {
    const pressedProgress = { value: 0 };
    buildTogglePressGesture({
      pressedProgress: pressedProgress as never,
      onEndWorklet: () => undefined,
    });
    fake.handlers.onBegin!();
    expect(pressedProgress.value).toBe(1);
    fake.handlers.onFinalize!();
    expect(pressedProgress.value).toBe(0);
  });

  it('forwards the end edge (event + success) to the control worklet', () => {
    const seen: Array<[unknown, unknown]> = [];
    buildTogglePressGesture({
      onEndWorklet: (event, success) => {
        seen.push([event, success]);
      },
    });
    const event = { x: 12 };
    fake.handlers.onEnd!(event, true);
    fake.handlers.onEnd!(event, false);
    expect(seen).toEqual([
      [event, true],
      [event, false],
    ]);
  });
});
