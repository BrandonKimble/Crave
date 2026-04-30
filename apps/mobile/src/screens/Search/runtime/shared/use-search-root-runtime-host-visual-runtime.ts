import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type {
  SearchRootCloseHandoffVisualRuntime,
  SearchRootHostVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchRootOverlayHostRouteVisualRuntime } from './use-search-root-overlay-host-route-visual-runtime';
import { useSearchRootOverlaySceneHostVisualRuntime } from './use-search-root-overlay-scene-host-visual-runtime';

export const useSearchRootRuntimeHostVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
  closeHandoffVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
  closeHandoffVisualRuntime: SearchRootCloseHandoffVisualRuntime;
}): SearchRootHostVisualRuntime => ({
  routeHostVisualRuntime: useSearchRootOverlayHostRouteVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
    closeHandoffVisualRuntime,
  }),
  overlayHostVisualRuntime: {
    statusBarFadeHeight: foregroundVisualRuntime.statusBarFadeHeight,
    overlayBackdropDimProgress:
      appRouteSceneChromeMotionRuntime.overlayBackdropDimProgress,
    bottomNavAnimatedStyle: foregroundVisualRuntime.bottomNavAnimatedStyle,
    shouldHideBottomNavForRender:
      foregroundVisualRuntime.shouldHideBottomNavForRender,
    bottomNavItemVisibilityAnimatedStyle:
      foregroundVisualRuntime.bottomNavItemVisibilityAnimatedStyle,
    shouldMountSearchShortcuts: foregroundVisualRuntime.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      foregroundVisualRuntime.shouldEnableSearchShortcutsInteraction,
    searchShortcutsAnimatedStyle:
      foregroundVisualRuntime.searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle:
      foregroundVisualRuntime.searchShortcutChipAnimatedStyle,
  },
  overlaySceneHostVisualRuntime: useSearchRootOverlaySceneHostVisualRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
  }),
});
