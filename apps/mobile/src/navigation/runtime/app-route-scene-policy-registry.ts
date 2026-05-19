import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import { resolveAppOverlayRouteHeaderActionPolicy } from './app-overlay-route-types';
import type {
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchHeaderActionModeTarget,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET } from './app-overlay-route-transition-contract';

type AppRouteSceneChromePolicy = { kind: 'search-chrome-from-snap' } | { kind: 'preserve' };

export type AppRouteSheetScenePolicy = {
  sheetTargetGroup: OverlayKey | null;
  defaultFirstEntrySnap: BottomSheetSnap | null;
  allowedSnaps: readonly BottomSheetSnap[];
  requiresExpandedPresentation: boolean;
  canSwipeDismiss: boolean;
  snapPersistence: 'none' | 'shared' | 'scene';
};

type AppRouteScenePolicy = AppRouteSheetScenePolicy & {
  chromePolicy: AppRouteSceneChromePolicy;
};

const SEARCH_ROUTE_SHEET_TARGET_GROUP: OverlayKey = 'searchRoute';

const APP_ROUTE_SCENE_POLICY_BY_KEY: Record<OverlayKey, AppRouteScenePolicy> = {
  search: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  polls: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'shared',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  bookmarks: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'shared',
    chromePolicy: { kind: 'preserve' },
  },
  profile: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'shared',
    chromePolicy: { kind: 'preserve' },
  },
  saveList: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
  pollCreation: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
  restaurant: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'middle',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
  favoriteListDetail: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
  searchRoute: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'shared',
    chromePolicy: { kind: 'preserve' },
  },
  price: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
  scoreInfo: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    snapPersistence: 'none',
    chromePolicy: { kind: 'preserve' },
  },
};

export const resolveAppRouteSheetScenePolicy = (
  sceneKey: OverlayKey
): AppRouteSheetScenePolicy => {
  const {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    snapPersistence,
  } = APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey];
  return {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    snapPersistence,
  };
};

export const appRouteSceneUsesSharedSheetTarget = ({
  sceneKey,
  sheetTargetGroup,
}: {
  sceneKey: OverlayKey;
  sheetTargetGroup: OverlayKey;
}): boolean => APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey]?.sheetTargetGroup === sheetTargetGroup;

export const resolveAppRouteSceneSheetHostSceneKey = (sceneKey: OverlayKey): OverlayKey | null =>
  APP_ROUTE_SCENE_POLICY_BY_KEY[sceneKey]?.sheetTargetGroup ?? null;

export const resolveAppRouteSceneChromeVisibilityTarget = ({
  targetSceneKey,
  snapTarget,
}: {
  targetSceneKey: OverlayKey;
  snapTarget: BottomSheetSnap | null;
}): RouteSceneSwitchChromeVisibilityTarget => {
  const policy = APP_ROUTE_SCENE_POLICY_BY_KEY[targetSceneKey].chromePolicy;
  if (policy.kind !== 'search-chrome-from-snap' || snapTarget == null) {
    return PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET;
  }

  return {
    searchChrome: snapTarget === 'collapsed' || snapTarget === 'middle' ? 'visible' : 'hidden',
  };
};

export const resolveAppRouteSceneSheetVisibilityTarget = ({
  snapTarget,
}: {
  snapTarget: BottomSheetSnap | null;
}): RouteSceneSwitchSheetVisibilityTarget => {
  if (snapTarget == null) {
    return 'preserve';
  }
  return snapTarget === 'hidden' ? 'hidden' : 'visible';
};

export const resolveAppRouteSceneHeaderActionModeTarget = (
  targetSceneKey: OverlayKey
): RouteSceneSwitchHeaderActionModeTarget => {
  const sheetHostSceneKey = resolveAppRouteSceneSheetHostSceneKey(targetSceneKey);
  if (sheetHostSceneKey == null) {
    return 'preserve';
  }
  const headerActionPolicy = resolveAppOverlayRouteHeaderActionPolicy(targetSceneKey);
  if (headerActionPolicy === 'follow-collapse') {
    return 'follow-collapse';
  }
  return headerActionPolicy === 'fixed-close' ? 'fixed-close' : 'preserve';
};
