import React from 'react';

import type { SearchForegroundSuggestionLayoutInputs } from './search-foreground-chrome-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlaySuggestionShellVisualRuntime } from './search-root-visual-runtime-contract';

export const useSearchRootOverlaySuggestionShellLayoutRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  visualRuntime,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  visualRuntime: SearchRootOverlaySuggestionShellVisualRuntime;
}): SearchForegroundSuggestionLayoutInputs => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      shouldDisableSearchBlur: false,
      shouldShowSuggestionSurface: suggestionRuntime.shouldShowSuggestionSurface,
      resolvedSuggestionHeaderHoles: suggestionRuntime.resolvedSuggestionHeaderHoles,
      shouldDriveSuggestionLayout: suggestionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: suggestionRuntime.shouldShowSuggestionBackground,
      suggestionTopFillHeight: suggestionRuntime.suggestionTopFillHeight,
      suggestionScrollMaxHeightTarget: suggestionRuntime.suggestionScrollMaxHeightTarget,
      searchLayoutTop: suggestionRuntime.searchLayout.top,
      searchLayoutHeight: suggestionRuntime.searchLayout.height,
      navBarHeight: visualRuntime.navBarHeight,
      bottomInset: rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.bottomInset,
    }),
    [
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.bottomInset,
      suggestionRuntime.resolvedSuggestionHeaderHoles,
      suggestionRuntime.searchLayout.height,
      suggestionRuntime.searchLayout.top,
      suggestionRuntime.shouldDriveSuggestionLayout,
      suggestionRuntime.shouldShowSuggestionBackground,
      suggestionRuntime.shouldShowSuggestionSurface,
      suggestionRuntime.suggestionScrollMaxHeightTarget,
      suggestionRuntime.suggestionTopFillHeight,
      visualRuntime.navBarHeight,
    ]
  );
};
