import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchHeaderActionModeTarget,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET } from './app-overlay-route-transition-contract';

type AppRouteSceneDefaultSnapPolicy =
  | { kind: 'fixed'; snapTarget: BottomSheetSnap }
  | { kind: 'preserve-search-source' }
  | { kind: 'none' };

type AppRouteSceneChromePolicy = { kind: 'search-chrome-from-snap' } | { kind: 'preserve' };

type AppRouteScenePolicy = {
  sheetTargetGroup: OverlayKey | null;
  defaultSnapPolicy: AppRouteSceneDefaultSnapPolicy;
  chromePolicy: AppRouteSceneChromePolicy;
};

const SEARCH_ROUTE_SHEET_TARGET_GROUP: OverlayKey = 'searchRoute';

const FIXED_CLOSE_HEADER_ACTION_SCENES: ReadonlySet<OverlayKey> = new Set<OverlayKey>([
  'search',
  'bookmarks',
  'profile',
  'saveList',
  'pollCreation',
  'restaurant',
  'searchRoute',
]);

const APP_ROUTE_SCENE_POLICY_BY_KEY: Record<OverlayKey, AppRouteScenePolicy> = {
  search: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'fixed', snapTarget: 'collapsed' },
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  polls: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'fixed', snapTarget: 'collapsed' },
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  bookmarks: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'preserve-search-source' },
    chromePolicy: { kind: 'preserve' },
  },
  profile: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'preserve-search-source' },
    chromePolicy: { kind: 'preserve' },
  },
  saveList: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'preserve-search-source' },
    chromePolicy: { kind: 'preserve' },
  },
  pollCreation: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'preserve-search-source' },
    chromePolicy: { kind: 'preserve' },
  },
  restaurant: {
    sheetTargetGroup: 'restaurant',
    defaultSnapPolicy: { kind: 'fixed', snapTarget: 'middle' },
    chromePolicy: { kind: 'preserve' },
  },
  searchRoute: {
    sheetTargetGroup: SEARCH_ROUTE_SHEET_TARGET_GROUP,
    defaultSnapPolicy: { kind: 'none' },
    chromePolicy: { kind: 'preserve' },
  },
  price: {
    sheetTargetGroup: null,
    defaultSnapPolicy: { kind: 'none' },
    chromePolicy: { kind: 'preserve' },
  },
  scoreInfo: {
    sheetTargetGroup: null,
    defaultSnapPolicy: { kind: 'none' },
    chromePolicy: { kind: 'preserve' },
  },
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

export const resolveAppRouteSceneDefaultSnapTarget = ({
  sourceSceneKey,
  targetSceneKey,
  resolveCurrentSheetSnapTarget,
}: {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) => BottomSheetSnap | null;
}): BottomSheetSnap | null => {
  const policy = APP_ROUTE_SCENE_POLICY_BY_KEY[targetSceneKey].defaultSnapPolicy;
  switch (policy.kind) {
    case 'fixed':
      return policy.snapTarget;
    case 'preserve-search-source': {
      if (sourceSceneKey !== 'search') {
        return null;
      }
      const currentSnapTarget = resolveCurrentSheetSnapTarget(sourceSceneKey) ?? 'expanded';
      if (currentSnapTarget !== 'collapsed') {
        return currentSnapTarget;
      }
      const targetSnap = resolveCurrentSheetSnapTarget(targetSceneKey);
      return targetSnap == null || targetSnap === 'hidden' || targetSnap === 'collapsed'
        ? 'expanded'
        : targetSnap;
    }
    case 'none':
    default:
      return null;
  }
};

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
  if (targetSceneKey === 'polls') {
    return 'follow-collapse';
  }
  return FIXED_CLOSE_HEADER_ACTION_SCENES.has(targetSceneKey) ? 'fixed-close' : 'preserve';
};
