// The RN logger reads __DEV__ at module scope; this suite runs in plain node.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
jest.mock('../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  createToggleInteractionEngine,
  DEFAULT_TOGGLE_SETTLE_MS,
  type ToggleLifecycleEvent,
} from './toggle-interaction-engine';

type Kind = 'a' | 'b';

const flushMicrotasks = async (): Promise<void> => {
  // Two hops: promise runner resolution + the engine's .then landing.
  await Promise.resolve();
  await Promise.resolve();
};

describe('toggle-interaction-engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const collect = () => {
    const events: ToggleLifecycleEvent<Kind>[] = [];
    const states: { kind: Kind | null; pending: string | null }[] = [];
    const engine = createToggleInteractionEngine<Kind>({
      onLifecycle: (event) => events.push(event),
      onInteractionState: (state) =>
        states.push({ kind: state.kind, pending: state.pendingPresentationIntentId }),
    });
    return { engine, events, states };
  };

  it('burst taps commit exactly once, for the LAST interaction', () => {
    const { engine, events } = collect();
    const runs: string[] = [];
    engine.begin(() => void runs.push('first'), { kind: 'a' });
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS - 50);
    engine.begin(() => void runs.push('second'), { kind: 'b' });
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS - 50);
    engine.begin(() => void runs.push('third'), { kind: 'a' });
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(runs).toEqual(['third']);
    expect(events.filter((e) => e.type === 'settled')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'finalized')).toHaveLength(1);
    expect(engine.getState().pendingPresentationIntentId).toBeNull();
  });

  it('cancel mid-window drops the commit and emits cancelled', () => {
    const { engine, events } = collect();
    const runner = jest.fn();
    engine.begin(runner, { kind: 'a' });
    engine.cancel();
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(runner).not.toHaveBeenCalled();
    expect(events.map((e) => e.type)).toEqual(['started', 'cancelled']);
    expect(engine.getState().kind).toBeNull();
  });

  it('visual-sync path waits for notifyIntentComplete', () => {
    const { engine, events } = collect();
    let intent = '';
    engine.begin(
      ({ intentId }) => {
        intent = intentId;
        return { awaitVisualSync: true };
      },
      { kind: 'a' }
    );
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(events.map((e) => e.type)).toEqual(['started', 'settled']);
    engine.notifyIntentComplete('toggle-intent:nope');
    expect(events.map((e) => e.type)).toEqual(['started', 'settled']);
    engine.notifyIntentComplete(intent);
    const finalized = events.at(-1);
    expect(finalized).toEqual({
      type: 'finalized',
      intentId: intent,
      kind: 'a',
      awaitedVisualSync: true,
    });
  });

  it('a throwing runner emits failed then finalized', () => {
    const { engine, events } = collect();
    engine.begin(
      () => {
        throw new Error('boom');
      },
      { kind: 'a' }
    );
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(events.map((e) => e.type)).toEqual(['started', 'settled', 'failed', 'finalized']);
    expect(events.find((e) => e.type === 'failed')).toMatchObject({ reason: 'boom' });
  });

  it('an async rejection emits failed; a superseded async landing is dropped', async () => {
    const { engine, events } = collect();
    engine.begin(() => Promise.reject(new Error('net down')), { kind: 'a' });
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    await flushMicrotasks();
    expect(events.map((e) => e.type)).toEqual(['started', 'settled', 'failed', 'finalized']);

    // Superseded landing: first async commit resolves AFTER a newer begin.
    const { engine: engine2, events: events2 } = collect();
    const gateCtl: { release?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      gateCtl.release = resolve;
    });
    engine2.begin(() => gate.then(() => ({ awaitVisualSync: false })), { kind: 'a' });
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    engine2.begin(() => undefined, { kind: 'b' });
    gateCtl.release?.();
    await flushMicrotasks();
    // The stale landing must not finalize interaction 2.
    expect(engine2.getState()).toEqual({
      kind: 'b',
      pendingPresentationIntentId: 'toggle-intent:2',
    });
    expect(events2.filter((e) => e.type === 'finalized')).toHaveLength(0);
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(events2.filter((e) => e.type === 'finalized')).toHaveLength(1);
  });

  it('begin aborts a superseded in-flight consequence signal', () => {
    const { engine } = collect();
    const seen: { signal?: AbortSignal; release?: () => void } = {};
    engine.begin(
      ({ signal }) => {
        seen.signal = signal;
        return new Promise<void>((resolve) => {
          seen.release = resolve;
        });
      },
      { kind: 'a' }
    );
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(seen.signal?.aborted).toBe(false);
    engine.begin(() => undefined, { kind: 'b' });
    expect(seen.signal?.aborted).toBe(true);
    seen.release?.();
  });

  it('settleMs 0 commits synchronously on begin', () => {
    const events: ToggleLifecycleEvent<Kind>[] = [];
    const engine = createToggleInteractionEngine<Kind>({
      onLifecycle: (e) => events.push(e),
      settleMs: 0,
    });
    const runner = jest.fn();
    engine.begin(runner, { kind: 'a' });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.type)).toEqual(['started', 'settled', 'finalized']);
  });

  it('dispose is a quiet full stop: timer cleared, signal aborted, landing dropped, no events', () => {
    const events: ToggleLifecycleEvent<Kind>[] = [];
    const engine = createToggleInteractionEngine<Kind>({ onLifecycle: (e) => events.push(e) });
    const seen: { signal?: AbortSignal } = {};
    engine.begin(
      ({ signal }) => {
        seen.signal = signal;
        return new Promise<void>(() => {});
      },
      { kind: 'a' }
    );
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(events.map((e) => e.type)).toEqual(['started', 'settled']);
    engine.dispose();
    expect(seen.signal?.aborted).toBe(true);
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    // No finalize/cancel/failed after dispose — the surface is gone.
    expect(events.map((e) => e.type)).toEqual(['started', 'settled']);
  });

  it('subscribe fires on every state transition and unsubscribes cleanly', () => {
    const engine = createToggleInteractionEngine<Kind>();
    const listener = jest.fn();
    const unsubscribe = engine.subscribe(listener);
    engine.begin(() => undefined, { kind: 'a' });
    expect(listener).toHaveBeenCalledTimes(1); // pending publish
    jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS + 10);
    expect(listener).toHaveBeenCalledTimes(3); // + settled publish + idle finalize
    unsubscribe();
    engine.begin(() => undefined, { kind: 'b' });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
