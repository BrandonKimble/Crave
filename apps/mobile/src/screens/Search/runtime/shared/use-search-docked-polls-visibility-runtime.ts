import React from 'react';

type UseSearchDockedPollsVisibilityRuntimeArgs = {
  isSearchOverlay: boolean;
  showPollsOverlay: boolean;
  isSuggestionPanelActive: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSearchOriginRestorePending: boolean;
  isDockedPollsDismissed: boolean;
};

type SearchDockedPollsVisibilityRuntime = {
  shouldShowDockedPollsTarget: boolean;
  shouldShowDockedPolls: boolean;
  shouldShowPollsSheet: boolean;
};

export const useSearchDockedPollsVisibilityRuntime = ({
  isSearchOverlay,
  showPollsOverlay,
  isSuggestionPanelActive,
  isSearchSessionActive,
  isSearchLoading,
  isSearchOriginRestorePending,
  isDockedPollsDismissed,
}: UseSearchDockedPollsVisibilityRuntimeArgs): SearchDockedPollsVisibilityRuntime => {
  const shouldShowDockedPollsTarget =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    !isSearchSessionActive &&
    !isSearchLoading &&
    !isSearchOriginRestorePending &&
    !isDockedPollsDismissed;
  const shouldShowDockedPolls = shouldShowDockedPollsTarget;
  const shouldShowPollsSheet = showPollsOverlay || shouldShowDockedPolls;

  return React.useMemo(
    () => ({
      shouldShowDockedPollsTarget,
      shouldShowDockedPolls,
      shouldShowPollsSheet,
    }),
    [shouldShowDockedPolls, shouldShowDockedPollsTarget, shouldShowPollsSheet]
  );
};
