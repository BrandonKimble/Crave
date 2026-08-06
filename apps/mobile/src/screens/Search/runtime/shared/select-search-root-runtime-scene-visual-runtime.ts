import type { SearchRootSearchSceneVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';

export const selectSearchRootRuntimeSceneVisualRuntime = ({
  foregroundVisualRuntime,
}: {
  foregroundVisualRuntime: SearchForegroundVisualRuntime;
}): SearchRootSearchSceneVisualRuntime => ({
  resultsSheetVisibilityAnimatedStyle: foregroundVisualRuntime.resultsSheetVisibilityAnimatedStyle,
});
