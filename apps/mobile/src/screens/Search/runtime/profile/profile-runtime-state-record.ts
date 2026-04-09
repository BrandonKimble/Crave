import type {
  ProfileForegroundUiRestoreState,
  ProfileTransitionState,
  RestaurantFocusSession,
  HydratedRestaurantProfile,
} from './profile-transition-state-contract';
import { createInitialProfileTransitionState } from './profile-transition-state-mutations';

export type ActiveHydrationIntent = {
  requestSeq: number;
  restaurantId: string;
};

export type RestaurantProfileRequestById = Promise<HydratedRestaurantProfile>;

export type ProfileCloseState = {
  multiLocationZoomBaseline: number | null;
  dismissBehavior: 'restore' | 'clear';
  shouldClearSearchOnDismiss: boolean;
  previousForegroundUiRestoreState: ProfileForegroundUiRestoreState | null;
};

type ProfileRuntimeState = {
  transition: ProfileTransitionState;
  close: ProfileCloseState;
};

type ProfileMutableState = {
  activeHydrationIntent: ActiveHydrationIntent | null;
  lastAutoOpenKey: string | null;
  restaurantProfileRequestSeq: number;
  restaurantProfileCache: Map<string, HydratedRestaurantProfile>;
  restaurantProfileRequestById: Map<string, Promise<HydratedRestaurantProfile>>;
  restaurantFocusSession: RestaurantFocusSession;
};

export type ProfileControllerState = {
  runtime: ProfileRuntimeState;
  mutable: ProfileMutableState;
};

export const EMPTY_RESTAURANT_FOCUS_SESSION: RestaurantFocusSession = {
  restaurantId: null,
  locationKey: null,
  hasAppliedInitialMultiLocationZoomOut: false,
};

const createInitialProfileCloseState = (): ProfileCloseState => ({
  multiLocationZoomBaseline: null,
  dismissBehavior: 'restore',
  shouldClearSearchOnDismiss: false,
  previousForegroundUiRestoreState: null,
});

const createInitialProfileRuntimeState = (): ProfileRuntimeState => ({
  transition: createInitialProfileTransitionState(),
  close: createInitialProfileCloseState(),
});

const createInitialProfileMutableState = (): ProfileMutableState => ({
  activeHydrationIntent: null,
  lastAutoOpenKey: null,
  restaurantProfileRequestSeq: 0,
  restaurantProfileCache: new Map(),
  restaurantProfileRequestById: new Map(),
  restaurantFocusSession: EMPTY_RESTAURANT_FOCUS_SESSION,
});

export const createInitialProfileControllerState = (): ProfileControllerState => ({
  runtime: createInitialProfileRuntimeState(),
  mutable: createInitialProfileMutableState(),
});
