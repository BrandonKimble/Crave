// ─── FALSIFIERS: THE LIVENESS BACKSTOP (G-APPSTATE) ───────────────────────────
//
// Each block names the mutation that turns it RED (ledger in the task report).
// The three the row owes: a deadline armed for episode N cannot complete N+1;
// background time does not advance the deadline; a resumed app does not act on
// a superseded schedule.

import fs from 'fs';
import path from 'path';

import {
  initialMotionDeadlineState,
  motionDeadlineArmedEpisodeId,
  motionDeadlineRemainingMs,
  reduceMotionDeadline,
  RESUME_GRACE_MS,
  SETTLE_DEADLINE_MS,
  type MotionDeadlineEvent,
  type MotionDeadlineState,
  type MotionDeadlineTransition,
} from './track-motion-deadline';

const step = (state: MotionDeadlineState, event: MotionDeadlineEvent): MotionDeadlineTransition =>
  reduceMotionDeadline(state, event);

const arm = (episodeId: number, atMs: number): MotionDeadlineEvent => ({
  type: 'arm',
  episodeId,
  budgetMs: SETTLE_DEADLINE_MS,
  atMs,
});

const runTo = (events: MotionDeadlineEvent[], from = initialMotionDeadlineState) =>
  events.reduce((state, event) => reduceMotionDeadline(state, event).state, from);

describe('the backstop is EPISODE-SCOPED', () => {
  it('arming episode 2 cancels episode 1’s schedule — no OS timer outlives its episode', () => {
    const first = step(initialMotionDeadlineState, arm(1, 0));
    expect(first.effect).toEqual({ type: 'schedule', scheduleId: 1, delayMs: SETTLE_DEADLINE_MS });
    const second = step(first.state, arm(2, 10));
    expect(second.effect).toEqual({ type: 'schedule', scheduleId: 2, delayMs: SETTLE_DEADLINE_MS });
    expect(motionDeadlineArmedEpisodeId(second.state)).toBe(2);
    // FALSIFIER 1: episode 1's timer, if the OS still delivers it, names a dead
    // schedule and expires NOTHING. RED if the reducer stops stamping schedules.
    const staleFire = step(second.state, { type: 'timer-fired', scheduleId: 1, atMs: 710 });
    expect(staleFire.effect).toEqual({ type: 'none' });
    const liveFire = step(second.state, { type: 'timer-fired', scheduleId: 2, atMs: 720 });
    expect(liveFire.effect).toEqual({ type: 'expire', episodeId: 2 });
  });

  it('a stale disarm cannot cancel the live episode’s backstop', () => {
    const armed = runTo([arm(1, 0), arm(2, 5)]);
    const stale = step(armed, { type: 'disarm', episodeId: 1 });
    expect(stale.effect).toEqual({ type: 'none' });
    expect(motionDeadlineArmedEpisodeId(stale.state)).toBe(2);
    const live = step(armed, { type: 'disarm', episodeId: 2 });
    expect(live.effect).toEqual({ type: 'cancel' });
    expect(motionDeadlineArmedEpisodeId(live.state)).toBeNull();
  });
});

describe('BACKGROUND TIME DOES NOT ADVANCE THE DEADLINE', () => {
  it('suspending banks the foreground time spent and cancels the timer', () => {
    const armed = step(initialMotionDeadlineState, arm(1, 1_000)).state;
    const suspended = step(armed, { type: 'app-suspended', atMs: 1_200 });
    expect(suspended.effect).toEqual({ type: 'cancel' });
    // 200ms of the 700ms budget was spent IN THE FOREGROUND; the rest is intact.
    expect(motionDeadlineRemainingMs(suspended.state, 9_999_999)).toBe(SETTLE_DEADLINE_MS - 200);
  });

  // FALSIFIER 2: ten minutes in the background, and the deadline has not moved.
  // RED if 'app-suspended' stops stopping the clock (the reducer's whole point).
  it('ten minutes suspended leaves the deadline unfired and un-advanced', () => {
    let state = step(initialMotionDeadlineState, arm(1, 0)).state;
    state = step(state, { type: 'app-suspended', atMs: 100 }).state;
    // Whatever the OS does with a frozen runloop, a late fire is rejected.
    const lateFire = step(state, { type: 'timer-fired', scheduleId: 1, atMs: 600_000 });
    expect(lateFire.effect).toEqual({ type: 'none' });
    expect(motionDeadlineArmedEpisodeId(state)).toBe(1);
    // Resuming re-schedules a FRESH budget (the engine's spring restarts too) —
    // not the 0ms an elapsed-wall-clock deadline would have computed.
    const resumed = step(state, { type: 'app-resumed', atMs: 600_000 });
    // (the suspend itself retired schedule 1 by minting a fresh id)
    expect(resumed.effect).toEqual({ type: 'schedule', scheduleId: 3, delayMs: RESUME_GRACE_MS });
  });

  it('arming while suspended schedules nothing until the app is back', () => {
    const suspended = step(initialMotionDeadlineState, {
      type: 'app-suspended',
      atMs: 0,
    }).state;
    const armed = step(suspended, arm(7, 10));
    expect(armed.effect).toEqual({ type: 'cancel' });
    const resumed = step(armed.state, { type: 'app-resumed', atMs: 50 });
    expect(resumed.effect).toMatchObject({ type: 'schedule', delayMs: RESUME_GRACE_MS });
    expect(motionDeadlineArmedEpisodeId(resumed.state)).toBe(7);
  });
});

describe('A RESUMED APP DOES NOT ACT ON A SUPERSEDED SCHEDULE', () => {
  // FALSIFIER 3: the resume stampede. Episode 1 is armed, the app suspends, the
  // episode is superseded by 2 while the runloop is frozen, and on resume the
  // OS delivers episode 1's timer. Nothing may expire for 1, and the live
  // episode's own schedule must be the only one that can.
  it('a suspend/supersede/resume cycle expires only the LIVE episode', () => {
    let state = step(initialMotionDeadlineState, arm(1, 0)).state;
    state = step(state, { type: 'app-suspended', atMs: 100 }).state;
    state = step(state, arm(2, 120)).state; // superseded while frozen
    const resumed = step(state, { type: 'app-resumed', atMs: 60_000 });
    state = resumed.state;
    expect(resumed.effect.type).toBe('schedule');
    const liveScheduleId = resumed.effect.type === 'schedule' ? resumed.effect.scheduleId : -1;
    // Every schedule id minted before the live one is dead on arrival.
    for (const scheduleId of [1, 2, 3].filter((id) => id !== liveScheduleId)) {
      expect(step(state, { type: 'timer-fired', scheduleId, atMs: 60_700 }).effect).toEqual({
        type: 'none',
      });
    }
    expect(step(state, { type: 'timer-fired', scheduleId: liveScheduleId, atMs: 60_700 }).effect) //
      .toEqual({ type: 'expire', episodeId: 2 });
  });

  it('a timer that fires while suspended is ignored outright', () => {
    const state = runTo([arm(1, 0), { type: 'app-suspended', atMs: 10 }]);
    expect(step(state, { type: 'timer-fired', scheduleId: 1, atMs: 20 }).effect).toEqual({
      type: 'none',
    });
  });
});

describe('the backstop’s shape (what a timer is FOR)', () => {
  it('expiry clears the arm — a backstop fires at most once per episode', () => {
    const armed = step(initialMotionDeadlineState, arm(1, 0)).state;
    const fired = step(armed, { type: 'timer-fired', scheduleId: 1, atMs: 700 });
    expect(fired.effect).toEqual({ type: 'expire', episodeId: 1 });
    expect(motionDeadlineArmedEpisodeId(fired.state)).toBeNull();
    expect(step(fired.state, { type: 'timer-fired', scheduleId: 1, atMs: 900 }).effect).toEqual({
      type: 'none',
    });
  });

  it('is RN-free — the decisions stay falsifiable without a renderer', () => {
    const code = fs
      .readFileSync(path.join(__dirname, 'track-motion-deadline.ts'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/from 'react/);
    expect(code).not.toMatch(/setTimeout|AppState|Date\.now/);
  });
});
