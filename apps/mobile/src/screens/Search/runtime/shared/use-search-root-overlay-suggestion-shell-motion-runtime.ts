import React from 'react';

import type { SearchForegroundSuggestionMotionInputs } from './search-foreground-chrome-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlaySuggestionShellVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlaySuggestionShellMotionRuntime = ({
  stateFoundationLane,
  visualRuntime,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  visualRuntime: SearchRootOverlaySuggestionShellVisualRuntime;
}): SearchForegroundSuggestionMotionInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      searchSurfaceAnimatedStyle: visualRuntime.searchSurfaceAnimatedStyle,
      suggestionHeaderHeightAnimatedStyle: suggestionRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionPanelAnimatedStyle: visualRuntime.suggestionPanelAnimatedStyle,
      suggestionScrollTopAnimatedStyle: suggestionRuntime.suggestionScrollTopAnimatedStyle,
      suggestionScrollMaxHeightAnimatedStyle:
        suggestionRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionHeaderDividerAnimatedStyle: suggestionRuntime.suggestionHeaderDividerAnimatedStyle,
    }),
    [
      suggestionRuntime.suggestionHeaderDividerAnimatedStyle,
      suggestionRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionRuntime.suggestionScrollTopAnimatedStyle,
      visualRuntime.searchSurfaceAnimatedStyle,
      visualRuntime.suggestionPanelAnimatedStyle,
    ]
  );
};
