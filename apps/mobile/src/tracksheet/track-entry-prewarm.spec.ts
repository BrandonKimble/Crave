// G-PREWARM falsifiers (R3) — against the exact modules the host executes.
//
// RED conditions (each proven by mutation before landing):
//   (a) prewarm mounting a NON-resident leg (child scenes have no pre-push
//       entryId; warming them would fabricate an identity) → the decision test
//       fails if planScenePrewarm returns mountResidentLeg for a non-resident.
//   (b) prewarm re-mounting an already-visited resident (wasted commit on
//       every press-down) → fails if alreadyVisited does not gate to 'none'.
//   (c) a held press queueing the same scene twice (double prewarm commit) →
//       the dedupe test fails if request() notifies twice for one scene.
//   (d) requests surviving consumption (a stale prewarm re-firing on every
//       later subscribe tick) → the drain test fails if consume() does not
//       clear the queue.

import {
  consumeTrackScenePrewarmRequests,
  formatTrackPressSpan,
  markTrackNavPress,
  noteTrackPressFirstPaint,
  noteTrackPressRealRows,
  peekTrackPressSpan,
  planScenePrewarm,
  requestTrackScenePrewarm,
  resetTrackPressSpan,
  subscribeTrackScenePrewarm,
  TRACK_PRESS_SPAN_TTL_MS,
  TrackScenePrewarmSignal,
} from './track-entry-prewarm';

describe('planScenePrewarm (the pure decision)', () => {
  it('mounts the resident leg for a cold resident scene', () => {
    expect(planScenePrewarm({ isResidentScene: true, alreadyVisited: false })).toEqual({
      kind: 'mountResidentLeg',
    });
  });

  it('is a no-op for an already-visited resident (already warm)', () => {
    expect(planScenePrewarm({ isResidentScene: true, alreadyVisited: true })).toEqual({
      kind: 'none',
    });
  });

  it('is a no-op for non-resident scenes (no pre-push identity to warm)', () => {
    expect(planScenePrewarm({ isResidentScene: false, alreadyVisited: false })).toEqual({
      kind: 'none',
    });
    expect(planScenePrewarm({ isResidentScene: false, alreadyVisited: true })).toEqual({
      kind: 'none',
    });
  });
});

describe('TrackScenePrewarmSignal', () => {
  it('notifies subscribers once per distinct scene and dedupes a held press', () => {
    const sig = new TrackScenePrewarmSignal();
    let ticks = 0;
    sig.subscribe(() => {
      ticks += 1;
    });
    sig.request('polls');
    sig.request('polls');
    sig.request('polls');
    expect(ticks).toBe(1);
    expect(sig.consume()).toEqual(['polls']);
  });

  it('drains on consume — a consumed request never re-fires', () => {
    const sig = new TrackScenePrewarmSignal();
    sig.request('home');
    expect(sig.consume()).toEqual(['home']);
    expect(sig.consume()).toEqual([]);
    expect(sig.pendingCount).toBe(0);
  });

  it('a scene may be requested again AFTER consumption (next cold press)', () => {
    const sig = new TrackScenePrewarmSignal();
    sig.request('home');
    sig.consume();
    let ticks = 0;
    sig.subscribe(() => {
      ticks += 1;
    });
    sig.request('home');
    expect(ticks).toBe(1);
    expect(sig.consume()).toEqual(['home']);
  });

  it('unsubscribe stops notifications', () => {
    const sig = new TrackScenePrewarmSignal();
    let ticks = 0;
    const unsubscribe = sig.subscribe(() => {
      ticks += 1;
    });
    unsubscribe();
    sig.request('lists');
    expect(ticks).toBe(0);
  });
});

describe('the module singleton (trigger and consumer live in different trees)', () => {
  it('routes a request through subscribe/consume', () => {
    let ticks = 0;
    const unsubscribe = subscribeTrackScenePrewarm(() => {
      ticks += 1;
    });
    requestTrackScenePrewarm('profile');
    expect(ticks).toBe(1);
    expect(consumeTrackScenePrewarmRequests()).toEqual(['profile']);
    unsubscribe();
  });
});

// ─── THE PRESS SPAN (touch-latency instrument, audit defect 2) ────────────────
//
// RED-PROVEN by mutation (executed 2026-08-05, one change per run — counts are
// what the runs printed):
//   P1 noteTrackPressFirstPaint made consuming (pendingPress = null) again
//        -> 2 RED (the span closes on the skeleton; press->real-rows vanishes)
//   P2 noteTrackPressRealRows's `firstPaintMs == null` guard removed
//        -> 1 RED (a real-rows paint with no flip reports a one-mark span)
//   P3 dropIfStale's body removed (the expiry deleted)
//        -> 1 RED (an unconsumed stamp reports a fabricated 9s latency)
//   P4 the sceneKey match removed
//        -> 1 RED (an unrelated scene's paint claims another scene's press)

describe('the press span — ONE anchor, TWO marks, ONE line', () => {
  beforeEach(() => {
    resetTrackPressSpan();
  });

  it('THE SKELETON IS A PHASE, NOT THE RESULT: a deferred flip marks first-paint and the span stays OPEN until real rows land — one report carrying both numbers', () => {
    markTrackNavPress('polls', 1000);
    // The handoff frame: something painted, but not the destination's rows.
    expect(noteTrackPressFirstPaint('polls', 'polls#root', 1120, false)).toBe(120);
    // …and the span is NOT closed by it.
    expect(peekTrackPressSpan()).not.toBeNull();
    const report = noteTrackPressRealRows('polls', 'polls#root', 1260);
    expect(report).toEqual({
      entryKey: 'polls#root',
      pressToFirstPaintMs: 120,
      pressToRealRowsMs: 260,
      firstPaintHadRealRows: false,
    });
    // BOTH numbers in ONE line, off the SAME anchor.
    expect(formatTrackPressSpan(report!)).toBe(
      '[PERF] press polls#root press->first-paint=120ms press->real-rows=260ms ' +
        'first-paint-real-rows=false deferred=true'
    );
  });

  it('CANNOT GO GREEN ON A SKELETON: a fast deferred frame does not move press->real-rows — the two numbers diverge, and only the second one is the span the finger feels', () => {
    markTrackNavPress('polls', 0);
    noteTrackPressFirstPaint('polls', 'polls#root', 8, false);
    const report = noteTrackPressRealRows('polls', 'polls#root', 300)!;
    expect(report.pressToFirstPaintMs).toBe(8);
    // The rung's number. An 8ms skeleton did not make it 8ms.
    expect(report.pressToRealRowsMs).toBe(300);
  });

  it('a DIRECT flip reports both marks off the one press, and says so', () => {
    markTrackNavPress('home', 500);
    noteTrackPressFirstPaint('home', 'home#root', 540, true);
    const report = noteTrackPressRealRows('home', 'home#root', 540)!;
    expect(report.firstPaintHadRealRows).toBe(true);
    expect(formatTrackPressSpan(report)).toContain('deferred=false');
  });

  it('AN UNCONSUMED STAMP CANNOT REPORT A STALE LATENCY: a press that lands nowhere expires, so a later unrelated paint of that scene reports nothing at all', () => {
    markTrackNavPress('polls', 0);
    // …the switch never happened. Minutes later, polls paints for its own reason.
    const stale = TRACK_PRESS_SPAN_TTL_MS + 1;
    expect(noteTrackPressFirstPaint('polls', 'polls#root', stale, true)).toBeNull();
    expect(noteTrackPressRealRows('polls', 'polls#root', stale)).toBeNull();
    expect(peekTrackPressSpan()).toBeNull();
  });

  it('a paint that did not come from a press reports nothing — no stamp, no number (the probe never invents an anchor)', () => {
    expect(noteTrackPressFirstPaint('polls', 'polls#root', 100, true)).toBeNull();
    expect(noteTrackPressRealRows('polls', 'polls#root', 100)).toBeNull();
  });

  it('a press for one scene is not claimed by another scene s paint', () => {
    markTrackNavPress('polls', 0);
    expect(noteTrackPressFirstPaint('home', 'home#root', 50, true)).toBeNull();
    expect(noteTrackPressRealRows('home', 'home#root', 50)).toBeNull();
  });

  it('real rows with no flip mark reports nothing — a span needs both marks, or it is not the span', () => {
    markTrackNavPress('polls', 0);
    expect(noteTrackPressRealRows('polls', 'polls#root', 50)).toBeNull();
  });

  it('a second press REPLACES an unlanded first: the next paint measures from the press that caused it, never from an older one', () => {
    markTrackNavPress('polls', 0);
    markTrackNavPress('polls', 100);
    noteTrackPressFirstPaint('polls', 'polls#root', 150, true);
    expect(noteTrackPressRealRows('polls', 'polls#root', 150)!.pressToRealRowsMs).toBe(50);
  });
});
