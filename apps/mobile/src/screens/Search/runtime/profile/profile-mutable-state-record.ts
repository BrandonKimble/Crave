import type {
  ProfileControllerState,
  RestaurantProfileRequestById,
} from './profile-runtime-state-record';
import type {
  HydratedRestaurantProfile,
  RestaurantFocusSession,
} from './profile-transition-state-contract';

const buildRestaurantProfileCacheKey = (
  restaurantId: string,
  marketKey?: string | null
): string => {
  const normalizedMarketKey =
    typeof marketKey === 'string' && marketKey.trim().length ? marketKey.trim().toLowerCase() : '';
  return `${restaurantId}::${normalizedMarketKey}`;
};

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

export const getRestaurantProfileCacheEntryFromRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  marketKey?: string | null
): HydratedRestaurantProfile | undefined =>
  controllerState.mutable.restaurantProfileCache.get(
    buildRestaurantProfileCacheKey(restaurantId, marketKey)
  );

export const setRestaurantProfileCacheEntryOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  marketKey: string | null | undefined,
  hydratedRestaurantProfile: HydratedRestaurantProfile
): void => {
  controllerState.mutable.restaurantProfileCache.set(
    buildRestaurantProfileCacheKey(restaurantId, marketKey),
    hydratedRestaurantProfile
  );
};

export const getRestaurantProfileRequestByIdFromRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  marketKey?: string | null
): RestaurantProfileRequestById | undefined =>
  controllerState.mutable.restaurantProfileRequestById.get(
    buildRestaurantProfileCacheKey(restaurantId, marketKey)
  );

export const setRestaurantProfileRequestByIdOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  marketKey: string | null | undefined,
  request: RestaurantProfileRequestById
): void => {
  controllerState.mutable.restaurantProfileRequestById.set(
    buildRestaurantProfileCacheKey(restaurantId, marketKey),
    request
  );
};

export const deleteRestaurantProfileRequestByIdOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  marketKey?: string | null
): void => {
  controllerState.mutable.restaurantProfileRequestById.delete(
    buildRestaurantProfileCacheKey(restaurantId, marketKey)
  );
};
