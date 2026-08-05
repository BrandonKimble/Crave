import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET } from './app-overlay-route-transition-contract';
import type { AppRouteSheetScenePolicy } from './scene-foundation-spec';
import { SCENE_DECLARATIONS } from './scene-foundation-spec';

// THE ONE SCENE-DECLARATION SCHEMA (scene-foundation-spec.ts) owns the rows now. This module
// used to hold its OWN exhaustive `Record<OverlayKey, AppRouteScenePolicy>` — one of the five
// dialects redteam-abstractions.md finding 6 named. The rows moved verbatim into the schema's
// `policy` group; what stays here are the RESOLVERS (the policy-shaped questions the route
// runtime asks), which now read the schema.
export type { AppRouteSheetScenePolicy } from './scene-foundation-spec';

/**
 * The runtime enumeration of every OverlayKey — derived from the exhaustive schema, so it
 * grows with the type by construction (no parallel hand list). Consumers: descriptor-table
 * row derivation, exhaustiveness sweeps.
 */
export const APP_ROUTE_SCENE_KEYS = Object.keys(SCENE_DECLARATIONS) as OverlayKey[];

export const resolveAppRouteSheetScenePolicy = (sceneKey: OverlayKey): AppRouteSheetScenePolicy => {
  const {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    postureSeat,
  } = SCENE_DECLARATIONS[sceneKey].policy;
  return {
    sheetTargetGroup,
    defaultFirstEntrySnap,
    allowedSnaps,
    requiresExpandedPresentation,
    canSwipeDismiss,
    postureSeat,
  };
};

export const appRouteSceneUsesSharedSheetTarget = ({
  sceneKey,
  sheetTargetGroup,
}: {
  sceneKey: OverlayKey;
  sheetTargetGroup: OverlayKey;
}): boolean => SCENE_DECLARATIONS[sceneKey]?.policy.sheetTargetGroup === sheetTargetGroup;

export const resolveAppRouteSceneSheetHostSceneKey = (sceneKey: OverlayKey): OverlayKey | null =>
  SCENE_DECLARATIONS[sceneKey]?.policy.sheetTargetGroup ?? null;

export const resolveAppRouteSceneChromeVisibilityTarget = ({
  targetSceneKey,
  snapTarget,
}: {
  targetSceneKey: OverlayKey;
  snapTarget: BottomSheetSnap | null;
}): RouteSceneSwitchChromeVisibilityTarget => {
  const policy = SCENE_DECLARATIONS[targetSceneKey].policy.chromePolicy;
  if (policy.kind !== 'search-chrome-from-snap' || snapTarget == null) {
    return PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET;
  }

  return {
    searchChrome: snapTarget === 'hidden' ? 'hidden' : 'visible',
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

// Leg 6 (§4): resolveAppRouteSceneHeaderActionModeTarget is DELETED — the header action is
// host-owned and PF-derived (resolveHeaderNavAction); headerActionPolicy died with it.
