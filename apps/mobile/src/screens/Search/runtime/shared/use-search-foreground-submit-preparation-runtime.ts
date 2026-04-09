import React from 'react';

import type { UseSearchForegroundInteractionRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundSubmitPreparationRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  | 'captureSearchSessionOrigin'
  | 'ensureSearchOverlay'
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'dismissSearchKeyboard'
  | 'beginSubmitTransition'
  | 'resetFocusedMapState'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'setRestaurantOnlyIntent'
  | 'isSuggestionPanelActive'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
>;

export type SearchForegroundSubmitPreparationRuntime = {
  prepareSubmitChrome: (options?: { captureOrigin?: boolean }) => void;
  prepareRecentIntentSubmit: (queryValue: string) => void;
};

export const useSearchForegroundSubmitPreparationRuntime = ({
  captureSearchSessionOrigin,
  ensureSearchOverlay,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  resetFocusedMapState,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  setRestaurantOnlyIntent,
  isSuggestionPanelActive,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
}: UseSearchForegroundSubmitPreparationRuntimeArgs): SearchForegroundSubmitPreparationRuntime => {
  const prepareSubmitChrome = React.useCallback(
    (options?: { captureOrigin?: boolean }) => {
      if (options?.captureOrigin) {
        captureSearchSessionOrigin();
      }
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      allowSearchBlurExitRef.current = true;
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      if (isSuggestionPanelActive) {
        const shouldDeferSuggestionClear = beginSubmitTransition();
        if (typeof React.startTransition === 'function') {
          React.startTransition(() => {
            setIsSuggestionPanelActive(false);
          });
        } else {
          setIsSuggestionPanelActive(false);
        }
        if (!shouldDeferSuggestionClear) {
          setShowSuggestions(false);
          setSuggestions([]);
        }
      }
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      resetFocusedMapState();
      setRestaurantOnlyIntent(null);
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      captureSearchSessionOrigin,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      isSuggestionPanelActive,
      resetFocusedMapState,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setRestaurantOnlyIntent,
      setShowSuggestions,
      setSuggestions,
      suppressAutocompleteResults,
    ]
  );

  const prepareRecentIntentSubmit = React.useCallback(
    (queryValue: string) => {
      captureSearchSessionOrigin();
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      allowSearchBlurExitRef.current = true;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      cancelAutocomplete();
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(queryValue);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      resetFocusedMapState();
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      cancelAutocomplete,
      captureSearchSessionOrigin,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      resetFocusedMapState,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setShowSuggestions,
      setSuggestions,
      suppressAutocompleteResults,
    ]
  );

  return {
    prepareSubmitChrome,
    prepareRecentIntentSubmit,
  };
};
