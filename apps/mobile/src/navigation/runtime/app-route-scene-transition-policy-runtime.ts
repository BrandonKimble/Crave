import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchCameraIntent,
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchHeaderActionModeTarget,
  RouteSceneSwitchMotionPlane,
  RouteSceneSwitchPollsParams,
  RouteSceneSwitchRouteAction,
  RouteSceneSwitchRouteParams,
  RouteSceneSwitchSheetIntent,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT } from './app-overlay-route-transition-contract';
import {
  resolveAppRouteSceneHeaderActionModeTarget,
  resolveAppRouteSceneChromeVisibilityTarget,
  resolveAppRouteSceneDefaultSnapTarget,
  resolveAppRouteSceneSheetHostSceneKey,
  resolveAppRouteSceneSheetVisibilityTarget,
} from './app-route-scene-policy-registry';
import type { SearchFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

export type AppRouteSceneTransitionPolicyInput = {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  settleToken?: number | null;
  snapTarget?: BottomSheetSnap | null;
  sheetIntent?: RouteSceneSwitchSheetIntent | null;
  cameraIntent?: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget?: RouteSceneSwitchChromeVisibilityTarget;
  pollsParams?: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap?: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
  routeAction?: RouteSceneSwitchRouteAction;
  routeParams?: RouteSceneSwitchRouteParams;
  resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) => BottomSheetSnap | null;
};

export type AppRouteSceneTransitionPlan = {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  committedRootRouteKey: OverlayKey;
  committedRouteAction: RouteSceneSwitchRouteAction;
  committedRouteParams: RouteSceneSwitchRouteParams | undefined;
  settleToken: number | null;
  snapTarget: BottomSheetSnap | null;
  sheetHostSceneKey: OverlayKey | null;
  sheetSnapTarget: BottomSheetSnap | null;
  sheetVisibilityTarget: RouteSceneSwitchSheetVisibilityTarget;
  sheetIntent: RouteSceneSwitchSheetIntent | null;
  cameraIntent: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget;
  headerActionModeTarget: RouteSceneSwitchHeaderActionModeTarget;
  freezeClassification: SearchFreezeClassification;
  motionPlanes: readonly RouteSceneSwitchMotionPlane[];
  pollsParams: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
};

const isPreserveCameraIntent = (cameraIntent: RouteSceneSwitchCameraIntent): boolean =>
  cameraIntent.kind === 'preserve';

const isPreserveChromeTarget = (
  chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget
): boolean => chromeVisibilityTarget.searchChrome === 'preserve';

const resolveRouteSceneSwitchSnapTarget = ({
  sourceSceneKey,
  targetSceneKey,
  snapTarget,
  resolveCurrentSheetSnapTarget,
}: Pick<
  AppRouteSceneTransitionPolicyInput,
  'sourceSceneKey' | 'targetSceneKey' | 'snapTarget' | 'resolveCurrentSheetSnapTarget'
>): BottomSheetSnap | null => {
  if (snapTarget !== undefined) {
    return snapTarget;
  }
  return resolveAppRouteSceneDefaultSnapTarget({
    sourceSceneKey,
    targetSceneKey,
    resolveCurrentSheetSnapTarget,
  });
};

const resolveMotionPlanes = ({
  sheetIntent,
  cameraIntent,
  chromeVisibilityTarget,
}: Pick<
  AppRouteSceneTransitionPlan,
  'sheetIntent' | 'cameraIntent' | 'chromeVisibilityTarget'
>): readonly RouteSceneSwitchMotionPlane[] => {
  const motionPlanes: RouteSceneSwitchMotionPlane[] = [];
  if (sheetIntent != null) {
    motionPlanes.push('sheet');
  }
  if (!isPreserveCameraIntent(cameraIntent)) {
    motionPlanes.push('camera');
  }
  if (!isPreserveChromeTarget(chromeVisibilityTarget)) {
    motionPlanes.push('chrome');
  }
  return motionPlanes;
};

const resolveCommittedRootRoute = (targetSceneKey: OverlayKey): OverlayKey =>
  targetSceneKey === 'polls' ? 'search' : targetSceneKey;

const resolveDockedPollsRestoreSnap = ({
  targetSceneKey,
  snapTarget,
  dockedPollsRestoreSnap,
}: {
  targetSceneKey: OverlayKey;
  snapTarget: BottomSheetSnap | null;
  dockedPollsRestoreSnap: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null | undefined;
}): RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null => {
  if (dockedPollsRestoreSnap !== undefined) {
    return dockedPollsRestoreSnap;
  }
  if (targetSceneKey !== 'polls') {
    return null;
  }
  if (snapTarget != null && snapTarget !== 'hidden') {
    return snapTarget;
  }
  return 'collapsed';
};

export const resolveAppRouteSceneTransitionPlan = ({
  sourceSceneKey,
  targetSceneKey,
  settleToken,
  snapTarget,
  sheetIntent,
  cameraIntent = PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  chromeVisibilityTarget,
  pollsParams,
  dockedPollsRestoreSnap,
  routeAction = 'setRoot',
  routeParams,
  resolveCurrentSheetSnapTarget,
}: AppRouteSceneTransitionPolicyInput): AppRouteSceneTransitionPlan => {
  const resolvedSnapTarget = resolveRouteSceneSwitchSnapTarget({
    sourceSceneKey,
    targetSceneKey,
    snapTarget,
    resolveCurrentSheetSnapTarget,
  });
  const resolvedSheetIntent =
    sheetIntent !== undefined
      ? sheetIntent
      : resolvedSnapTarget == null
      ? null
      : {
          sceneKey: targetSceneKey,
          snapTarget: resolvedSnapTarget,
          role: 'incoming' as const,
        };
  const resolvedChromeVisibilityTarget =
    chromeVisibilityTarget ??
    resolveAppRouteSceneChromeVisibilityTarget({
      targetSceneKey,
      snapTarget: resolvedSnapTarget,
    });
  const sheetHostSceneKey = resolveAppRouteSceneSheetHostSceneKey(targetSceneKey);
  const sheetSnapTarget = resolvedSheetIntent?.snapTarget ?? resolvedSnapTarget;

  return {
    sourceSceneKey,
    targetSceneKey,
    settleToken: settleToken ?? null,
    committedRootRouteKey: resolveCommittedRootRoute(targetSceneKey),
    committedRouteAction: routeAction,
    committedRouteParams: routeParams,
    snapTarget: resolvedSnapTarget,
    sheetHostSceneKey,
    sheetSnapTarget,
    sheetVisibilityTarget: resolveAppRouteSceneSheetVisibilityTarget({
      snapTarget: sheetSnapTarget,
    }),
    sheetIntent: resolvedSheetIntent,
    cameraIntent,
    chromeVisibilityTarget: resolvedChromeVisibilityTarget,
    headerActionModeTarget: resolveAppRouteSceneHeaderActionModeTarget(targetSceneKey),
    freezeClassification: 'none',
    motionPlanes: resolveMotionPlanes({
      sheetIntent: resolvedSheetIntent,
      cameraIntent,
      chromeVisibilityTarget: resolvedChromeVisibilityTarget,
    }),
    pollsParams: targetSceneKey === 'polls' ? pollsParams ?? null : null,
    dockedPollsRestoreSnap: resolveDockedPollsRestoreSnap({
      targetSceneKey,
      snapTarget: resolvedSnapTarget,
      dockedPollsRestoreSnap,
    }),
  };
};
