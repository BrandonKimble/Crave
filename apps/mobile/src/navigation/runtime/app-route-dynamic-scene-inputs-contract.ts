import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchDockedSceneRestoreIntent,
  RouteSceneSwitchPollsParams,
} from './app-overlay-route-transition-contract';
import type { UsePollsPanelSpecOptions } from '../../overlays/panels/runtime/polls-panel-runtime-contract';

export type AppRouteDynamicSceneInputRuntime = {
  searchInteractionRef: UsePollsPanelSpecOptions['interactionRef'];
};

export const EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME: AppRouteDynamicSceneInputRuntime = {
  searchInteractionRef: undefined,
};

export const areAppRouteDynamicSceneInputRuntimesEqual = (
  left: AppRouteDynamicSceneInputRuntime,
  right: AppRouteDynamicSceneInputRuntime
): boolean => left.searchInteractionRef === right.searchInteractionRef;

// F1395: `AppRoutePollsDynamicSceneInputRuntime` used to be its own type (a bare alias of
// this one — same single field), with its own EMPTY constant, equality fn, and identity
// selector, tracked as a SECOND copy of the same snapshot in the controller. Since the two
// types were never different, the "polls runtime" is just this runtime — one type, one
// snapshot, one equality.
export type AppRoutePollsDynamicSceneInputRuntime = AppRouteDynamicSceneInputRuntime;

export type AppRoutePollsRouteStateRuntime = {
  isSearchOverlay: boolean;
  rootOverlayKey: OverlayKey | null;
  activePollsParams: RouteSceneSwitchPollsParams | null;
  dockedSceneRestoreIntent: RouteSceneSwitchDockedSceneRestoreIntent | null;
};

// F1394/F1396: `AppRouteSceneSheetSessionInputState` (isDockedSceneDismissed) and its
// equality used to be read here by two dead consumers — the polls-scene-input
// controller's own dedup-only tracking (F1394) and this dynamic-scene-input-writers
// hook's unread `routeSheetSnapSessionState` (F1396). Both deleted; nothing reads
// isDockedSceneDismissed through this contract anymore.
