import type {
  OverlayKey,
  OverlayRouteParamsMap,
  OverlayRouteEntry,
} from './app-overlay-route-types';
import {
  areOverlayRouteEntryValuesEqual,
  areOverlayRouteParamsEqualForKey,
} from './app-overlay-route-params-equality';

/**
 * Behavior pin for the per-scene params comparator table.
 *
 * Rows 1:1 pin the OLD shape-sniffing arms' semantics (areOverlayRouteParamsEqual in
 * app-route-overlay-host-authority-controller before the table refactor), plus:
 * - the RED case the critique named: two entries of DIFFERENT keys with identical
 *   param shapes must compare UNEQUAL. Verified against the old impl by inspection:
 *   it ignored keys entirely, so polls {pollId:'p1'} vs pollDetail {pollId:'p1'} hit
 *   the pollId arm and returned TRUE — this table-driven case fails on the old impl.
 * - the fall-through-disease fixes: shapes the old impl could only ever call unequal
 *   (saveList, listDetail, followList, param-shape scenes without a sniffed field)
 *   now compare properly.
 */

type ParamsCase<K extends OverlayKey = OverlayKey> = {
  name: string;
  key: K;
  left: OverlayRouteParamsMap[K];
  right: OverlayRouteParamsMap[K];
  expected: boolean;
};

const paramsCase = <K extends OverlayKey>(entry: ParamsCase<K>): ParamsCase<K> => entry;

const BOUNDS_A: import('../../types').MapBounds = {
  northEast: { lat: 1, lng: 1 },
  southWest: { lat: 0, lng: 0 },
};

const PARAMS_EQUALITY_CASES: readonly ParamsCase[] = [
  // ── nullish gate (old impl's leading guards) ──────────────────────────────
  paramsCase({
    name: 'both undefined are equal',
    key: 'search',
    left: undefined,
    right: undefined,
    expected: true,
  }),
  paramsCase({
    name: 'one side nullish is unequal',
    key: 'polls',
    left: { pollId: 'p1' },
    right: undefined,
    expected: false,
  }),
  // ── restaurant arm (pin) ──────────────────────────────────────────────────
  paramsCase({
    name: 'restaurant: identical params equal',
    key: 'restaurant',
    left: { restaurantId: 'r1', source: 'search', sessionToken: 7 },
    right: { restaurantId: 'r1', source: 'search', sessionToken: 7 },
    expected: true,
  }),
  paramsCase({
    name: 'restaurant: differing restaurantId unequal',
    key: 'restaurant',
    left: { restaurantId: 'r1' },
    right: { restaurantId: 'r2' },
    expected: false,
  }),
  paramsCase({
    name: 'restaurant: differing sessionToken unequal',
    key: 'restaurant',
    left: { restaurantId: 'r1', sessionToken: 1 },
    right: { restaurantId: 'r1', sessionToken: 2 },
    expected: false,
  }),
  // ── postPhotos (previously rode the restaurant arm's union) ──────────────
  paramsCase({
    name: 'postPhotos: identical params equal',
    key: 'postPhotos',
    left: { restaurantId: 'r1', dishId: 'd1', sessionNonce: 'n1' },
    right: { restaurantId: 'r1', dishId: 'd1', sessionNonce: 'n1' },
    expected: true,
  }),
  paramsCase({
    name: 'postPhotos: differing sessionNonce unequal',
    key: 'postPhotos',
    left: { restaurantId: 'r1', sessionNonce: 'n1' },
    right: { restaurantId: 'r1', sessionNonce: 'n2' },
    expected: false,
  }),
  paramsCase({
    name: 'postPhotos: differing dishId unequal',
    key: 'postPhotos',
    left: { restaurantId: 'r1', dishId: 'd1', sessionNonce: 'n1' },
    right: { restaurantId: 'r1', dishId: 'd2', sessionNonce: 'n1' },
    expected: false,
  }),
  // ── polls arm (pin) ───────────────────────────────────────────────────────
  paramsCase({
    name: 'polls: identical market + pollId equal',
    key: 'polls',
    left: { pollId: 'p1', marketKey: 'austin', marketName: 'Austin', pinnedMarket: true },
    right: { pollId: 'p1', marketKey: 'austin', marketName: 'Austin', pinnedMarket: true },
    expected: true,
  }),
  paramsCase({
    name: 'polls: differing marketKey unequal',
    key: 'polls',
    left: { pollId: 'p1', marketKey: 'austin' },
    right: { pollId: 'p1', marketKey: 'dallas' },
    expected: false,
  }),
  paramsCase({
    name: 'polls: differing pinnedMarket unequal',
    key: 'polls',
    left: { marketKey: 'austin', pinnedMarket: true },
    right: { marketKey: 'austin', pinnedMarket: false },
    expected: false,
  }),
  // ── pollDetail (previously rode the pollId arm) ───────────────────────────
  paramsCase({
    name: 'pollDetail: same pollId equal',
    key: 'pollDetail',
    left: { pollId: 'p1' },
    right: { pollId: 'p1' },
    expected: true,
  }),
  paramsCase({
    name: 'pollDetail: differing pollId unequal',
    key: 'pollDetail',
    left: { pollId: 'p1' },
    right: { pollId: 'p2' },
    expected: false,
  }),
  paramsCase({
    name: 'pollDetail: fresh poll snapshot references still equal (excluded field)',
    key: 'pollDetail',
    left: { pollId: 'p1', poll: { id: 'p1' } as never },
    right: { pollId: 'p1', poll: { id: 'p1' } as never },
    expected: true,
  }),
  // ── dmSession arm (pin) ───────────────────────────────────────────────────
  paramsCase({
    name: 'dmSession: identical conversation + peerName equal',
    key: 'dmSession',
    left: { conversationId: 'c1', peerName: 'Sam' },
    right: { conversationId: 'c1', peerName: 'Sam' },
    expected: true,
  }),
  paramsCase({
    name: 'dmSession: differing conversationId unequal',
    key: 'dmSession',
    left: { conversationId: 'c1', peerName: 'Sam' },
    right: { conversationId: 'c2', peerName: 'Sam' },
    expected: false,
  }),
  paramsCase({
    name: 'dmSession: differing peerName snapshot unequal (header renders from it)',
    key: 'dmSession',
    left: { conversationId: 'c1', peerName: 'Sam' },
    right: { conversationId: 'c1', peerName: 'Samuel' },
    expected: false,
  }),
  // ── bounds arm (pin — pollCreation) ───────────────────────────────────────
  paramsCase({
    name: 'pollCreation: same bounds reference + market equal',
    key: 'pollCreation',
    left: { marketKey: 'austin', marketName: 'Austin', bounds: BOUNDS_A },
    right: { marketKey: 'austin', marketName: 'Austin', bounds: BOUNDS_A },
    expected: true,
  }),
  paramsCase({
    name: 'pollCreation: differing bounds reference unequal',
    key: 'pollCreation',
    left: { marketKey: 'austin', bounds: BOUNDS_A },
    right: { marketKey: 'austin', bounds: { ...BOUNDS_A } },
    expected: false,
  }),
  // ── fall-through-disease fixes (old impl: always false) ───────────────────
  paramsCase({
    name: 'saveList: identical params now equal (old impl fell through to false)',
    key: 'saveList',
    left: {
      listType: 'dish',
      target: { connectionId: 'c1' },
      parentSceneKey: 'search',
      ownerSceneKey: 'search',
      routeInstanceId: 'i1',
    },
    right: {
      listType: 'dish',
      target: { connectionId: 'c1' },
      parentSceneKey: 'search',
      ownerSceneKey: 'search',
      routeInstanceId: 'i1',
    },
    expected: true,
  }),
  paramsCase({
    name: 'saveList: differing target unequal',
    key: 'saveList',
    left: {
      listType: 'dish',
      target: { connectionId: 'c1' },
      parentSceneKey: 'search',
      ownerSceneKey: 'search',
      routeInstanceId: 'i1',
    },
    right: {
      listType: 'dish',
      target: { connectionId: 'c2' },
      parentSceneKey: 'search',
      ownerSceneKey: 'search',
      routeInstanceId: 'i1',
    },
    expected: false,
  }),
  paramsCase({
    name: 'listDetail: identical params now equal (old impl fell through to false)',
    key: 'listDetail',
    left: { listId: 'l1', shareSlug: 's1', joinIntent: true },
    right: { listId: 'l1', shareSlug: 's1', joinIntent: true },
    expected: true,
  }),
  paramsCase({
    name: 'listDetail: differing shareSlug unequal',
    key: 'listDetail',
    left: { listId: 'l1', shareSlug: 's1' },
    right: { listId: 'l1', shareSlug: 's2' },
    expected: false,
  }),
  paramsCase({
    name: 'followList: identical params now equal',
    key: 'followList',
    left: { userId: 'u1', mode: 'followers' },
    right: { userId: 'u1', mode: 'followers' },
    expected: true,
  }),
  paramsCase({
    name: 'followList: differing mode unequal',
    key: 'followList',
    left: { userId: 'u1', mode: 'followers' },
    right: { userId: 'u1', mode: 'following' },
    expected: false,
  }),
  paramsCase({
    name: 'userProfile: differing userId unequal',
    key: 'userProfile',
    left: { userId: 'u1' },
    right: { userId: 'u2' },
    expected: false,
  }),
  paramsCase({
    name: 'profile: identical profileUserId equal',
    key: 'profile',
    left: { profileUserId: 'u1' },
    right: { profileUserId: 'u1' },
    expected: true,
  }),
];

const createEntry = <K extends OverlayKey>(
  entryId: string,
  key: K,
  params: OverlayRouteParamsMap[K]
): OverlayRouteEntry<K> => ({ entryId, key, params, origin: null, desire: null });

describe('areOverlayRouteParamsEqualForKey (per-scene comparator table)', () => {
  it.each(PARAMS_EQUALITY_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(areOverlayRouteParamsEqualForKey(c.key, c.left, c.right)).toBe(c.expected);
    // Symmetry: params equality must not depend on argument order.
    expect(areOverlayRouteParamsEqualForKey(c.key, c.right, c.left)).toBe(c.expected);
  });

  it('same reference short-circuits equal', () => {
    const params: OverlayRouteParamsMap['pollDetail'] = { pollId: 'p1' };
    expect(areOverlayRouteParamsEqualForKey('pollDetail', params, params)).toBe(true);
  });
});

describe('areOverlayRouteEntryValuesEqual (key-guarded dispatch)', () => {
  // THE RED CASE (fails against the old shape-sniffing impl, which ignored keys and
  // compared {pollId:'p1'} equal to {pollId:'p1'} across polls/pollDetail):
  it('two entries of different keys with identical param shapes are UNEQUAL', () => {
    const left = createEntry('e1', 'polls', { pollId: 'p1' });
    const right = { ...createEntry('e1', 'pollDetail', { pollId: 'p1' }) } as OverlayRouteEntry;
    expect(areOverlayRouteEntryValuesEqual(left as OverlayRouteEntry, right)).toBe(false);
  });

  it('differing entryId is unequal even with identical key + params', () => {
    const left = createEntry('e1', 'dmSession', { conversationId: 'c1' });
    const right = createEntry('e2', 'dmSession', { conversationId: 'c1' });
    expect(
      areOverlayRouteEntryValuesEqual(left as OverlayRouteEntry, right as OverlayRouteEntry)
    ).toBe(false);
  });

  it('same entryId + key + equal params is equal', () => {
    const left = createEntry('e1', 'dmSession', { conversationId: 'c1', peerName: 'Sam' });
    const right = createEntry('e1', 'dmSession', { conversationId: 'c1', peerName: 'Sam' });
    expect(
      areOverlayRouteEntryValuesEqual(left as OverlayRouteEntry, right as OverlayRouteEntry)
    ).toBe(true);
  });
});
