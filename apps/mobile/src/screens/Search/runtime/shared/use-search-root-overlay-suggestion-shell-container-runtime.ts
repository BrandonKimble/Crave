import React from 'react';

import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
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
  // F1336(a): `rootOverlayFoundationRuntime` was declared on this arg type and never
  // destructured — the caller computed and passed it on every render for nothing. Removed
  // here and at the call site.
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
