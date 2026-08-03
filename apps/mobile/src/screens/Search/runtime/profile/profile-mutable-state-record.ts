import type {
  ProfileControllerState,
  RestaurantProfileRequestById,
} from './profile-runtime-state-record';
import type {
  HydratedRestaurantProfile,
  RestaurantFocusSession,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

// Leg 2 (geo-demand rebuild §7): the profile is restaurant-scoped (ALL locations,
// no market slice) — the cache/request key is the restaurantId itself.

export const getRestaurantProfileRequestSeqFromRecord = (
  controllerState: ProfileControllerState
): number => controllerState.mutable.restaurantProfileRequestSeq;

export const incrementRestaurantProfileRequestSeqOnRecord = (
  controllerState: ProfileControllerState
): number => {
  controllerState.mutable.restaurantProfileRequestSeq += 1;
  return controllerState.mutable.restaurantProfileRequestSeq;
};

export const setRestaurantProfileRequestSeqOnRecord = (
  controllerState: ProfileControllerState,
  requestSeq: number
): void => {
  controllerState.mutable.restaurantProfileRequestSeq = requestSeq;
};

export const getLastAutoOpenKeyFromRecord = (
  controllerState: ProfileControllerState
): string | null => controllerState.mutable.lastAutoOpenKey;

export const setLastAutoOpenKeyOnRecord = (
  controllerState: ProfileControllerState,
  key: string | null
): void => {
  controllerState.mutable.lastAutoOpenKey = key;
};

export const getRestaurantFocusSessionFromRecord = (
  controllerState: ProfileControllerState
): RestaurantFocusSession => controllerState.mutable.restaurantFocusSession;

export const setRestaurantFocusSessionOnRecord = (
  controllerState: ProfileControllerState,
  session: RestaurantFocusSession
): void => {
  controllerState.mutable.restaurantFocusSession = session;
};

export const resetRestaurantFocusSessionOnRecord = (
  controllerState: ProfileControllerState
): void => {
  controllerState.mutable.restaurantFocusSession = {
    restaurantId: null,
    locationKey: null,
    hasAppliedInitialMultiLocationZoomOut: false,
  };
};

export const getActiveHydrationIntentFromRecord = (controllerState: ProfileControllerState) =>
  controllerState.mutable.activeHydrationIntent;

export const setActiveHydrationIntentOnRecord = (
  controllerState: ProfileControllerState,
  activeHydrationIntent: ProfileControllerState['mutable']['activeHydrationIntent']
): void => {
  controllerState.mutable.activeHydrationIntent = activeHydrationIntent;
};

export const clearActiveHydrationIntentForRequestSeqOnRecord = (
  controllerState: ProfileControllerState,
  requestSeq: number
): void => {
  if (controllerState.mutable.activeHydrationIntent?.requestSeq === requestSeq) {
    controllerState.mutable.activeHydrationIntent = null;
  }
};

/** F1065 — THE BOUND. `restaurantProfileCache` used to grow one entry per distinct
 *  restaurant viewed, for the lifetime of the search runtime: no cap, no eviction, no
 *  delete anywhere. That is a slow leak wearing a cache's name, on the app's most-visited
 *  remote object. The bound is NOT a taste call — unbounded is not a choice anyone made.
 *
 *  Shape copied verbatim from the sibling one directory over
 *  (resolver/search-world-value-constructor.ts:21,44-53, the marker-pipeline cache): a
 *  Map used as an LRU, re-inserted on every write so iteration order IS recency, evicting
 *  from the front past the limit.
 *
 *  INVALIDATION SEMANTICS, stated out loud because the previous shape had none:
 *   - eviction is by CAPACITY and RECENCY only — the least-recently-WRITTEN entry goes.
 *   - a READ does not refresh recency. A profile you keep re-opening from cache without a
 *     refetch is still evictable; that is deliberate, since an evicted entry costs one
 *     refetch, and read-promotion would let one pinned profile hold a slot forever.
 *   - there is NO TTL: within a session a cached profile's dishes/score never refresh.
 *     That is the PRE-EXISTING behavior, preserved here on purpose — a staleness window is
 *     a felt-quality decision (it changes perceived speed on re-open) and belongs to the
 *     owner, recorded in F1065 as OWNER-DECISION. This change fixes the leak, not the
 *     freshness policy, and does not pretend to.
 *  RED recipe: set the limit to 2, write 3 distinct ids, and the first read misses. */
const RESTAURANT_PROFILE_CACHE_LIMIT = 12;

export const getRestaurantProfileCacheEntryFromRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string
): HydratedRestaurantProfile | undefined =>
  controllerState.mutable.restaurantProfileCache.get(restaurantId);

export const setRestaurantProfileCacheEntryOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  hydratedRestaurantProfile: HydratedRestaurantProfile
): void => {
  const cache = controllerState.mutable.restaurantProfileCache;
  // Delete-then-set so the re-written key moves to the BACK: Map iteration order is
  // insertion order, so the front is always the least-recently-written entry.
  cache.delete(restaurantId);
  cache.set(restaurantId, hydratedRestaurantProfile);
  while (cache.size > RESTAURANT_PROFILE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    cache.delete(oldestKey);
  }
};

export const getRestaurantProfileRequestByIdFromRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string
): RestaurantProfileRequestById | undefined =>
  controllerState.mutable.restaurantProfileRequestById.get(restaurantId);

export const setRestaurantProfileRequestByIdOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  request: RestaurantProfileRequestById
): void => {
  controllerState.mutable.restaurantProfileRequestById.set(restaurantId, request);
};

export const deleteRestaurantProfileRequestByIdOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string
): void => {
  controllerState.mutable.restaurantProfileRequestById.delete(restaurantId);
};
