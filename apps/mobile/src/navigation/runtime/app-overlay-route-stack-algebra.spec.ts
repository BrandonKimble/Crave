import {
  areOverlayRoutesEqual,
  areRouteStateSnapshotsEqual,
  closeActiveRouteState,
  createRouteEntry,
  createRouteStateSnapshot,
  popToRootRouteState,
  pushRouteState,
  ROOT_SEARCH_ROUTE_ENTRY,
  setRootRouteState,
  updateRouteState,
  type RouteSceneSwitchRouteStateSnapshot,
} from './app-overlay-route-stack-algebra';

const bootState = (): RouteSceneSwitchRouteStateSnapshot =>
  createRouteStateSnapshot({
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
  });

describe('route stack algebra (entries-as-values)', () => {
  test('every constructed entry carries a unique entryId', () => {
    const a = createRouteEntry('pollDetail', { pollId: '1' } as never);
    const b = createRouteEntry('pollDetail', { pollId: '1' } as never);
    expect(a.entryId).toBeTruthy();
    expect(a.entryId).not.toBe(b.entryId);
  });

  test('push stacks a new entry and derives previous from the stack', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    expect(s1.overlayRouteStack.map((e) => e.key)).toEqual(['search', 'pollDetail']);
    expect(s1.activeOverlayRoute.key).toBe('pollDetail');
    expect(s1.previousOverlayRoute).toBe(s1.overlayRouteStack[0]);
    expect(s1.rootOverlayKey).toBe('search');
    expect(s1.overlayRouteStackLength).toBe(2);
  });

  test('same-key push REPLACES the top entry (documented pre-slice-4 behavior)', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    const s2 = pushRouteState(s1, 'pollDetail', { pollId: 'p2' } as never);
    expect(s2.overlayRouteStackLength).toBe(2);
    expect(s2.activeOverlayRoute.params).toEqual({ pollId: 'p2' });
    expect(s2.activeOverlayRoute.entryId).not.toBe(s1.activeOverlayRoute.entryId);
  });

  test('closeActive pops exactly one and reveals the entry VALUE beneath (same instance)', () => {
    const s1 = pushRouteState(bootState(), 'restaurant', { restaurantId: 'r1' } as never);
    const pushedRestaurant = s1.activeOverlayRoute;
    const s2 = pushRouteState(s1, 'pollDetail', { pollId: 'p1' } as never);
    const s3 = closeActiveRouteState(s2);
    expect(s3.activeOverlayRoute).toBe(pushedRestaurant);
    expect(s3.activeOverlayRoute.entryId).toBe(pushedRestaurant.entryId);
    expect(s3.overlayRouteStackLength).toBe(2);
    expect(s3.previousOverlayRoute).toBe(s3.overlayRouteStack[0]);
  });

  test('closeActive on a depth-1 stack is a no-op (same snapshot reference)', () => {
    const s = bootState();
    expect(closeActiveRouteState(s)).toBe(s);
  });

  test('popToRoot collapses to the root entry and derives previous = null (no stale field)', () => {
    const s1 = pushRouteState(bootState(), 'restaurant', { restaurantId: 'r1' } as never);
    const s2 = pushRouteState(s1, 'pollDetail', { pollId: 'p1' } as never);
    const s3 = popToRootRouteState(s2);
    expect(s3.overlayRouteStackLength).toBe(1);
    expect(s3.activeOverlayRoute).toBe(s2.overlayRouteStack[0]);
    expect(s3.previousOverlayRoute).toBeNull();
  });

  test('setRoot replaces the whole stack and derives previous = null', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    const s2 = setRootRouteState(s1, 'polls');
    expect(s2.overlayRouteStack.map((e) => e.key)).toEqual(['polls']);
    expect(s2.previousOverlayRoute).toBeNull();
    expect(s2.rootOverlayKey).toBe('polls');
  });

  test('updateRouteState preserves entry IDENTITY while swapping params', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    const before = s1.activeOverlayRoute;
    const s2 = updateRouteState(s1, 'pollDetail', { pollId: 'p2' } as never);
    expect(s2.activeOverlayRoute.entryId).toBe(before.entryId);
    expect(s2.activeOverlayRoute.params).toEqual({ pollId: 'p2' });
    expect(areOverlayRoutesEqual(before, s2.activeOverlayRoute)).toBe(false);
  });

  test('updateRouteState with an absent key returns the same snapshot reference', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    expect(updateRouteState(s1, 'restaurant', { restaurantId: 'r1' } as never)).toBe(s1);
  });

  test('equality is value identity: same entryId + same params value', () => {
    const entry = createRouteEntry('pollDetail', { pollId: 'p1' } as never);
    expect(areOverlayRoutesEqual(entry, entry)).toBe(true);
    const sameShapeDifferentInstance = createRouteEntry('pollDetail', entry.params as never);
    expect(areOverlayRoutesEqual(entry, sameShapeDifferentInstance)).toBe(false);
  });

  test('snapshot equality tracks entry identity across pops (regression guard for memoization)', () => {
    const s1 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    const s2 = closeActiveRouteState(pushRouteState(s1, 'restaurant', {} as never));
    // s2 is back to the same entries as s1 — snapshots must compare EQUAL so no phantom rerender
    expect(areRouteStateSnapshotsEqual(s1, s2)).toBe(true);
    // and a genuinely different instance compares unequal even with identical keys/params
    const s3 = pushRouteState(bootState(), 'pollDetail', { pollId: 'p1' } as never);
    expect(areRouteStateSnapshotsEqual(s1, s3)).toBe(false);
  });
});

describe('setRoot idempotence (session-teardown regression guard)', () => {
  test('re-rooting to the identical root (same key, same params value) is a no-op', () => {
    const s0 = bootState();
    const s1 = setRootRouteState(s0, 'search', undefined);
    expect(s1).toBe(s0);
    const s2 = setRootRouteState(s1, 'search', undefined);
    expect(s2).toBe(s1);
  });

  test('re-rooting with a different key still replaces', () => {
    const s0 = bootState();
    const s1 = setRootRouteState(s0, 'polls', undefined);
    expect(s1).not.toBe(s0);
    expect(s1.rootOverlayKey).toBe('polls');
  });
});
