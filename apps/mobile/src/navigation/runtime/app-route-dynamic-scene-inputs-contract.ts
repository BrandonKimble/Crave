import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchPollsParams,
} from './app-overlay-route-transition-contract';
import type { UsePollsPanelSpecOptions } from '../../overlays/panels/runtime/polls-panel-runtime-contract';

export type AppRouteDynamicSceneInputRuntime = {
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  searchInteractionRef: UsePollsPanelSpecOptions['interactionRef'];
};

export const EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME: AppRouteDynamicSceneInputRuntime = {
  pollBounds: null,
  searchInteractionRef: undefined,
};

export const areAppRouteDynamicSceneInputRuntimesEqual = (
  left: AppRouteDynamicSceneInputRuntime,
  right: AppRouteDynamicSceneInputRuntime
): boolean =>
  left.pollBounds === right.pollBounds && left.searchInteractionRef === right.searchInteractionRef;

export type AppRoutePollsDynamicSceneInputRuntime = AppRouteDynamicSceneInputRuntime;

export const EMPTY_APP_ROUTE_POLLS_DYNAMIC_SCENE_INPUT_RUNTIME: AppRoutePollsDynamicSceneInputRuntime =
  {
    pollBounds: null,
    searchInteractionRef: undefined,
  };

export const areAppRoutePollsDynamicSceneInputRuntimesEqual = (
  left: AppRoutePollsDynamicSceneInputRuntime,
  right: AppRoutePollsDynamicSceneInputRuntime
): boolean =>
  left.pollBounds === right.pollBounds && left.searchInteractionRef === right.searchInteractionRef;

export const selectAppRoutePollsDynamicSceneInputRuntime = (
  runtime: AppRouteDynamicSceneInputRuntime
): AppRoutePollsDynamicSceneInputRuntime => ({
  pollBounds: runtime.pollBounds,
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
  isDockedPollsDismissed: boolean;
};

export const areAppRouteSceneSheetSessionInputStatesEqual = (
  left: AppRouteSceneSheetSessionInputState,
  right: AppRouteSceneSheetSessionInputState
): boolean => left.isDockedPollsDismissed === right.isDockedPollsDismissed;
