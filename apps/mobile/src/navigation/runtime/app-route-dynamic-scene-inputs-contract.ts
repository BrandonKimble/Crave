import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type {
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchPollsParams,
} from './app-overlay-route-transition-contract';
import type { DockedPollsSnapRequest } from './app-route-sheet-snap-session-runtime';
import type { UsePollsPanelSpecOptions } from '../../overlays/panels/runtime/polls-panel-runtime-contract';

export type AppRouteDynamicSceneInputRuntime = {
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  startupPollsSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  userLocation: UsePollsPanelSpecOptions['userLocation'];
  searchInteractionRef: UsePollsPanelSpecOptions['interactionRef'];
};

export const EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME: AppRouteDynamicSceneInputRuntime = {
  pollBounds: null,
  startupPollsSnapshot: null,
  userLocation: null,
  searchInteractionRef: undefined,
};

export const areAppRouteDynamicSceneInputRuntimesEqual = (
  left: AppRouteDynamicSceneInputRuntime,
  right: AppRouteDynamicSceneInputRuntime
): boolean =>
  left.pollBounds === right.pollBounds &&
  left.startupPollsSnapshot === right.startupPollsSnapshot &&
  left.userLocation === right.userLocation &&
  left.searchInteractionRef === right.searchInteractionRef;

export type AppRoutePollsDynamicSceneInputRuntime = AppRouteDynamicSceneInputRuntime;

export const EMPTY_APP_ROUTE_POLLS_DYNAMIC_SCENE_INPUT_RUNTIME: AppRoutePollsDynamicSceneInputRuntime =
  {
    pollBounds: null,
    startupPollsSnapshot: null,
    userLocation: null,
    searchInteractionRef: undefined,
  };

export const areAppRoutePollsDynamicSceneInputRuntimesEqual = (
  left: AppRoutePollsDynamicSceneInputRuntime,
  right: AppRoutePollsDynamicSceneInputRuntime
): boolean =>
  left.pollBounds === right.pollBounds &&
  left.startupPollsSnapshot === right.startupPollsSnapshot &&
  left.userLocation === right.userLocation &&
  left.searchInteractionRef === right.searchInteractionRef;

export const selectAppRoutePollsDynamicSceneInputRuntime = (
  runtime: AppRouteDynamicSceneInputRuntime
): AppRoutePollsDynamicSceneInputRuntime => ({
  pollBounds: runtime.pollBounds,
  startupPollsSnapshot: runtime.startupPollsSnapshot,
  userLocation: runtime.userLocation,
  searchInteractionRef: runtime.searchInteractionRef,
});

export type AppRoutePollsRouteStateRuntime = {
  isSearchOverlay: boolean;
  isPersistentPollLane: boolean;
  rootOverlayKey: OverlayKey | null;
  activePollsParams: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
};

export type AppRouteSceneSheetSessionInputState = {
  pollsDockedSnapRequest: DockedPollsSnapRequest | null;
  isDockedPollsDismissed: boolean;
  dockedPollsRestoreInFlight: boolean;
  ignoreDockedPollsHiddenUntilMs: number;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
};

export const areAppRouteSceneSheetSessionInputStatesEqual = (
  left: AppRouteSceneSheetSessionInputState,
  right: AppRouteSceneSheetSessionInputState
): boolean =>
  left.pollsDockedSnapRequest === right.pollsDockedSnapRequest &&
  left.isDockedPollsDismissed === right.isDockedPollsDismissed &&
  left.dockedPollsRestoreInFlight === right.dockedPollsRestoreInFlight &&
  left.ignoreDockedPollsHiddenUntilMs === right.ignoreDockedPollsHiddenUntilMs &&
  left.pollCreationSnapRequest === right.pollCreationSnapRequest;
