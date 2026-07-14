// Runs with __DEV__ = true so dev-only contracts stay exercised. The content
// consequence is REAL as of leg 4 (press-up exit → ready snap-in + gap
// instrumentation); its specs below are the choreography's mechanical walkthrough.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
jest.mock('../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { DEFAULT_TOGGLE_SETTLE_MS } from './toggle-interaction-engine';
import {
  createToggleStripConsequenceSeam,
  type ToggleStripFloorSignal,
} from './toggle-strip-consequence';

type Kind = 'tab_switch' | 'feed_query';

const createFakeFloorSignal = (
  atFloor = false
): ToggleStripFloorSignal & {
  ackFloor: () => void;
  listenerCount: () => number;
  setAtFloor: (next: boolean) => void;
} => {
  const listeners = new Set<() => void>();
  let isAtFloor = atFloor;
  return {
    isAtFloor: () => isAtFloor,
    subscribeFloorAck: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ackFloor: () => {
      isAtFloor = true;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
    setAtFloor: (next) => {
      isAtFloor = next;
    },
  };
};

describe('toggle-strip-consequence seam', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("consequence: 'world' (floor-gated — the search wiring, generalized)", () => {
    it('holds the commit past the quiet window until the floor acks, then fires exactly once', () => {
      const floorSignal = createFakeFloorSignal(false);
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'spec',
      });
      const runner = jest.fn();
      seam.scheduleCommit(runner, { kind: 'tab_switch' });

      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      // Quiet window elapsed, floor NOT acked: the swap may not land over a visible world.
      expect(runner).not.toHaveBeenCalled();

      floorSignal.ackFloor();
      expect(runner).toHaveBeenCalledTimes(1);
      seam.dispose();
    });

    it('commits on the quiet window alone when the surface is ALREADY at its floor', () => {
      const floorSignal = createFakeFloorSignal(true);
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'spec',
      });
      const runner = jest.fn();
      seam.scheduleCommit(runner, { kind: 'tab_switch' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(runner).toHaveBeenCalledTimes(1);
      seam.dispose();
    });

    it('burst schedules coalesce: exactly one commit, for the LAST kind', () => {
      const floorSignal = createFakeFloorSignal(true);
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'spec',
      });
      const first = jest.fn();
      const second = jest.fn();
      seam.scheduleCommit(first, { kind: 'tab_switch' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS - 50);
      seam.scheduleCommit(second, { kind: 'feed_query' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      seam.dispose();
    });

    it('dispose unsubscribes the floor signal (no zombie listener can poke a dead engine)', () => {
      const floorSignal = createFakeFloorSignal(false);
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'spec',
      });
      expect(floorSignal.listenerCount()).toBe(1);
      seam.dispose();
      expect(floorSignal.listenerCount()).toBe(0);
    });

    it('mirrors interaction state into the declared sink (pending → committed → idle)', () => {
      const floorSignal = createFakeFloorSignal(true);
      const states: { kind: Kind | null; pending: string | null }[] = [];
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'spec',
        onInteractionState: (state) =>
          states.push({ kind: state.kind, pending: state.pendingPresentationIntentId }),
      });
      seam.scheduleCommit(() => undefined, { kind: 'tab_switch' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(states[0]).toEqual({ kind: 'tab_switch', pending: expect.any(String) });
      expect(states[states.length - 1]).toEqual({ kind: null, pending: null });
      seam.dispose();
    });
  });

  describe("consequence: 'content' (leg 4 — press-up exit → ready snap-in, instrumented)", () => {
    it('flips the phase to awaiting SYNCHRONOUSLY on scheduleCommit (old cards exit NOW) and settles on runner resolution', async () => {
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
      });
      expect(seam.getContentPhase()).toBe('settled');

      let resolveRunner: () => void = () => undefined;
      const runner = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveRunner = resolve;
          })
      );
      const phases: string[] = [];
      seam.subscribeContentPhase(() => phases.push(seam.getContentPhase()));

      seam.scheduleCommit(runner, { kind: 'feed_query' });
      // The exit edge is the caller's own stack — before any timer.
      expect(seam.getContentPhase()).toBe('awaiting');
      expect(runner).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(runner).toHaveBeenCalledTimes(1);
      expect(seam.getContentPhase()).toBe('awaiting'); // fetch still in flight

      resolveRunner();
      await Promise.resolve();
      await Promise.resolve();
      expect(seam.getContentPhase()).toBe('settled'); // the ready edge — new cards snap in
      expect(phases).toEqual(['awaiting', 'settled']);
      seam.dispose();
    });

    it('a tap burst coalesces into ONE runner call while the phase stays awaiting throughout', async () => {
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
      });
      const first = jest.fn(async () => undefined);
      const second = jest.fn(async () => undefined);
      seam.scheduleCommit(first, { kind: 'feed_query' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS - 50);
      seam.scheduleCommit(second, { kind: 'feed_query' });
      expect(seam.getContentPhase()).toBe('awaiting');
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      await Promise.resolve();
      expect(seam.getContentPhase()).toBe('settled');
      seam.dispose();
    });

    it('settleMs: 0 with a synchronous runner degenerates cleanly: exit and enter collapse into ONE call stack', () => {
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'bookmarks-home',
        settleMs: 0,
      });
      const runner = jest.fn(); // synchronous client re-slice (the store write already happened)
      seam.scheduleCommit(runner, { kind: 'feed_query' });
      // By the time scheduleCommit returns, begin → commit → runner → finalize all ran:
      // React can never render an 'awaiting' frame.
      expect(runner).toHaveBeenCalledTimes(1);
      expect(seam.getContentPhase()).toBe('settled');
      seam.dispose();
    });

    it('a FAILING runner still settles the phase (the surface can never be stuck on bare white)', async () => {
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
      });
      seam.scheduleCommit(
        async () => {
          throw new Error('network down');
        },
        { kind: 'feed_query' }
      );
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(seam.getContentPhase()).toBe('settled');
      seam.dispose();
    });

    it('INSTRUMENTS the press-up→ready gap: one [CONTENTTOGGLE] gap log per burst with the exit/press timestamps', async () => {
      const { logger } = jest.requireMock('../utils') as {
        logger: { info: jest.Mock };
      };
      logger.info.mockClear();
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
      });
      seam.scheduleCommit(async () => undefined, { kind: 'feed_query' });
      jest.advanceTimersByTime(100);
      seam.scheduleCommit(async () => undefined, { kind: 'feed_query' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      const gapCalls = logger.info.mock.calls.filter(
        (call: unknown[]) => call[0] === '[CONTENTTOGGLE] gap'
      );
      expect(gapCalls).toHaveLength(1);
      expect(gapCalls[0]![1]).toMatchObject({
        surface: 'polls-feed',
        kind: 'feed_query',
        outcome: 'finalized',
        commits: 2,
      });
      expect(typeof gapCalls[0]![1].exitToReadyMs).toBe('number');
      expect(typeof gapCalls[0]![1].lastPressToReadyMs).toBe('number');
      seam.dispose();
    });

    // ── Leg 5: control/content coherence on failure (captureControlBaseline) ──────
    // A fake control store: baseline capture snapshots `value`; restore writes it back.
    const createFakeControlStore = () => {
      let value = 'live';
      return {
        set: (next: string) => {
          value = next;
        },
        get: () => value,
        captureControlBaseline: jest.fn(() => {
          const snapshot = value;
          return () => {
            value = snapshot;
          };
        }),
      };
    };

    it('REVERTS the optimistic control to the last SETTLED snapshot on the failed edge', async () => {
      const store = createFakeControlStore();
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
        captureControlBaseline: store.captureControlBaseline,
      });
      // Press: optimistic flip BEFORE scheduleCommit (the real press-handler order).
      store.set('results');
      seam.scheduleCommit(
        async () => {
          throw new Error('slice did not land');
        },
        { kind: 'feed_query' }
      );
      expect(store.get()).toBe('results'); // optimistic until the outcome
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      // Failed → the control snaps back to the pre-burst baseline; phase settled.
      expect(store.get()).toBe('live');
      expect(seam.getContentPhase()).toBe('settled');
      seam.dispose();
    });

    it('rolls the baseline FORWARD on success: a later failure reverts to the committed value, not the original', async () => {
      const store = createFakeControlStore();
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
        captureControlBaseline: store.captureControlBaseline,
      });
      // Burst 1 succeeds: 'results' becomes the settled baseline.
      store.set('results');
      seam.scheduleCommit(async () => undefined, { kind: 'feed_query' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      // Burst 2 fails: revert lands on 'results' (the last settle), never 'live'.
      store.set('live');
      seam.scheduleCommit(
        async () => {
          throw new Error('down');
        },
        { kind: 'feed_query' }
      );
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(store.get()).toBe('results');
      seam.dispose();
    });

    it('a tap BURST that fails reverts past every press to the pre-burst baseline', async () => {
      const store = createFakeControlStore();
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
        captureControlBaseline: store.captureControlBaseline,
      });
      store.set('results');
      seam.scheduleCommit(
        async () => {
          throw new Error('down');
        },
        { kind: 'feed_query' }
      );
      jest.advanceTimersByTime(100);
      store.set('closed-weekly');
      seam.scheduleCommit(
        async () => {
          throw new Error('down');
        },
        { kind: 'feed_query' }
      );
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(store.get()).toBe('live');
      seam.dispose();
    });

    it('success does NOT restore, and dispose (cancelled) does NOT restore — teardown is not a failure', async () => {
      const store = createFakeControlStore();
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'content',
        surfaceName: 'polls-feed',
        captureControlBaseline: store.captureControlBaseline,
      });
      store.set('results');
      seam.scheduleCommit(async () => undefined, { kind: 'feed_query' });
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(store.get()).toBe('results'); // finalized keeps the committed value
      store.set('closed');
      seam.scheduleCommit(
        () => new Promise(() => undefined), // never resolves — awaiting at dispose
        { kind: 'feed_query' }
      );
      jest.advanceTimersByTime(DEFAULT_TOGGLE_SETTLE_MS);
      expect(seam.getContentPhase()).toBe('awaiting');
      seam.dispose();
      expect(seam.getContentPhase()).toBe('settled');
      expect(store.get()).toBe('closed'); // no revert on teardown
    });

    it("a world seam's content phase is inert: always 'settled'", () => {
      const floorSignal = createFakeFloorSignal(true);
      const seam = createToggleStripConsequenceSeam<Kind>({
        consequence: 'world',
        floorSignal,
        surfaceName: 'results',
      });
      seam.scheduleCommit(() => undefined, { kind: 'tab_switch' });
      expect(seam.getContentPhase()).toBe('settled');
      seam.dispose();
    });
  });
});
