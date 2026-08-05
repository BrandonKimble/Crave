// ─── FALSIFIERS: THE LIVENESS BACKSTOP ON THE REAL HOST (G-APPSTATE) ──────────
//
// The pure lane proves the backstop's law (track-motion-deadline.spec.ts); this
// lane proves the REAL controller wiring obeys it — the AppState subscription
// exists, the OS timer is cancelled/rescheduled, and a degrade releases the
// waiting transition WITHOUT being mistaken for a settle.
//
// Each test names the mutation that turns it RED (ledger in the task report).

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import { getTrackMotionAuthority } from '../track-motion-authority';
import { setAppStateForTest } from './mocks/react-native-mock';
import {
  clearRecords,
  flushAsync,
  harness,
  renderHost,
  resetHarness,
  sendMotionCommand,
  settleAt,
} from './render-utils';

// Geometry from the harness sharedSheetOwner: expanded 100 / middle 400 /
// collapsed 700 → trackH 600, middleTau 300.
const EXPANDED_TAU = 600;

describe('the liveness backstop across app suspension (G-APPSTATE)', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHarness();
    setAppStateForTest('active');
    renderer = await renderHost();
    harness.world.surface.redrawTxnId = 'rt1';
    clearRecords(harness.world);
  });

  afterEach(async () => {
    setAppStateForTest('active');
    await act(async () => {
      renderer.unmount();
    });
    jest.useRealTimers();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // FALSIFIER: background time does not advance the deadline, ON THE HOST.
  // RED if the controller goes back to a bare setTimeout (no AppState listener,
  // or one that does not cancel/reschedule the OS timer).
  it('a token owed across a suspend is NOT completed by background time', async () => {
    const world = harness.world;
    await sendMotionCommand('middle', 41);
    await act(async () => {
      setAppStateForTest('background');
    });
    // Ten minutes of wall clock with the app suspended: nothing releases.
    await act(async () => {
      jest.advanceTimersByTime(600_000);
    });
    expect(world.settleCompletions).not.toContain(41);
    expect(getTrackMotionAuthority().isAtRest()).toBe(false);
    // Resuming re-arms a FRESH budget — the very first frames back are not a
    // deadline that already expired in absentia.
    await act(async () => {
      setAppStateForTest('active');
    });
    await act(async () => {
      jest.advanceTimersByTime(699);
    });
    expect(world.settleCompletions).not.toContain(41);
    await act(async () => {
      jest.advanceTimersByTime(2);
    });
    expect(world.settleCompletions).toContain(41);
    await flushAsync();
  });

  // FALSIFIER: the resumed app does not act on a superseded episode's schedule.
  // RED if the arm stops cancelling (an OS timer outliving its episode) or if
  // schedule ids stop being validated on fire.
  it('a suspend → supersede → resume cycle completes only the LIVE episode’s token', async () => {
    const world = harness.world;
    await sendMotionCommand('middle', 51);
    await act(async () => {
      setAppStateForTest('background');
    });
    // The superseding command lands as the app comes back (a queued route
    // change replaying on resume is exactly the real-world shape).
    await sendMotionCommand('expanded', 52);
    await act(async () => {
      setAppStateForTest('active');
    });
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(world.settleCompletions).not.toContain(51);
    expect(world.settleCompletions).toContain(52);
    await flushAsync();
  });

  // FALSIFIER: THE BACKSTOP MAY NOT MANUFACTURE A FACT. RED if 'deadline-
  // expired' goes back to rest:true, or if the degrade stops barking.
  it('a released-without-a-settle episode is a DEGRADE: it barks, and no settle is claimed', async () => {
    const world = harness.world;
    const rests: boolean[] = [];
    const degrades: boolean[] = [];
    const unsubscribe = getTrackMotionAuthority().subscribe((transition) => {
      rests.push(transition.rest);
      degrades.push(transition.degraded);
    });
    await sendMotionCommand('middle', 61);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    unsubscribe();
    expect(degrades).toContain(true);
    expect(rests).not.toContain(true);
    expect(warnSpy.mock.calls.flat().join(' ')).toMatch(/WITHOUT a rest fact/);
    // Liveness is still honoured — the transition is released, never wedged.
    expect(world.settleCompletions).toContain(61);
    expect(world.surface.readyMarks).toContain('rt1');
    await flushAsync();
  });

  // FALSIFIER for the DELETED retry loop: the behaviour it claimed is covered
  // by an ENGINE FACT (trackDidSettle). Stop that fact arriving and this test
  // goes RED at the first assertion — which is the whole point of deleting a
  // timer in favour of a fact.
  it('a real settle fact — not a timer — is what completes a moving snap, and the command is issued ONCE', async () => {
    const world = harness.world;
    await sendMotionCommand('expanded', 71);
    const issued = world.nativeCalls.filter((call) => call.name === 'snapTo');
    expect(issued).toHaveLength(1);
    // 2.4s of what used to be the retry window: not one re-issue.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(world.nativeCalls.filter((call) => call.name === 'snapTo')).toHaveLength(1);
    expect(world.settleCompletions).not.toContain(71);
    // THE FACT arrives → the episode rests (and the backstop never fires).
    await settleAt(EXPANDED_TAU);
    expect(world.settleCompletions).toContain(71);
    expect(getTrackMotionAuthority().isAtRest()).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(warnSpy.mock.calls.flat().join(' ')).not.toMatch(/WITHOUT a rest fact/);
    await flushAsync();
  });

  // The finger outranks the clock: no wall-clock budget may bound a gesture.
  // RED if the drag conversion stops disarming the backstop.
  it('a command REFUSED by a live finger disarms the backstop — the drag is not on a deadline', async () => {
    const world = harness.world;
    world.nextSnapOutcome = () => ({ refused: true });
    await sendMotionCommand('expanded', 81);
    await flushAsync();
    expect(getTrackMotionAuthority().currentEpisode()?.kind).toBe('drag');
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    // Nothing completed on a timer; the drag's own settle fact does it.
    expect(world.settleCompletions).not.toContain(81);
    await settleAt(300);
    expect(world.settleCompletions).toContain(81);
    await flushAsync();
  });
});
