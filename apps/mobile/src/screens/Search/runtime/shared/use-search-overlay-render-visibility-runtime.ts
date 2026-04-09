import React from 'react';

type UseSearchOverlayRenderVisibilityRuntimeArgs = {
  isSearchOverlay: boolean;
  shouldShowPollsSheet: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
};

export const useSearchOverlayRenderVisibilityRuntime = ({
  isSearchOverlay,
  shouldShowPollsSheet,
  showBookmarksOverlay,
  showProfileOverlay,
  showSaveListOverlay,
}: UseSearchOverlayRenderVisibilityRuntimeArgs): boolean =>
  React.useMemo(
    () =>
      isSearchOverlay ||
      shouldShowPollsSheet ||
      showBookmarksOverlay ||
      showProfileOverlay ||
      showSaveListOverlay,
    [
      isSearchOverlay,
      shouldShowPollsSheet,
      showBookmarksOverlay,
      showProfileOverlay,
      showSaveListOverlay,
    ]
  );
