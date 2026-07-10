import React from 'react';

import type { SearchForegroundSubmitRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchForegroundSubmitPreparationRuntime = {
  prepareSubmitChrome: () => void;
  prepareRecentIntentSubmit: (queryValue: string) => void;
};

export const useSearchForegroundSubmitPreparationRuntime = ({
  isSuggestionPanelActive,
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
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
}: Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'isSuggestionPanelActive'
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
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
>): SearchForegroundSubmitPreparationRuntime => {
  const prepareSubmitChrome = React.useCallback(() => {
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
  }, [
    allowSearchBlurExitRef,
    beginSubmitTransition,
    dismissSearchKeyboard,
    ignoreNextSearchBlurRef,
    isSearchEditingRef,
    isSuggestionPanelActive,
    resetFocusedMapState,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    suppressAutocompleteResults,
  ]);

  const prepareRecentIntentSubmit = React.useCallback(
    (queryValue: string) => {
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
