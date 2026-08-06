import React from 'react';

import type { SearchForegroundSubmitRuntimeArgs } from './search-foreground-interaction-runtime-contract';

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
      if (!shouldDeferSuggestionClear) {
        setSuggestions([]);
      }
    }
    setIsSearchFocused(false);
    // F1030: the panel teardown write is hoisted out of the branch — ONE call, always
    // deprioritized, instead of a startTransition write inside the branch that an
    // unconditional urgent write seven lines below fully defeated.
    if (typeof React.startTransition === 'function') {
      React.startTransition(() => {
        setIsSuggestionPanelActive(false);
      });
    } else {
      setIsSuggestionPanelActive(false);
    }
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
