// ─── FALSIFIERS: THE MOTION AUTHORITY (deep red team round 2, item 1) ─────────
//
// These replace track-sheet-fence.spec.ts (the fence's pure half was the
// authority's type signature; the module was folded in). Each block names the
// mutation that turns it RED — see the ledger in the task report.

import fs from 'fs';
import path from 'path';

import {
  getTrackMotionAuthority,
  initialTrackMotionState,
  reduceTrackMotion,
  resetTrackMotionAuthorityForTest,
  trackMotionStateInFlightSnapTarget,
  trackMotionStateIsAtRest,
  type TrackMotionEvent,
  type TrackMotionState,
} from './track-motion-authority';

const run = (events: TrackMotionEvent[], from: TrackMotionState = initialTrackMotionState) =>
  events.reduce((state, event) => reduceTrackMotion(state, event).state, from);

const command = (
  snapTo: 'expanded' | 'middle' | 'collapsed' | 'hidden',
  settleToken: number | null = null,
  willMove = true
): TrackMotionEvent => ({ type: 'command-issued', willMove, snapTo, settleToken, atMs: 0 });

describe('the authority is TOTAL over "at rest" (the one definition)', () => {
  it('nothing in flight → at rest (the "redraw arms at rest → ready immediately" case)', () => {
    expect(trackMotionStateIsAtRest(initialTrackMotionState)).toBe(true);
  });

  it('a live drag holds it (the finger owns τ)', () => {
    expect(trackMotionStateIsAtRest(run([{ type: 'drag-begin', atMs: 0 }]))).toBe(false);
  });

  it('a commanded flight holds it', () => {
    expect(trackMotionStateIsAtRest(run([command('middle')]))).toBe(false);
  });

  it('a commanded flight WITHOUT a settle token still holds it', () => {
    expect(trackMotionStateIsAtRest(run([command('expanded', null)]))).toBe(false);
  });

  it('a hidden excursion holds it (its flight records no detent target by design)', () => {
    const state = run([command('hidden', 7)]);
    expect(trackMotionStateIsAtRest(state)).toBe(false);
    expect(trackMotionStateInFlightSnapTarget(state)).toBeNull();
  });

  it('a ZERO-MOVE command is not motion (no settle fact will ever arrive for it)', () => {
    expect(trackMotionStateIsAtRest(run([command('collapsed', 3, false)]))).toBe(true);
  });

  it('every rest fact releases it: settle', () => {
    expect(trackMotionStateIsAtRest(run([command('middle', 1), { type: 'settle' }]))).toBe(true);
  });

  // G-APPSTATE REDERIVATION: the backstop RELEASES, it does not attest. RED if
  // 'deadline-expired' ever goes back to rest:true (a timer manufacturing the
  // one fact only the engine can state).
  it('the liveness backstop DEGRADES the episode — it never manufactures a rest fact', () => {
    const started = reduceTrackMotion(initialTrackMotionState, command('middle', 1));
    const episodeId = started.started!.episodeId;
    const ended = reduceTrackMotion(started.state, { type: 'deadline-expired', episodeId });
    expect(ended.rest).toBe(false);
    expect(ended.degraded).toBe(true);
    expect(ended.ended?.settleToken).toBe(1);
    // The episode is over either way: nothing may hang on a fact that is not coming.
    expect(trackMotionStateIsAtRest(ended.state)).toBe(true);
  });

  it('a real rest fact is never marked degraded (settle / screen edge)', () => {
    const settled = reduceTrackMotion(
      reduceTrackMotion(initialTrackMotionState, command('middle', 1)).state,
      { type: 'settle' }
    );
    expect(settled.rest).toBe(true);
    expect(settled.degraded).toBe(false);
  });

  it('every rest fact releases it: the generation-matched screen edge (a hide has no detent rest)', () => {
    const started = reduceTrackMotion(initialTrackMotionState, command('hidden', 9));
    const episodeId = started.started!.episodeId;
    const armed = reduceTrackMotion(started.state, {
      type: 'excursion-armed',
      episodeId,
      generation: 4,
    });
    const edge = reduceTrackMotion(armed.state, { type: 'excursion-edge', generation: 4 });
    expect(edge.hiddenEdge).toBe(true);
    expect(edge.rest).toBe(true);
    expect(edge.ended?.settleToken).toBe(9);
    expect(trackMotionStateIsAtRest(edge.state)).toBe(true);
  });
});

// EPISODE IDENTITY: consumers match events to episodes instead of trusting
// arrival order. Mutation: drop the episodeId comparison in any of the three
// arms below and the matching test fails.
describe('episode identity rejects stale facts', () => {
  it('a mismatched excursion generation is never a boundary and never a settle', () => {
    const started = reduceTrackMotion(initialTrackMotionState, command('hidden', 9));
    const episodeId = started.started!.episodeId;
    const armed = reduceTrackMotion(started.state, {
      type: 'excursion-armed',
      episodeId,
      generation: 4,
    });
    const stale = reduceTrackMotion(armed.state, { type: 'excursion-edge', generation: 3 });
    expect(stale.accepted).toBe(false);
    expect(stale.hiddenEdge).toBe(false);
    expect(stale.rest).toBe(false);
    expect(trackMotionStateIsAtRest(stale.state)).toBe(false);
  });

  it('an UNSTAMPED edge, and an edge with nothing armed, are both stale', () => {
    const armedState = run([command('hidden', 9)]);
    expect(
      reduceTrackMotion(armedState, { type: 'excursion-edge', generation: null }).accepted
    ).toBe(false);
    expect(
      reduceTrackMotion(initialTrackMotionState, { type: 'excursion-edge', generation: 1 }).accepted
    ).toBe(false);
  });

  it('a SUPERSEDED command’s late native outcome arms nothing', () => {
    const first = reduceTrackMotion(initialTrackMotionState, command('hidden', 1));
    const staleEpisodeId = first.started!.episodeId;
    const second = reduceTrackMotion(first.state, command('hidden', 2));
    expect(second.ended?.episodeId).toBe(staleEpisodeId);
    // ...and it ended WITHOUT rest: a supersession is not a rest fact, so the
    // abandoned token must not be completed.
    expect(second.rest).toBe(false);
    const lateArm = reduceTrackMotion(second.state, {
      type: 'excursion-armed',
      episodeId: staleEpisodeId,
      generation: 12,
    });
    expect(lateArm.accepted).toBe(false);
    expect(
      reduceTrackMotion(lateArm.state, { type: 'excursion-edge', generation: 12 }).accepted
    ).toBe(false);
  });

  it('a deadline can only end the episode that armed it', () => {
    const first = reduceTrackMotion(initialTrackMotionState, command('middle', 1));
    const staleEpisodeId = first.started!.episodeId;
    const second = reduceTrackMotion(first.state, command('expanded', 2));
    const lateDeadline = reduceTrackMotion(second.state, {
      type: 'deadline-expired',
      episodeId: staleEpisodeId,
    });
    expect(lateDeadline.accepted).toBe(false);
    expect(lateDeadline.rest).toBe(false);
    expect(lateDeadline.degraded).toBe(false);
    expect(trackMotionStateIsAtRest(lateDeadline.state)).toBe(false);
  });

  it('a non-hidden command supersedes an armed excursion (its edge is stale from here on)', () => {
    const started = reduceTrackMotion(initialTrackMotionState, command('hidden', 1));
    const armed = reduceTrackMotion(started.state, {
      type: 'excursion-armed',
      episodeId: started.started!.episodeId,
      generation: 5,
    });
    const superseding = reduceTrackMotion(armed.state, command('middle', 2));
    expect(
      reduceTrackMotion(superseding.state, { type: 'excursion-edge', generation: 5 }).accepted
    ).toBe(false);
  });

  it('an expired hide still recognises ITS OWN edge as a boundary — but not as rest', () => {
    // The deferred swap is a PAINT decision: a hide whose settle deadline
    // expired must still commit at the screen edge.
    const started = reduceTrackMotion(initialTrackMotionState, command('hidden', 9));
    const episodeId = started.started!.episodeId;
    const armed = reduceTrackMotion(started.state, {
      type: 'excursion-armed',
      episodeId,
      generation: 4,
    });
    const expired = reduceTrackMotion(armed.state, { type: 'deadline-expired', episodeId });
    const edge = reduceTrackMotion(expired.state, { type: 'excursion-edge', generation: 4 });
    expect(edge.hiddenEdge).toBe(true);
    expect(edge.rest).toBe(false);
  });
});

// G-INTERRUPT / A5: policy reads resolve against the SPRING TARGET.
describe('the in-flight snap target is the authority’s, not a private ref', () => {
  it('a flight publishes its destination', () => {
    expect(trackMotionStateInFlightSnapTarget(run([command('expanded')]))).toBe('expanded');
  });

  it('THE FINGER OWNS TAU: a drag landing mid-flight kills the machine target', () => {
    const state = run([command('expanded', 5), { type: 'drag-begin', atMs: 0 }]);
    expect(trackMotionStateInFlightSnapTarget(state)).toBeNull();
    // ...but the sheet is still MOVING, and the token is still owed.
    expect(trackMotionStateIsAtRest(state)).toBe(false);
    const settled = reduceTrackMotion(state, { type: 'settle' });
    expect(settled.ended?.settleToken).toBe(5);
  });

  it('a native REFUSAL kills the machine target the same way (it lost to a drag)', () => {
    const started = reduceTrackMotion(initialTrackMotionState, command('expanded', 6));
    const refused = reduceTrackMotion(started.state, {
      type: 'command-refused',
      episodeId: started.started!.episodeId,
    });
    expect(trackMotionStateInFlightSnapTarget(refused.state)).toBeNull();
    expect(trackMotionStateIsAtRest(refused.state)).toBe(false);
    expect(refused.rest).toBe(false);
    expect(reduceTrackMotion(refused.state, { type: 'settle' }).ended?.settleToken).toBe(6);
  });

  it('a stale refusal (superseded command) changes nothing', () => {
    const first = reduceTrackMotion(initialTrackMotionState, command('middle', 1));
    const second = reduceTrackMotion(first.state, command('expanded', 2));
    const stale = reduceTrackMotion(second.state, {
      type: 'command-refused',
      episodeId: first.started!.episodeId,
    });
    expect(stale.accepted).toBe(false);
    expect(trackMotionStateInFlightSnapTarget(stale.state)).toBe('expanded');
  });
});

describe('the store: one queryable authority, subscribable by anyone', () => {
  beforeEach(() => resetTrackMotionAuthorityForTest());
  afterEach(() => resetTrackMotionAuthorityForTest());

  it('a consumer BORN MID-FLIGHT can ask (this is F2’s closure mechanism)', () => {
    const authority = getTrackMotionAuthority();
    expect(authority.isAtRest()).toBe(true);
    authority.dispatch({ type: 'drag-begin', atMs: 0 });
    // A brand-new consumer, holding no refs and no subscriptions, asks:
    expect(getTrackMotionAuthority().isAtRest()).toBe(false);
    expect(getTrackMotionAuthority().episodeId()).not.toBeNull();
    authority.dispatch({ type: 'settle' });
    expect(getTrackMotionAuthority().isAtRest()).toBe(true);
  });

  it('only VALIDATED edges reach the hidden-edge bus (the two subscriptions collapsed onto it)', () => {
    const authority = getTrackMotionAuthority();
    const edges: number[] = [];
    const unsubscribeA = authority.subscribeHiddenEdge(() => edges.push(1));
    const unsubscribeB = authority.subscribeHiddenEdge(() => edges.push(2));
    authority.dispatch({ type: 'excursion-edge', generation: 99 }); // nothing armed
    expect(edges).toEqual([]);
    authority.dispatch({
      type: 'command-issued',
      willMove: true,
      snapTo: 'hidden',
      settleToken: 4,
      atMs: 0,
    });
    const episodeId = authority.episodeId()!;
    authority.dispatch({ type: 'excursion-armed', episodeId, generation: 8 });
    authority.dispatch({ type: 'excursion-edge', generation: 7 }); // stale stamp
    expect(edges).toEqual([]);
    authority.dispatch({ type: 'excursion-edge', generation: 8 });
    // BOTH consumers of the one emission, fanned out by the authority.
    expect(edges).toEqual([1, 2]);
    unsubscribeA();
    unsubscribeB();
  });

  it('subscribers see accepted transitions only', () => {
    const authority = getTrackMotionAuthority();
    const rests: boolean[] = [];
    const unsubscribe = authority.subscribe((transition) => rests.push(transition.rest));
    authority.dispatch({ type: 'deadline-expired', episodeId: 999 }); // stale, no episode
    expect(rests).toEqual([]);
    authority.dispatch({ type: 'settle' });
    expect(rests).toEqual([true]);
    unsubscribe();
  });
});

// ─── AT-REST AGREEMENT: one source, structurally ──────────────────────────────
// The red team counted FOUR independent encodings of "at rest" (the fence's
// four host refs, the interrupt's posture classification, the JS settle
// sampler, native inMotion). The JS side now has exactly ONE: this module. This
// scanner goes RED the moment a consumer re-grows a private ledger.
describe('at-rest agreement (no consumer shadows the authority)', () => {
  const read = (relative: string) => fs.readFileSync(path.join(__dirname, relative), 'utf8');
  /** CODE only — the prose that RECORDS a deleted ref is the receipt, not a
   *  relapse (a scanner that cannot tell them apart forbids its own history). */
  const readCode = (relative: string) =>
    read(relative)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');

  // RE-HOMED with the host extractions (2026-08-05): the motion wiring left the
  // .tsx for use-track-motion-controller.ts. A scanner still pointed at the old
  // file would be vacuously green, so it follows the code — and now covers BOTH
  // the orchestrator and the controller, which is strictly stronger.
  const MOTION_HOST_FILES = ['TrackSheetRouteHost.tsx', 'use-track-motion-controller.ts'];

  it('no track file keeps private motion refs — they read the authority', () => {
    for (const file of MOTION_HOST_FILES) {
      const source = readCode(file);
      expect(source).not.toMatch(/inFlightSnapTargetRef/);
      expect(source).not.toMatch(/pendingSettleTokenRef/);
      expect(source).not.toMatch(/hiddenExcursionInFlightRef/);
      expect(source).not.toMatch(/armedHiddenExcursionGeneration/);
    }
    expect(readCode('use-track-motion-controller.ts')).toMatch(/getTrackMotionAuthority\(\)/);
  });

  it('exactly ONE native subscription to the hidden-edge fact exists on the track', () => {
    const subscriptions = fs
      .readdirSync(__dirname)
      .filter((name) => /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name))
      .flatMap((name) => read(name).match(/addListener\(\s*\n?\s*'trackHiddenEdgeCleared'/g) ?? []);
    expect(subscriptions).toHaveLength(1);
  });

  it('the reveal seed consults the authority (F2)', () => {
    const surface = read('../screens/Search/runtime/surface/search-surface-runtime.ts');
    expect(surface).toMatch(/getTrackMotionAuthority\(\)\.isAtRest\(\)/);
  });
});

// ─── THE RETRY LOOP IS DELETED (G-APPSTATE rederivation) ─────────────────────
// resolveSnapRetryDecision's suite lived here. The loop it governed is gone —
// snapTo resolves, so a refusal and the engine's own target are FACTS, and
// arrival is trackDidSettle's to state. This scanner is what keeps it gone: a
// re-issuing snap loop is a stale command generator, and a suspended app is
// exactly where it fires into a world that moved on.
describe('no snap command is ever re-issued on a timer', () => {
  it('the page issues its snap once — no retry timer, no attempt budget', () => {
    const page = fs.readFileSync(path.join(__dirname, 'TrackSheetPage.tsx'), 'utf8');
    const code = page
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/pendingSnapTimer|snapLoopIdRef|resolveSnapRetryDecision/);
    // The one issue site per command: exactly one snapTo and one snapToHidden call.
    expect(code.match(/nativePhysics\?\.snapTo\?\./g) ?? []).toHaveLength(1);
    expect(code.match(/nativePhysics\?\.snapToHidden\?\./g) ?? []).toHaveLength(1);
  });
});
