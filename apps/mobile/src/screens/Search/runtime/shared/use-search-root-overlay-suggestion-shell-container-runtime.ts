import React from 'react';

import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlaySuggestionShellVisualRuntime } from './search-root-visual-runtime-contract';

export type SearchRootOverlaySuggestionShellContainerRuntime = {
  overlayContainerStyle: {
    paddingTop: number;
    paddingLeft: number;
    paddingRight: number;
  };
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
};

export const useSearchRootOverlaySuggestionShellContainerRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  visualRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  visualRuntime: SearchRootOverlaySuggestionShellVisualRuntime;
}): SearchRootOverlaySuggestionShellContainerRuntime => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;

  return React.useMemo(
    () => ({
      overlayContainerStyle: {
        paddingTop: appEntryPlaneRuntime.insets.top,
        paddingLeft: appEntryPlaneRuntime.insets.left,
        paddingRight: appEntryPlaneRuntime.insets.right,
      },
      isSuggestionOverlayVisible: suggestionRuntime.isSuggestionOverlayVisible,
      shouldHideBottomNavForRender: visualRuntime.shouldHideBottomNavForRender,
    }),
    [
      appEntryPlaneRuntime.insets.left,
      appEntryPlaneRuntime.insets.right,
      appEntryPlaneRuntime.insets.top,
      suggestionRuntime.isSuggestionOverlayVisible,
      visualRuntime.shouldHideBottomNavForRender,
    ]
  );
};
