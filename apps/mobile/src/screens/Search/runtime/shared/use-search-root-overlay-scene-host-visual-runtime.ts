import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type { SearchRootOverlaySceneHostVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';

export const useSearchRootOverlaySceneHostVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
}): SearchRootOverlaySceneHostVisualRuntime => ({
  shouldHideBottomNavForRender: foregroundVisualRuntime.shouldHideBottomNavForRender,
  navBarHeight: foregroundVisualRuntime.navBarHeight,
  searchSurfaceAnimatedStyle: foregroundVisualRuntime.searchSurfaceAnimatedStyle,
  suggestionPanelAnimatedStyle: foregroundVisualRuntime.suggestionPanelAnimatedStyle,
  searchBarInputAnimatedStyle: appRouteSceneChromeMotionRuntime.searchBarInputAnimatedStyle,
  searchBarContainerAnimatedStyle: foregroundVisualRuntime.searchBarContainerAnimatedStyle,
  shouldShowSearchThisArea: foregroundVisualRuntime.shouldShowSearchThisArea,
  searchThisAreaTop: foregroundVisualRuntime.searchThisAreaTop,
  searchThisAreaAnimatedStyle: foregroundVisualRuntime.searchThisAreaAnimatedStyle,
});
