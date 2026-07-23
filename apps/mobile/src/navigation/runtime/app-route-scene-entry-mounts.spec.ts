/**
 * W1 slice 1 — the ENTRY-MOUNT contract (plans/w1-listdetail-structural-spec.md §A.1 C1).
 *
 * Written TESTS-FIRST against the entry-mount reducer the scene-stack runtime consumes.
 * RED baseline (recorded before implementation): this module did not exist — today's
 * runtime mounts ONE body per scene KEY (resolveMountedSceneKeys / sceneEntryByKey are
 * Map<OverlayKey, …>), so per-entry units, depth-K eviction and outgoing-entry retention
 * had no home. These specs pin the contract:
 *   (a) child scenes mount per key#entryId
 *   (b) two entries of one key = two mounted units
 *   (c) the popped entry stays mounted only while the frame's outgoingEntryId names it
 *   (d) root/topLevel scenes stay singleton-per-key (resolver returns null → legacy path)
 *   (e) depth-K=3 eviction: entries deeper than 3 below the top unmount, entry data kept
 *       (remount on pop-return with the same entryId)
 */
import {
  APP_OVERLAY_ROUTE_METADATA_BY_KEY,
  type OverlayKey,
  type OverlayRouteEntry,
} from './app-overlay-route-types';
import { createRouteEntry } from './app-overlay-route-stack-algebra';
import {
  EMPTY_PRESENTATION_FRAME,
  arePresentationFramesEqual,
  resolveSupersededOutgoingEntryId,
} from './app-route-presentation-frame-contract';
import {
  SCENE_ENTRY_MOUNT_DEPTH_LIMIT,
  areSceneEntryMountUnitArraysEqual,
  createSceneEntryMountUnitKey,
  isEntryKeyedMountSceneKey,
  resolveActiveEntryIdForScene,
  resolveMountedSceneEntryUnits,
} from './app-route-scene-entry-mounts';

const entry = <K extends OverlayKey>(key: K, params?: unknown): OverlayRouteEntry =>
  createRouteEntry(key, params as never) as OverlayRouteEntry;

// L3 note: the LEGACY entry-keyed contract below now applies to UNMANAGED child
// scenes (residency-managed ones use identity-keyed resident units — their own
// tests). Fixtures use the still-unmanaged children: pollDetail + restaurant.
const drillStack = () => {
  const root = entry('search');
  const userA = entry('pollDetail', { pollId: 'p-a' });
  const follow = entry('restaurant', { restaurantId: 'r-a' });
  const userB = entry('pollDetail', { pollId: 'p-b' });
  return { root, userA, follow, userB, stack: [root, userA, follow, userB] };
};

describe('entry-keyed mounts (W1 slice 1 contract)', () => {
  test('(d) the entry-keyed set is exactly the child-role scenes — derived from metadata', () => {
    (Object.keys(APP_OVERLAY_ROUTE_METADATA_BY_KEY) as OverlayKey[]).forEach((key) => {
      expect(isEntryKeyedMountSceneKey(key)).toBe(
        APP_OVERLAY_ROUTE_METADATA_BY_KEY[key].role === 'child'
      );
    });
  });

  test('(d) root/topLevel/shell scenes resolve NULL units (singleton-per-key legacy path)', () => {
    const { stack } = drillStack();
    (['search', 'polls', 'bookmarks', 'profile', 'sheetHost'] as const).forEach((key) => {
      expect(
        resolveMountedSceneEntryUnits({
          sceneKey: key,
          overlayRouteStack: stack,
          outgoingEntryId: null,
          previousUnits: null,
        })
      ).toBeNull();
    });
  });

  test('L3 residency: a managed scene\'s LAST unit survives its entry popping (resident, not remounted)', () => {
    const root = entry('search');
    const notif = entry('notifications');
    const withNotif = [root, notif];
    const unitsWhileStacked = resolveMountedSceneEntryUnits({
      sceneKey: 'notifications',
      overlayRouteStack: withNotif,
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(unitsWhileStacked).toHaveLength(1);
    // The entry pops (and the settle window has passed — no outgoingEntryId): the
    // unit SURVIVES, same object (never rebuilt) — the shell is resident and only
    // visibility changes at dismissal (ShellVisibilityBoundary owns display).
    const unitsAfterPop = resolveMountedSceneEntryUnits({
      sceneKey: 'notifications',
      overlayRouteStack: [root],
      outgoingEntryId: null,
      previousUnits: unitsWhileStacked,
    });
    expect(unitsAfterPop).toHaveLength(1);
    expect(unitsAfterPop?.[0]).toBe(unitsWhileStacked?.[0]);
    // An UNMANAGED child scene's units still drop after its entry pops (legacy law).
    const user = entry('pollDetail', { pollId: 'p-a' });
    const userUnits = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: [root, user],
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(
      resolveMountedSceneEntryUnits({
        sceneKey: 'pollDetail',
        overlayRouteStack: [root],
        outgoingEntryId: null,
        previousUnits: userUnits,
      })
    ).toHaveLength(0);
  });

  test('L3 residency: listDetail resident units are IDENTITY-keyed — same list re-push reuses the unitKey; popped lists retain up to the limit', () => {
    const root = entry('search');
    const listA1 = entry('listDetail', { listDetail: { listId: 'list-a' } });
    const unitsA = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: [root, listA1],
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(unitsA).toHaveLength(1);
    expect(unitsA?.[0].unitKey).toBe('resident:listDetail:list:list-a:self');
    // Pop, then RE-PUSH the same list with a NEW entryId: SAME unitKey (the resident
    // tree survives — React key stability), entry updated in place.
    const poppedUnits = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: [root],
      outgoingEntryId: null,
      previousUnits: unitsA,
    });
    expect(poppedUnits).toHaveLength(1);
    expect(poppedUnits?.[0]).toBe(unitsA?.[0]);
    const listA2 = entry('listDetail', { listDetail: { listId: 'list-a' } });
    const repushedUnits = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: [root, listA2],
      outgoingEntryId: null,
      previousUnits: poppedUnits,
    });
    expect(repushedUnits).toHaveLength(1);
    expect(repushedUnits?.[0].unitKey).toBe('resident:listDetail:list:list-a:self');
    expect(repushedUnits?.[0].entryId).toBe(listA2.entryId);
    // Different lists = different units; the retention cap drops the OLDEST beyond N.
    let previous = repushedUnits;
    const pushedIds = ['list-b', 'list-c', 'list-d', 'list-e'];
    pushedIds.forEach((listId) => {
      const pushed = entry('listDetail', { listDetail: { listId } });
      previous = resolveMountedSceneEntryUnits({
        sceneKey: 'listDetail',
        overlayRouteStack: [root, pushed],
        outgoingEntryId: null,
        previousUnits: previous,
      });
    });
    // Live: list-e; retained: the LIMIT most-recent popped (d, c, b) — list-a evicted.
    expect(previous?.map((unit) => unit.unitKey)).toEqual([
      'resident:listDetail:list:list-e:self',
      'resident:listDetail:list:list-d:self',
      'resident:listDetail:list:list-c:self',
      'resident:listDetail:list:list-b:self',
    ]);
  });

  test('L3 residency: slug-only listDetail entries fall back to entryId identity (no cross-entry reuse — RT-18)', () => {
    const root = entry('search');
    const slugEntry = entry('listDetail', { listDetail: { shareSlug: 'abc' } });
    const units = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: [root, slugEntry],
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(units?.[0].unitKey).toBe(`resident:listDetail:${slugEntry.entryId}`);
  });

  test('(a) a child scene mounts per key#entryId', () => {
    const { follow, stack } = drillStack();
    const units = resolveMountedSceneEntryUnits({
      sceneKey: 'restaurant',
      overlayRouteStack: stack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(units).not.toBeNull();
    expect(units).toHaveLength(1);
    expect(units?.[0]?.unitKey).toBe(`restaurant#${follow.entryId}`);
    expect(units?.[0]?.unitKey).toBe(createSceneEntryMountUnitKey('restaurant', follow.entryId));
    expect(units?.[0]?.entry).toBe(follow);
  });

  test('(b) two entries of one key = two mounted units, both live, stack order', () => {
    const { userA, userB, stack } = drillStack();
    const units = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: stack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(units?.map((unit) => unit.entryId)).toEqual([userA.entryId, userB.entryId]);
    expect(units?.map((unit) => unit.unitKey)).toEqual([
      `pollDetail#${userA.entryId}`,
      `pollDetail#${userB.entryId}`,
    ]);
    // The ACTIVE (visible) unit is the topmost in-stack entry of the key.
    expect(resolveActiveEntryIdForScene('pollDetail', stack)).toBe(userB.entryId);
  });

  test('(c) pop: the popped entry stays mounted ONLY while outgoingEntryId names it', () => {
    const { userA, userB, stack } = drillStack();
    const unitsBeforePop = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: stack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    const poppedStack = stack.slice(0, -1); // userProfile(B) popped
    // In-flight settle window: the frame still holds B as outgoing → B stays mounted.
    const unitsDuringSettle = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: poppedStack,
      outgoingEntryId: userB.entryId,
      previousUnits: unitsBeforePop,
    });
    expect(unitsDuringSettle?.map((unit) => unit.entryId)).toEqual([userA.entryId, userB.entryId]);
    // The retained unit is the SAME object (no rebuild of a leaving unit).
    expect(unitsDuringSettle?.[1]).toBe(unitsBeforePop?.[1]);
    // Settle: outgoing cleared → the popped entry unmounts.
    const unitsAfterSettle = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: poppedStack,
      outgoingEntryId: null,
      previousUnits: unitsDuringSettle,
    });
    expect(unitsAfterSettle?.map((unit) => unit.entryId)).toEqual([userA.entryId]);
    // Pop-return reveals A as the active unit again.
    expect(resolveActiveEntryIdForScene('pollDetail', poppedStack)).toBe(userA.entryId);
  });

  test('(e) depth-K=3 eviction: deeper entries unmount, keep entry data, remount on pop-return', () => {
    expect(SCENE_ENTRY_MOUNT_DEPTH_LIMIT).toBe(3);
    const root = entry('search');
    const listL1 = entry('listDetail', { listId: 'l-1' });
    const userU1 = entry('pollDetail', { pollId: 'p-1' });
    const followF1 = entry('restaurant', { restaurantId: 'r-1' });
    const userU2 = entry('pollDetail', { pollId: 'p-2' });
    const followF2 = entry('followList', { userId: 'u-2', mode: 'following' });
    const deepStack = [root, listL1, userU1, followF1, userU2, followF2];
    // Depths below top: L1=4 (evicted), U1=3 (kept), F1=2, U2=1, F2=0.
    const listUnits = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: deepStack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(listUnits).toEqual([]); // evicted — but still an ENTRY-KEYED scene (not null)
    const userUnits = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: deepStack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    expect(userUnits?.map((unit) => unit.entryId)).toEqual([userU1.entryId, userU2.entryId]);
    // Pop-return: one pop brings L1 to depth 3 → remounts with the SAME entryId (data kept
    // on the entry — the stack never dropped it).
    const poppedStack = deepStack.slice(0, -1);
    const remounted = resolveMountedSceneEntryUnits({
      sceneKey: 'listDetail',
      overlayRouteStack: poppedStack,
      outgoingEntryId: null,
      previousUnits: listUnits,
    });
    expect(remounted?.map((unit) => unit.entryId)).toEqual([listL1.entryId]);
    expect(remounted?.[0]?.entry).toBe(listL1);
  });

  test('unit reference stability: unchanged entries reuse previous unit objects', () => {
    const { stack } = drillStack();
    const first = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: stack,
      outgoingEntryId: null,
      previousUnits: null,
    });
    const second = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: stack,
      outgoingEntryId: null,
      previousUnits: first,
    });
    expect(second?.[0]).toBe(first?.[0]);
    expect(second?.[1]).toBe(first?.[1]);
    expect(areSceneEntryMountUnitArraysEqual(first, second)).toBe(true);
    // A param update mints a NEW entry value under the SAME entryId → unit rebuilds,
    // unitKey stable (the mount survives; new params flow as props).
    const updated = stack.map((stackEntry, index) =>
      index === 3 ? { ...stackEntry, params: { userId: 'u-b2' } } : stackEntry
    ) as OverlayRouteEntry[];
    const third = resolveMountedSceneEntryUnits({
      sceneKey: 'pollDetail',
      overlayRouteStack: updated,
      outgoingEntryId: null,
      previousUnits: second,
    });
    expect(third?.[0]).toBe(second?.[0]);
    expect(third?.[1]).not.toBe(second?.[1]);
    expect(third?.[1]?.unitKey).toBe(second?.[1]?.unitKey);
    expect(areSceneEntryMountUnitArraysEqual(second, third)).toBe(false);
  });
});

describe('PresentationFrame entry identity (W1 C5 — additive fields)', () => {
  test('the equality fn compares the entry-id fields (snapshot-equality landmine)', () => {
    const base = { ...EMPTY_PRESENTATION_FRAME, activeSceneKey: 'userProfile' as const };
    expect(arePresentationFramesEqual(base, { ...base })).toBe(true);
    expect(arePresentationFramesEqual(base, { ...base, activeEntryId: 'e1' })).toBe(false);
    expect(arePresentationFramesEqual(base, { ...base, presentedEntryId: 'e1' })).toBe(false);
    expect(arePresentationFramesEqual(base, { ...base, outgoingEntryId: 'e1' })).toBe(false);
  });

  test('entry-level supersede mirrors the ack-conditional hold and survives same-key switches', () => {
    const previousFrame = {
      ...EMPTY_PRESENTATION_FRAME,
      presentedSceneKey: 'userProfile' as const,
      presentedEntryId: 'entry-A',
      outgoingSceneKey: null, // same-key switch holds no outgoing LEG…
      outgoingEntryId: null,
    };
    // …but the leaving ENTRY is still held when the new switch preserves outgoing.
    expect(
      resolveSupersededOutgoingEntryId({
        previousFrame,
        previousAckCommitted: true,
        preservesOutgoing: true,
      })
    ).toBe('entry-A');
    // Pre-ack: the painted unit is still the PREVIOUS outgoing entry.
    expect(
      resolveSupersededOutgoingEntryId({
        previousFrame: { ...previousFrame, outgoingEntryId: 'entry-Z' },
        previousAckCommitted: false,
        preservesOutgoing: true,
      })
    ).toBe('entry-Z');
    // swapImmediately (closeChild/dismiss byte-identity): no hold.
    expect(
      resolveSupersededOutgoingEntryId({
        previousFrame,
        previousAckCommitted: true,
        preservesOutgoing: false,
      })
    ).toBeNull();
  });
});
