import {
  RouteSceneSwitchSettleCallbackRegistry,
  type RouteSceneSwitchSettleVerdict,
} from './route-scene-switch-settle-registry';

/**
 * F1350 — the replayed supersede.
 *
 * RED RECIPE (both halves, verified by running them):
 *   - delete the `supersedeFor` drain (make it a no-op, or drop the call from the
 *     commit paths) → "fires the caller's continuation with a superseded verdict"
 *     goes RED (the continuation never runs).
 *   - restore the `Map<transitionToken, Set<cb>>` shape → "nothing accumulates
 *     across a replayed supersede" goes RED (one dead entry per superseded switch).
 */
describe('RouteSceneSwitchSettleCallbackRegistry', () => {
  const record = () => {
    const verdicts: RouteSceneSwitchSettleVerdict[] = [];
    return {
      verdicts,
      callback: (verdict: RouteSceneSwitchSettleVerdict) => verdicts.push(verdict),
    };
  };

  it('delivers the settled verdict when the switch reaches its settle boundary', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(1, callback);
    registry.flush(1);

    expect(verdicts).toEqual(['settled']);
    expect(registry.pendingTransitionToken).toBeNull();
  });

  it('fires the caller continuation with a superseded verdict when a newer switch commits', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(1, callback);
    // A newer switch commits before token 1 could settle.
    registry.supersedeFor(2);

    expect(verdicts).toEqual(['superseded']);
  });

  it('never settles a superseded continuation twice, even if the stale token flushes late', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(1, callback);
    registry.supersedeFor(2);
    registry.flush(1);

    expect(verdicts).toEqual(['superseded']);
  });

  it('holds at most one pending set — a replayed supersede accumulates nothing', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const verdicts: RouteSceneSwitchSettleVerdict[] = [];

    // 500 switches, each superseded before it settles: the exact shape that used to
    // grow one dead Set per switch for the process lifetime.
    for (let token = 1; token <= 500; token += 1) {
      registry.register(token, (verdict) => verdicts.push(verdict));
      registry.supersedeFor(token + 1);
      expect(registry.pendingCallbackCount).toBe(0);
      expect(registry.pendingTransitionToken).toBeNull();
    }

    expect(verdicts).toHaveLength(500);
    expect(verdicts.every((verdict) => verdict === 'superseded')).toBe(true);
  });

  it('supersedeFor is inert for the token already pending (a commit does not drain itself)', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(7, callback);
    registry.supersedeFor(7);

    expect(verdicts).toEqual([]);
    expect(registry.pendingTransitionToken).toBe(7);
  });

  it('collects several continuations under one token and settles them all', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const first = record();
    const second = record();

    registry.register(3, first.callback);
    registry.register(3, second.callback);
    expect(registry.pendingCallbackCount).toBe(2);
    registry.flush(3);

    expect(first.verdicts).toEqual(['settled']);
    expect(second.verdicts).toEqual(['settled']);
  });

  it('registering under a newer token supersedes the older waiter rather than overwriting it', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const older = record();
    const newer = record();

    registry.register(4, older.callback);
    registry.register(5, newer.callback);

    expect(older.verdicts).toEqual(['superseded']);
    expect(registry.pendingTransitionToken).toBe(5);

    registry.flush(5);
    expect(newer.verdicts).toEqual(['settled']);
  });

  it('abandon drops continuations without firing them (teardown, stated not implied)', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(9, callback);
    registry.abandon();

    expect(verdicts).toEqual([]);
    expect(registry.pendingTransitionToken).toBeNull();
  });

  it('flushing an unknown token is inert', () => {
    const registry = new RouteSceneSwitchSettleCallbackRegistry();
    const { verdicts, callback } = record();

    registry.register(1, callback);
    registry.flush(99);

    expect(verdicts).toEqual([]);
    expect(registry.pendingTransitionToken).toBe(1);
  });
});
