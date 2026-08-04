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
  planScenePrewarm,
  requestTrackScenePrewarm,
  subscribeTrackScenePrewarm,
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
