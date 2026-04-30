import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type {
  SearchRootSearchSceneVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';

export const useSearchRootRuntimeSceneVisualRuntime = ({
  foregroundVisualRuntime,
  appRouteSceneChromeMotionRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
  appRouteSceneChromeMotionRuntime: AppRouteSceneChromeMotionRuntime;
}): SearchRootSearchSceneVisualRuntime => ({
  overlayHeaderActionProgress:
    appRouteSceneChromeMotionRuntime.overlayHeaderActionProgress,
  resultsSheetVisibilityAnimatedStyle:
    foregroundVisualRuntime.resultsSheetVisibilityAnimatedStyle,
  resultsWashAnimatedStyle: foregroundVisualRuntime.resultsWashAnimatedStyle,
});
