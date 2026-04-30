import React from 'react';

import type { SearchForegroundSubmitRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchForegroundSubmitPreparationRuntime = {
  prepareSubmitChrome: (options?: { captureOrigin?: boolean }) => void;
  prepareRecentIntentSubmit: (queryValue: string) => void;
};

export const useSearchForegroundSubmitPreparationRuntime = ({
  isSuggestionPanelActive,
  prepareSearchSessionEntry,
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
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
}: Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'prepareSearchSessionEntry'
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
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
>): SearchForegroundSubmitPreparationRuntime => {
  const prepareSubmitChrome = React.useCallback(
    (options?: { captureOrigin?: boolean }) => {
      prepareSearchSessionEntry({ captureOrigin: options?.captureOrigin });
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
      dismissSearchKeyboard,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      isSuggestionPanelActive,
      prepareSearchSessionEntry,
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
      prepareSearchSessionEntry({ captureOrigin: true });
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
      dismissSearchKeyboard,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      prepareSearchSessionEntry,
      resetFocusedMapState,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setShowSuggestions,
      setSuggestions,
      suppressAutocompleteResults,
    ]
  );

  return React.useMemo(
    () => ({
      prepareSubmitChrome,
      prepareRecentIntentSubmit,
    }),
    [prepareRecentIntentSubmit, prepareSubmitChrome]
  );
};
