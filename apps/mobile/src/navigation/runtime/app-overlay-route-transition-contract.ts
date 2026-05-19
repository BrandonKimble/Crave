import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
} from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import type { SearchFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';
import type { OverlayRouteParamsMap } from './app-overlay-route-types';
import type { CameraSnapshot } from './app-route-profile-transition-state-contract';

export type RouteSceneSwitchTransitionPhase = 'idle' | 'overlay-switch';

export type RouteSceneSwitchCameraIntent =
  | { kind: 'preserve' }
  | { kind: 'restore-search' }
  | {
      kind: 'focus';
      center: [number, number];
      zoom: number;
      padding?: CameraSnapshot['padding'];
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
    };

export type RouteSceneSwitchChromeVisibilityTarget = {
  searchChrome: 'visible' | 'hidden' | 'preserve';
};

export type RouteSceneSwitchMotionPlane = 'sheet' | 'camera' | 'chrome';

export type RouteSceneSwitchSheetVisibilityTarget = 'visible' | 'hidden' | 'preserve';

export type RouteSceneSwitchHeaderActionModeTarget = OverlayHeaderActionMode | 'preserve';

export type RouteSceneSwitchPollsParams = OverlayRouteParamsMap['polls'];

export type RouteSceneSwitchSheetIntent = {
  sceneKey: OverlayKey;
  snapTarget: BottomSheetSnap;
  role: 'incoming' | 'outgoing';
};

export type RouteSceneSwitchSheetTransitionKind =
  | 'bootstrap'
  | 'topLevelSwitch'
  | 'openChild'
  | 'closeChild'
  | 'terminalDismiss'
  | 'gesture'
  | 'modalOpen'
  | 'modalClose';

export type RouteSceneSwitchSheetOpenerSource =
  | 'mapTap'
  | 'resultCard'
  | 'navTab'
  | 'systemDismiss'
  | 'routeCommand'
  | 'pollAction'
  | 'unknown';

export type RouteSceneSwitchSheetMotionPlan =
  | { kind: 'preserveLiveY' }
  | {
      kind: 'promoteAtLeast';
      snap: Exclude<BottomSheetSnap, 'hidden'>;
      mode?: BottomSheetMotionCommand['mode'];
    }
  | { kind: 'snapTo'; snap: BottomSheetSnap; mode?: BottomSheetMotionCommand['mode'] }
  | { kind: 'hide'; mode?: BottomSheetMotionCommand['mode'] }
  | { kind: 'none' };

export type RouteSceneSwitchSheetContentHandoff =
  | 'swapImmediately'
  | 'swapAfterCollapse'
  | 'preserveOutgoingUntilSettle';

export type RouteSceneSwitchSheetSnapPersistence =
  | 'none'
  | 'readSceneMemory'
  | 'writeSceneMemory'
  | 'sharedOnly';

export type RouteSceneSwitchSheetTransitionPlan = {
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  sourceSceneKey: OverlayKey | null;
  targetSceneKey: OverlayKey;
  openerSceneKey: OverlayKey | null;
  openerSource: RouteSceneSwitchSheetOpenerSource;
  motion: RouteSceneSwitchSheetMotionPlan;
  contentHandoff: RouteSceneSwitchSheetContentHandoff;
  snapPersistence: RouteSceneSwitchSheetSnapPersistence;
};

export type RouteSceneSwitchRouteAction =
  | 'setRoot'
  | 'push'
  | 'updateActive'
  | 'closeActive'
  | 'popToRoot';

export type RouteSceneSwitchRouteParams = OverlayRouteParamsMap[OverlayKey];

export type RouteSceneSwitchDockedPollsRestoreIntent = {
  snap: Exclude<BottomSheetSnap, 'hidden'>;
  token: number;
};

export const PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT: RouteSceneSwitchCameraIntent = {
  kind: 'preserve',
};

export const PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET: RouteSceneSwitchChromeVisibilityTarget = {
  searchChrome: 'preserve',
};

export type RouteSceneSwitchTransitionContract = {
  sourceSceneKey: OverlayKey | null;
  targetSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  transitionToken: number;
  settleToken: number;
  committedRootRouteKey: OverlayKey | null;
  committedRouteAction: RouteSceneSwitchRouteAction;
  committedRouteParams: RouteSceneSwitchRouteParams | undefined;
  snapTarget: BottomSheetSnap | null;
  sheetHostSceneKey: OverlayKey | null;
  sheetSnapTarget: BottomSheetSnap | null;
  sheetVisibilityTarget: RouteSceneSwitchSheetVisibilityTarget;
  sheetIntent: RouteSceneSwitchSheetIntent | null;
  sheetTransitionPlan: RouteSceneSwitchSheetTransitionPlan;
  cameraIntent: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget;
  headerActionModeTarget: RouteSceneSwitchHeaderActionModeTarget;
  freezeClassification: SearchFreezeClassification;
  motionPlanes: readonly RouteSceneSwitchMotionPlane[];
  pollsParams: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  isInteractive: boolean;
};

export type RouteSceneSwitchRequestInput = {
  sourceSceneKey?: OverlayKey | null;
  targetSceneKey: OverlayKey;
  settleToken?: number | null;
  pollsParams?: RouteSceneSwitchPollsParams | null;
  snapTarget?: BottomSheetSnap | null;
  sheetIntent?: RouteSceneSwitchSheetIntent | null;
  sheetTransitionKind?: RouteSceneSwitchSheetTransitionKind;
  sheetOpenerSource?: RouteSceneSwitchSheetOpenerSource;
  sheetMotion?: RouteSceneSwitchSheetMotionPlan;
  contentHandoff?: RouteSceneSwitchSheetContentHandoff;
  snapPersistence?: RouteSceneSwitchSheetSnapPersistence;
  cameraIntent?: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget?: RouteSceneSwitchChromeVisibilityTarget;
  dockedPollsRestoreSnap?: Exclude<BottomSheetSnap, 'hidden'> | null;
  routeAction?: RouteSceneSwitchRouteAction;
  routeParams?: RouteSceneSwitchRouteParams;
};
