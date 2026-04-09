import type {
  ProfileControllerState,
  RestaurantProfileRequestById,
} from './profile-runtime-state-record';
import type {
  HydratedRestaurantProfile,
  RestaurantFocusSession,
} from './profile-transition-state-contract';

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
  restaurantId: string
): HydratedRestaurantProfile | undefined =>
  controllerState.mutable.restaurantProfileCache.get(restaurantId);

export const setRestaurantProfileCacheEntryOnRecord = (
  controllerState: ProfileControllerState,
  restaurantId: string,
  hydratedRestaurantProfile: HydratedRestaurantProfile
): void => {
  controllerState.mutable.restaurantProfileCache.set(restaurantId, hydratedRestaurantProfile);
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
