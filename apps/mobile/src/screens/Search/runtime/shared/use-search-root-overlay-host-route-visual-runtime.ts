import React from 'react';

import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type { AppRouteHostVisualRuntime } from '../../../../navigation/runtime/app-route-host-visual-runtime-contract';
import type {
  SearchRootSurfaceBundleVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';

export const useSearchRootOverlayHostRouteVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  surfaceBundleVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  surfaceBundleVisualRuntime: SearchRootSurfaceBundleVisualRuntime;
}): AppRouteHostVisualRuntime =>
  React.useMemo(
    () => ({
      navBarHeight: foregroundVisualRuntime.navBarHeight,
      navBarTop: foregroundVisualRuntime.navBarTop,
      bottomNavHiddenTranslateY: foregroundVisualRuntime.bottomNavHiddenTranslateY,
      overlayHeaderActionProgress:
        appRouteSceneChromeMotionRuntime.overlayHeaderActionProgress,
      searchSurfacePageBundleProgress:
        surfaceBundleVisualRuntime.searchSurfacePageBundleProgress,
      navBarCutoutProgress: foregroundVisualRuntime.navBarCutoutProgress,
      navBarCutoutHidingProgress: foregroundVisualRuntime.navBarCutoutHidingProgress,
      navBarCutoutIsHiding: foregroundVisualRuntime.navBarCutoutIsHiding,
      navTranslateY: foregroundVisualRuntime.navTranslateY,
      navSilhouetteSheetBodyExclusionHeight:
        foregroundVisualRuntime.navSilhouetteSheetBodyExclusionHeight,
      navSilhouetteSheetMaskHeight: foregroundVisualRuntime.navSilhouetteSheetMaskHeight,
      navSilhouetteSheetExclusionModeValue:
        foregroundVisualRuntime.navSilhouetteSheetExclusionModeValue,
    }),
    [
      appRouteSceneChromeMotionRuntime.overlayHeaderActionProgress,
      surfaceBundleVisualRuntime.searchSurfacePageBundleProgress,
      foregroundVisualRuntime.bottomNavHiddenTranslateY,
      foregroundVisualRuntime.navBarCutoutHidingProgress,
      foregroundVisualRuntime.navBarCutoutIsHiding,
      foregroundVisualRuntime.navBarCutoutProgress,
      foregroundVisualRuntime.navBarHeight,
      foregroundVisualRuntime.navBarTop,
      foregroundVisualRuntime.navTranslateY,
      foregroundVisualRuntime.navSilhouetteSheetBodyExclusionHeight,
      foregroundVisualRuntime.navSilhouetteSheetMaskHeight,
      foregroundVisualRuntime.navSilhouetteSheetExclusionModeValue,
    ]
  );
