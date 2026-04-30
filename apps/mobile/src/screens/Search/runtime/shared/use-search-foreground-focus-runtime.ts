import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundFocusRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'captureSearchSessionQuery'
  | 'dismissTransientOverlays'
  | 'allowAutocompleteResults'
  | 'requestSearchPresentationIntent'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setIsAutocompleteSuppressed'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
>;

type SearchForegroundFocusRuntime = Pick<
  SearchForegroundInteractionEditingHandlers,
  'handleSearchFocus'
>;

export const useSearchForegroundFocusRuntime = ({
  captureSearchSessionQuery,
  dismissTransientOverlays,
  allowAutocompleteResults,
  requestSearchPresentationIntent,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  isSearchEditingRef,
  allowSearchBlurExitRef,
}: UseSearchForegroundFocusRuntimeArgs): SearchForegroundFocusRuntime => {
  const handleSearchFocus = React.useCallback(() => {
    requestSearchPresentationIntent({ kind: 'focus_editing' });
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
    setIsAutocompleteSuppressed(false);
  }, [
    allowAutocompleteResults,
    allowSearchBlurExitRef,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    isSearchEditingRef,
    requestSearchPresentationIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
  ]);

  return React.useMemo(
    () => ({
      handleSearchFocus,
    }),
    [handleSearchFocus]
  );
};
