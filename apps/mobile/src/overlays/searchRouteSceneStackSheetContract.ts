import type {
  SearchRouteInlineSceneChromePublication,
  SearchRouteMountedSceneChromeSurface,
  SearchRouteSceneBodyContentSpec,
  SearchRouteSceneBodyTransportSpec,
  SearchRouteMountedSceneChromeKey,
  SearchRouteSceneStackShellSpec,
} from './searchOverlayRouteHostContract';
import {
  areSearchRouteSceneBodyContentSpecsEqual,
  areSearchRouteSceneBodyTransportSpecsEqual,
} from './searchOverlayRouteHostContract';
import type { OverlayKey } from './types';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from '../navigation/runtime/app-route-nav-silhouette-authority';

type AnimatedNumberLike = { value: number };

export type SearchRouteSceneStackFrameEntry = {
  sceneKey: OverlayKey;
  shellSpec: SearchRouteSceneStackShellSpec | null;
};

export type SearchRouteSceneStackBodyContentEntry = {
  sceneKey: OverlayKey;
  bodyContentSpec: SearchRouteSceneBodyContentSpec;
};

export type SearchRouteSceneStackBodyTransportEntry = {
  sceneKey: OverlayKey;
  bodyTransportSpec: SearchRouteSceneBodyTransportSpec;
};

export type SearchRouteSceneStackChromeEntry = {
  sceneKey: OverlayKey;
  surfaceKind: 'inline' | 'mounted';
  mountedChromeKey: SearchRouteMountedSceneChromeKey | null;
  excludedSurfaces?: readonly SearchRouteMountedSceneChromeSurface[];
  underlayComponent: SearchRouteInlineSceneChromePublication['underlayComponent'];
  backgroundComponent: SearchRouteInlineSceneChromePublication['backgroundComponent'];
  headerComponent: SearchRouteInlineSceneChromePublication['headerComponent'];
  overlayComponent: SearchRouteInlineSceneChromePublication['overlayComponent'];
};

export type SearchRouteSceneStackPresentationState = {
  // Residue-kill item 12: sheetTopY/scroll left this contract — position is the
  // track's own publication; this state is a presence token + momentum lane only.
  sheetMomentum: SharedValue<boolean>;
};

export type SearchRouteSceneStackChromeVisualState = {
  searchSurfacePageBundleProgress: AnimatedNumberLike;
  navBarCutoutHeight: number;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutHidingProgress: SharedValue<number> | DerivedValue<number>;
  bottomNavHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetExclusionModeValue:
    | SharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>
    | DerivedValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
};

export const areSearchRouteSceneStackBodyContentEntriesEqual = (
  left: SearchRouteSceneStackBodyContentEntry | null,
  right: SearchRouteSceneStackBodyContentEntry | null
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null || left.sceneKey !== right.sceneKey) {
    return false;
  }
  return areSearchRouteSceneBodyContentSpecsEqual(left.bodyContentSpec, right.bodyContentSpec);
};

export const areSearchRouteSceneStackBodyTransportEntriesEqual = (
  left: SearchRouteSceneStackBodyTransportEntry | null,
  right: SearchRouteSceneStackBodyTransportEntry | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    areSearchRouteSceneBodyTransportSpecsEqual(left.bodyTransportSpec, right.bodyTransportSpec));

export const createSearchRouteSceneStackBodyContentEntry = ({
  sceneKey,
  bodyContentSpec,
}: {
  sceneKey: OverlayKey;
  bodyContentSpec: SearchRouteSceneBodyContentSpec | null;
}): SearchRouteSceneStackBodyContentEntry | null =>
  bodyContentSpec == null
    ? null
    : {
        sceneKey,
        bodyContentSpec,
      };

export const createSearchRouteSceneStackBodyTransportEntry = ({
  sceneKey,
  bodyTransportSpec,
}: {
  sceneKey: OverlayKey;
  bodyTransportSpec: SearchRouteSceneBodyTransportSpec | null;
}): SearchRouteSceneStackBodyTransportEntry | null =>
  bodyTransportSpec == null
    ? null
    : {
        sceneKey,
        bodyTransportSpec,
      };
