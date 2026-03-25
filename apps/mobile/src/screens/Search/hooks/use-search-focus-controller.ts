import React from 'react';
import type { TextInput } from 'react-native';

type UseSearchFocusControllerArgs<TSuggestion> = {
  inputRef: React.RefObject<TextInput | null>;
  isSuggestionPanelActive: boolean;
  searchBackdropTarget: 'default' | 'results';
  isSearchSessionActive: boolean;
  isRestaurantOverlayVisible: boolean;
  isSearchLoading: boolean;
  showPollsOverlay: boolean;
  query: string;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  cancelSearchEditOnBackRef: React.MutableRefObject<boolean>;
  restoreHomeOnSearchBackRef: React.MutableRefObject<boolean>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  captureSearchSessionQuery: () => void;
  dismissTransientOverlays: () => void;
  allowAutocompleteResults: () => void;
  suppressAutocompleteResults: () => void;
  beginSuggestionCloseHold: (variant?: 'default' | 'submitting') => boolean;
  cancelAutocomplete: () => void;
  restoreDockedPolls: () => void;
  enterEditing: () => void;
  exitEditing: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<TSuggestion[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
};

type UseSearchFocusControllerResult = {
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleSearchBack: () => void;
};

export const useSearchFocusController = <TSuggestion>({
  inputRef,
  isSuggestionPanelActive,
  searchBackdropTarget,
  isSearchSessionActive,
  isRestaurantOverlayVisible,
  isSearchLoading,
  showPollsOverlay,
  query,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  cancelSearchEditOnBackRef,
  restoreHomeOnSearchBackRef,
  searchSessionQueryRef,
  captureSearchSessionQuery,
  dismissTransientOverlays,
  allowAutocompleteResults,
  suppressAutocompleteResults,
  beginSuggestionCloseHold,
  cancelAutocomplete,
  restoreDockedPolls,
  enterEditing,
  exitEditing,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setSuggestions,
  setQuery,
}: UseSearchFocusControllerArgs<TSuggestion>): UseSearchFocusControllerResult => {
  const shouldTreatSearchAsResults = searchBackdropTarget === 'results' && isSearchSessionActive;

  const handleSearchFocus = React.useCallback(() => {
    enterEditing();
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
    enterEditing,
    isSearchEditingRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
  ]);

  const handleSearchBlur = React.useCallback(() => {
    if (!allowSearchBlurExitRef.current && isSuggestionPanelActive) {
      ignoreNextSearchBlurRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
      return;
    }
    allowSearchBlurExitRef.current = false;
    setIsSearchFocused(false);
    if (cancelSearchEditOnBackRef.current) {
      isSearchEditingRef.current = false;
      cancelSearchEditOnBackRef.current = false;
      ignoreNextSearchBlurRef.current = false;
      const shouldDeferSuggestionClear = beginSuggestionCloseHold(
        shouldTreatSearchAsResults || isRestaurantOverlayVisible ? 'submitting' : 'default'
      );
      setIsAutocompleteSuppressed(true);
      setIsSuggestionPanelActive(false);
      exitEditing();
      const nextQuery = searchSessionQueryRef.current.trim();
      if (shouldTreatSearchAsResults && nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      return;
    }
    if (ignoreNextSearchBlurRef.current) {
      ignoreNextSearchBlurRef.current = false;
      return;
    }
    isSearchEditingRef.current = false;
    const shouldRestoreHome = restoreHomeOnSearchBackRef.current;
    restoreHomeOnSearchBackRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    exitEditing();
    if (!shouldDeferSuggestionClear && !shouldRestoreHome) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    if (shouldRestoreHome && !isSearchSessionActive) {
      cancelAutocomplete();
      setIsAutocompleteSuppressed(false);
      if (!showPollsOverlay && !isSearchLoading) {
        restoreDockedPolls();
      }
      return;
    }
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    cancelAutocomplete,
    cancelSearchEditOnBackRef,
    exitEditing,
    ignoreNextSearchBlurRef,
    inputRef,
    isRestaurantOverlayVisible,
    isSearchEditingRef,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    query,
    restoreDockedPolls,
    restoreHomeOnSearchBackRef,
    searchBackdropTarget,
    searchSessionQueryRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    setShowSuggestions,
    setSuggestions,
    shouldTreatSearchAsResults,
    showPollsOverlay,
  ]);

  const handleSearchBack = React.useCallback(() => {
    suppressAutocompleteResults();
    if (!shouldTreatSearchAsResults) {
      ignoreNextSearchBlurRef.current = false;
      cancelSearchEditOnBackRef.current = false;
      restoreHomeOnSearchBackRef.current = true;
      allowSearchBlurExitRef.current = true;
      if (inputRef.current?.isFocused?.()) {
        inputRef.current?.blur();
        return;
      }
      handleSearchBlur();
      return;
    }
    ignoreNextSearchBlurRef.current = false;
    cancelSearchEditOnBackRef.current = true;
    allowSearchBlurExitRef.current = true;
    if (inputRef.current?.isFocused?.()) {
      inputRef.current?.blur();
      return;
    }
    handleSearchBlur();
  }, [
    allowSearchBlurExitRef,
    cancelSearchEditOnBackRef,
    handleSearchBlur,
    ignoreNextSearchBlurRef,
    inputRef,
    restoreHomeOnSearchBackRef,
    searchBackdropTarget,
    shouldTreatSearchAsResults,
    suppressAutocompleteResults,
  ]);

  return {
    handleSearchFocus,
    handleSearchBlur,
    handleSearchBack,
  };
};
