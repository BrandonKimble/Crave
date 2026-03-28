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
    if (ignoreNextSearchBlurRef.current) {
      ignoreNextSearchBlurRef.current = false;
      return;
    }
    isSearchEditingRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    exitEditing();
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    exitEditing,
    ignoreNextSearchBlurRef,
    inputRef,
    isRestaurantOverlayVisible,
    isSearchEditingRef,
    isSuggestionPanelActive,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    shouldTreatSearchAsResults,
  ]);

  const performImmediateSearchBack = React.useCallback(() => {
    setIsSearchFocused(false);
    isSearchEditingRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      shouldTreatSearchAsResults || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    exitEditing();
    if (shouldTreatSearchAsResults) {
      setIsAutocompleteSuppressed(true);
      const nextQuery = searchSessionQueryRef.current.trim();
      if (nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      return;
    }
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    if (!isSearchSessionActive) {
      cancelAutocomplete();
      setIsAutocompleteSuppressed(false);
      if (!showPollsOverlay && !isSearchLoading) {
        restoreDockedPolls();
      }
    }
  }, [
    beginSuggestionCloseHold,
    cancelAutocomplete,
    exitEditing,
    isRestaurantOverlayVisible,
    isSearchEditingRef,
    isSearchLoading,
    isSearchSessionActive,
    query,
    restoreDockedPolls,
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
    allowSearchBlurExitRef.current = false;
    ignoreNextSearchBlurRef.current = true;
    performImmediateSearchBack();
    if (inputRef.current?.isFocused?.()) {
      inputRef.current?.blur();
    }
  }, [
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    inputRef,
    performImmediateSearchBack,
    suppressAutocompleteResults,
  ]);

  return {
    handleSearchFocus,
    handleSearchBlur,
    handleSearchBack,
  };
};
