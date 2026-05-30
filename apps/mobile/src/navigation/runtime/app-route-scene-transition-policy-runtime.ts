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
  RouteSceneSwitchSheetContentHandoff,
  RouteSceneSwitchSheetMotionPlan,
  RouteSceneSwitchSheetOpenerSource,
  RouteSceneSwitchSheetSnapPersistence,
  RouteSceneSwitchSheetIntent,
  RouteSceneSwitchSheetTransitionKind,
  RouteSceneSwitchSheetTransitionPlan,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT } from './app-overlay-route-transition-contract';
import {
  resolveAppRouteSceneHeaderActionModeTarget,
  resolveAppRouteSceneChromeVisibilityTarget,
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
  sheetTransitionKind?: RouteSceneSwitchSheetTransitionKind;
  sheetOpenerSource?: RouteSceneSwitchSheetOpenerSource;
  sheetMotion?: RouteSceneSwitchSheetMotionPlan;
  contentHandoff?: RouteSceneSwitchSheetContentHandoff;
  snapPersistence?: RouteSceneSwitchSheetSnapPersistence;
  cameraIntent?: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget?: RouteSceneSwitchChromeVisibilityTarget;
  pollsParams?: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap?: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
  routeAction?: RouteSceneSwitchRouteAction;
  routeParams?: RouteSceneSwitchRouteParams;
  currentRootRouteKey: OverlayKey;
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
  sheetTransitionPlan: RouteSceneSwitchSheetTransitionPlan;
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
  snapTarget,
}: Pick<AppRouteSceneTransitionPolicyInput, 'snapTarget'>): BottomSheetSnap | null => {
  if (snapTarget !== undefined) {
    return snapTarget;
  }
  return null;
};

const SHARED_SHEET_HOST_SCENE_KEY: OverlayKey = 'searchRoute';

const TOP_LEVEL_SHARED_SHEET_SCENES = new Set<OverlayKey>([
  'search',
  'polls',
  'bookmarks',
  'profile',
]);

const CHILD_SHARED_SHEET_SCENES = new Set<OverlayKey>([
  'restaurant',
  'favoriteListDetail',
  'saveList',
  'pollCreation',
]);

const MODAL_SCENES = new Set<OverlayKey>(['price', 'scoreInfo']);

const isSharedSheetChildScene = (sceneKey: OverlayKey): boolean =>
  CHILD_SHARED_SHEET_SCENES.has(sceneKey);

const resolveInferredSheetTransitionKind = ({
  sourceSceneKey,
  targetSceneKey,
  routeAction,
  snapTarget,
}: Pick<
  AppRouteSceneTransitionPolicyInput,
  'sourceSceneKey' | 'targetSceneKey' | 'routeAction' | 'snapTarget'
>): RouteSceneSwitchSheetTransitionKind => {
  if (MODAL_SCENES.has(targetSceneKey)) {
    return 'modalOpen';
  }
  if (snapTarget === 'hidden') {
    return 'terminalDismiss';
  }
  if (routeAction === 'closeActive' || routeAction === 'popToRoot') {
    return isSharedSheetChildScene(sourceSceneKey) ? 'closeChild' : 'topLevelSwitch';
  }
  if (routeAction === 'push' || routeAction === 'updateActive') {
    return isSharedSheetChildScene(targetSceneKey) ? 'openChild' : 'topLevelSwitch';
  }
  if (sourceSceneKey === targetSceneKey) {
    return 'gesture';
  }
  if (TOP_LEVEL_SHARED_SHEET_SCENES.has(targetSceneKey)) {
    return 'topLevelSwitch';
  }
  return isSharedSheetChildScene(targetSceneKey) ? 'openChild' : 'bootstrap';
};

const resolveCurrentSharedSheetSnap = (
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget']
): BottomSheetSnap | null =>
  resolveCurrentSheetSnapTarget(SHARED_SHEET_HOST_SCENE_KEY) ??
  resolveCurrentSheetSnapTarget('search') ??
  null;

const resolvePromotedSnapTarget = ({
  promoteAtLeastSnap,
  resolveCurrentSheetSnapTarget,
}: {
  promoteAtLeastSnap: Exclude<BottomSheetSnap, 'hidden'>;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): BottomSheetSnap | null => {
  const currentSnap = resolveCurrentSharedSheetSnap(resolveCurrentSheetSnapTarget);
  if (currentSnap === 'expanded') {
    return null;
  }
  if (promoteAtLeastSnap === 'middle' && currentSnap === 'middle') {
    return null;
  }
  return promoteAtLeastSnap;
};

const resolveDefaultSheetMotionPlan = ({
  targetSceneKey,
  transitionKind,
  explicitSnapTarget,
  resolveCurrentSheetSnapTarget,
}: {
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  explicitSnapTarget: BottomSheetSnap | null;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): RouteSceneSwitchSheetMotionPlan => {
  if (MODAL_SCENES.has(targetSceneKey)) {
    return { kind: 'none' };
  }
  if (explicitSnapTarget != null) {
    return explicitSnapTarget === 'hidden'
      ? { kind: 'hide' }
      : { kind: 'snapTo', snap: explicitSnapTarget };
  }
  switch (transitionKind) {
    case 'terminalDismiss':
      return { kind: 'hide' };
    case 'openChild':
      if (targetSceneKey === 'saveList' || targetSceneKey === 'pollCreation') {
        return { kind: 'snapTo', snap: 'expanded' };
      }
      if (targetSceneKey === 'restaurant') {
        return { kind: 'promoteAtLeast', snap: 'middle' };
      }
      return { kind: 'preserveLiveY' };
    case 'closeChild':
      return { kind: 'preserveLiveY' };
    case 'topLevelSwitch':
      if (targetSceneKey === 'search' || targetSceneKey === 'polls') {
        return { kind: 'snapTo', snap: 'collapsed' };
      }
      if (targetSceneKey === 'bookmarks' || targetSceneKey === 'profile') {
        const currentSnap = resolveCurrentSharedSheetSnap(resolveCurrentSheetSnapTarget);
        return currentSnap != null && currentSnap !== 'hidden' && currentSnap !== 'collapsed'
          ? { kind: 'preserveLiveY' }
          : { kind: 'snapTo', snap: 'expanded' };
      }
      return { kind: 'preserveLiveY' };
    case 'gesture':
    case 'modalClose':
    case 'bootstrap':
    default:
      return { kind: 'preserveLiveY' };
  }
};

const resolveSnapTargetFromSheetMotion = ({
  motion,
  resolveCurrentSheetSnapTarget,
}: {
  motion: RouteSceneSwitchSheetMotionPlan;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): BottomSheetSnap | null => {
  switch (motion.kind) {
    case 'snapTo':
      return motion.snap;
    case 'hide':
      return 'hidden';
    case 'promoteAtLeast':
      return resolvePromotedSnapTarget({
        promoteAtLeastSnap: motion.snap,
        resolveCurrentSheetSnapTarget,
      });
    case 'none':
    case 'preserveLiveY':
    default:
      return null;
  }
};

const resolveContentHandoff = ({
  transitionKind,
  contentHandoff,
}: {
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  contentHandoff?: RouteSceneSwitchSheetContentHandoff;
}): RouteSceneSwitchSheetContentHandoff => {
  if (contentHandoff != null) {
    return contentHandoff;
  }
  if (transitionKind === 'terminalDismiss') {
    return 'preserveOutgoingUntilSettle';
  }
  return 'swapImmediately';
};

const resolveSnapPersistence = ({
  transitionKind,
  snapPersistence,
}: {
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  snapPersistence?: RouteSceneSwitchSheetSnapPersistence;
}): RouteSceneSwitchSheetSnapPersistence => {
  if (snapPersistence != null) {
    return snapPersistence;
  }
  if (transitionKind === 'gesture') {
    return 'writeSceneMemory';
  }
  if (transitionKind === 'topLevelSwitch') {
    return 'readSceneMemory';
  }
  return 'sharedOnly';
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

const resolveCommittedRootRoute = ({
  currentRootRouteKey,
  routeAction,
  targetSceneKey,
}: {
  currentRootRouteKey: OverlayKey;
  routeAction: RouteSceneSwitchRouteAction;
  targetSceneKey: OverlayKey;
}): OverlayKey => {
  if (routeAction === 'preserve') {
    return currentRootRouteKey;
  }
  return targetSceneKey === 'polls' ? 'search' : targetSceneKey;
};

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
  sheetTransitionKind,
  sheetOpenerSource,
  sheetMotion,
  contentHandoff,
  snapPersistence,
  cameraIntent = PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  chromeVisibilityTarget,
  pollsParams,
  dockedPollsRestoreSnap,
  routeAction = 'setRoot',
  routeParams,
  currentRootRouteKey,
  resolveCurrentSheetSnapTarget,
}: AppRouteSceneTransitionPolicyInput): AppRouteSceneTransitionPlan => {
  const resolvedSnapTarget = resolveRouteSceneSwitchSnapTarget({
    snapTarget,
  });
  const resolvedTransitionKind =
    sheetTransitionKind ??
    resolveInferredSheetTransitionKind({
      sourceSceneKey,
      targetSceneKey,
      routeAction,
      snapTarget,
    });
  const resolvedSheetMotion =
    sheetMotion ??
    resolveDefaultSheetMotionPlan({
      targetSceneKey,
      transitionKind: resolvedTransitionKind,
      explicitSnapTarget: resolvedSnapTarget,
      resolveCurrentSheetSnapTarget,
    });
  const resolvedSheetSnapTarget = resolveSnapTargetFromSheetMotion({
    motion: resolvedSheetMotion,
    resolveCurrentSheetSnapTarget,
  });
  const resolvedSheetIntent =
    sheetIntent !== undefined
      ? sheetIntent
      : resolvedSheetSnapTarget == null
      ? null
      : {
          sceneKey: resolveAppRouteSceneSheetHostSceneKey(targetSceneKey) ?? targetSceneKey,
          snapTarget: resolvedSheetSnapTarget,
          role: 'incoming' as const,
        };
  const resolvedChromeVisibilityTarget =
    chromeVisibilityTarget ??
    resolveAppRouteSceneChromeVisibilityTarget({
      targetSceneKey,
      snapTarget: resolvedSheetSnapTarget,
    });
  const sheetHostSceneKey =
    resolvedSheetIntent?.sceneKey ?? resolveAppRouteSceneSheetHostSceneKey(targetSceneKey);
  const sheetSnapTarget = resolvedSheetIntent?.snapTarget ?? resolvedSheetSnapTarget;
  const resolvedSheetTransitionPlan: RouteSceneSwitchSheetTransitionPlan = {
    transitionKind: resolvedTransitionKind,
    sourceSceneKey,
    targetSceneKey,
    openerSceneKey: sourceSceneKey,
    openerSource: sheetOpenerSource ?? 'unknown',
    motion: resolvedSheetMotion,
    contentHandoff: resolveContentHandoff({
      transitionKind: resolvedTransitionKind,
      contentHandoff,
    }),
    snapPersistence: resolveSnapPersistence({
      transitionKind: resolvedTransitionKind,
      snapPersistence,
    }),
  };

  return {
    sourceSceneKey,
    targetSceneKey,
    settleToken: settleToken ?? null,
    committedRootRouteKey: resolveCommittedRootRoute({
      currentRootRouteKey,
      routeAction,
      targetSceneKey,
    }),
    committedRouteAction: routeAction,
    committedRouteParams: routeParams,
    snapTarget: resolvedSheetSnapTarget,
    sheetHostSceneKey,
    sheetSnapTarget,
    sheetVisibilityTarget: resolveAppRouteSceneSheetVisibilityTarget({
      snapTarget: sheetSnapTarget,
    }),
    sheetIntent: resolvedSheetIntent,
    sheetTransitionPlan: resolvedSheetTransitionPlan,
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
      snapTarget: resolvedSheetSnapTarget,
      dockedPollsRestoreSnap,
    }),
  };
};
