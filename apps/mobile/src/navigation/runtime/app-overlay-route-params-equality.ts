import type {
  OverlayKey,
  OverlayRouteParamsMap,
  OverlayRouteEntry,
} from './app-overlay-route-types';

/**
 * Per-scene overlay-route params equality (ideal shape, replaces the shape-sniffing
 * `'restaurantId' in left` arms that lived in app-route-overlay-host-authority-controller).
 *
 * - ONE comparator PER OverlayKey, typed against THAT scene's params from
 *   OverlayRouteParamsMap — compile-exhaustive via `satisfies`, so adding a scene key
 *   without a comparator is a build error (no silent fall-through-to-`false` churn,
 *   no cross-scene field unions).
 * - Dispatch is BY KEY. Entries of different keys are NEVER params-equal, even when
 *   their param shapes are identical (the old shape-sniff bug: polls {pollId} vs
 *   pollDetail {pollId} compared equal).
 * - Param-less scenes share one trivial comparator.
 * - Object-reference fields follow the old arms' semantics: `bounds` compares by
 *   reference; pollDetail's `poll` feed-card snapshot is deliberately NOT compared
 *   (a fresh snapshot reference per publish would make the entry never-equal).
 */

type OverlayRouteParamsComparator<K extends OverlayKey> = (
  left: NonNullable<OverlayRouteParamsMap[K]>,
  right: NonNullable<OverlayRouteParamsMap[K]>
) => boolean;

/** Scenes whose params slot is `undefined` — both sides are nullish by construction,
 * which the nullish gate in areOverlayRouteParamsEqualForKey already resolved. */
const paramlessSceneParamsEqual = (): boolean => true;

const OVERLAY_ROUTE_PARAMS_COMPARATORS = {
  search: paramlessSceneParamsEqual,
  sheetHost: paramlessSceneParamsEqual,
  bookmarks: paramlessSceneParamsEqual,
  price: paramlessSceneParamsEqual,
  scoreInfo: paramlessSceneParamsEqual,
  notifications: paramlessSceneParamsEqual,
  settings: paramlessSceneParamsEqual,
  editProfile: paramlessSceneParamsEqual,
  messagesInbox: paramlessSceneParamsEqual,
  polls: (left, right) => left.pollId === right.pollId,
  profile: (left, right) => left.profileUserId === right.profileUserId,
  restaurant: (left, right) =>
    left.restaurantId === right.restaurantId &&
    left.source === right.source &&
    left.parentSceneKey === right.parentSceneKey &&
    left.ownerSceneKey === right.ownerSceneKey &&
    left.openerRouteKey === right.openerRouteKey &&
    left.routeInstanceId === right.routeInstanceId &&
    left.sessionToken === right.sessionToken,
  saveList: (left, right) =>
    left.listType === right.listType &&
    left.target?.restaurantId === right.target?.restaurantId &&
    left.target?.connectionId === right.target?.connectionId &&
    left.parentSceneKey === right.parentSceneKey &&
    left.ownerSceneKey === right.ownerSceneKey &&
    left.openerRouteKey === right.openerRouteKey &&
    left.routeInstanceId === right.routeInstanceId,
  pollCreation: (left, right) =>
    left.marketName === right.marketName &&
    // Reference compare (the old `bounds` arm's semantics) — bounds is a captured
    // map-region snapshot, stable per publish.
    left.bounds === right.bounds &&
    left.parentSceneKey === right.parentSceneKey &&
    left.ownerSceneKey === right.ownerSceneKey &&
    left.routeInstanceId === right.routeInstanceId,
  pollDetail: (left, right) =>
    // `poll` (feed-card snapshot) intentionally excluded — see the module doc.
    left.pollId === right.pollId &&
    left.parentSceneKey === right.parentSceneKey &&
    left.ownerSceneKey === right.ownerSceneKey &&
    left.routeInstanceId === right.routeInstanceId &&
    left.commentAnchorId === right.commentAnchorId,
  userProfile: (left, right) => left.userId === right.userId,
  listDetail: (left, right) =>
    left.listId === right.listId &&
    left.shareSlug === right.shareSlug &&
    left.targetUserId === right.targetUserId &&
    left.joinIntent === right.joinIntent,
  followList: (left, right) => left.userId === right.userId && left.mode === right.mode,
  postPhotos: (left, right) =>
    left.restaurantId === right.restaurantId &&
    left.restaurantName === right.restaurantName &&
    left.dishId === right.dishId &&
    left.dishName === right.dishName &&
    left.sessionNonce === right.sessionNonce,
  dmSession: (left, right) =>
    // peerName is a display snapshot, but a changed snapshot still means a changed
    // entry value (the header renders from it until the DTO hydrates).
    left.conversationId === right.conversationId && left.peerName === right.peerName,
} satisfies { [K in OverlayKey]: OverlayRouteParamsComparator<K> };

export const areOverlayRouteParamsEqualForKey = <K extends OverlayKey>(
  key: K,
  left: OverlayRouteParamsMap[K],
  right: OverlayRouteParamsMap[K]
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return left == null && right == null;
  }
  // The table is keyed by K, so this index is the K comparator; TS can't narrow a
  // generic index into a mapped object type, hence the localized cast.
  const comparator = OVERLAY_ROUTE_PARAMS_COMPARATORS[key] as OverlayRouteParamsComparator<K>;
  return comparator(
    left as NonNullable<OverlayRouteParamsMap[K]>,
    right as NonNullable<OverlayRouteParamsMap[K]>
  );
};

/**
 * Entry-value equality: same stack instance (entryId), same scene key (explicit guard —
 * two entries of different keys are unequal BY KEY, never by param-shape accident),
 * and per-scene params equality.
 */
export const areOverlayRouteEntryValuesEqual = (
  left: OverlayRouteEntry,
  right: OverlayRouteEntry
): boolean =>
  left.entryId === right.entryId &&
  left.key === right.key &&
  areOverlayRouteParamsEqualForKey(left.key, left.params, right.params as typeof left.params);
