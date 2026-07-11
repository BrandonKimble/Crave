import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type {
  SearchRootSurfaceBundleVisualRuntime,
  SearchRootHostVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchRootOverlayHostRouteVisualRuntime } from './use-search-root-overlay-host-route-visual-runtime';
import { useSearchRootOverlaySceneHostVisualRuntime } from './use-search-root-overlay-scene-host-visual-runtime';

export const useSearchRootRuntimeHostVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  surfaceBundleVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  surfaceBundleVisualRuntime: SearchRootSurfaceBundleVisualRuntime;
}): SearchRootHostVisualRuntime => ({
  routeHostVisualRuntime: useSearchRootOverlayHostRouteVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
    surfaceBundleVisualRuntime,
  }),
  overlayHostVisualRuntime: {
    statusBarFadeHeight: foregroundVisualRuntime.statusBarFadeHeight,
    overlayBackdropDimProgress: appRouteSceneChromeMotionRuntime.overlayBackdropDimProgress,
    overlayBackdropSheetTopY: appRouteSceneChromeMotionRuntime.overlayBackdropSheetTopY,
    bottomNavMotionRuntime: foregroundVisualRuntime.bottomNavMotionRuntime,
    shouldHideBottomNavForRender: foregroundVisualRuntime.shouldHideBottomNavForRender,
    shouldMountSearchShortcuts: foregroundVisualRuntime.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      foregroundVisualRuntime.shouldEnableSearchShortcutsInteraction,
    searchShortcutsAnimatedStyle: foregroundVisualRuntime.searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle: foregroundVisualRuntime.searchShortcutChipAnimatedStyle,
    searchShortcutContentAnimatedStyle: foregroundVisualRuntime.searchShortcutContentAnimatedStyle,
  },
  overlaySceneHostVisualRuntime: useSearchRootOverlaySceneHostVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
  }),
});
