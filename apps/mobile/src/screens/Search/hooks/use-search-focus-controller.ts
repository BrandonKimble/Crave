import React from 'react';
import type { TextInput } from 'react-native';

type UseSearchFocusControllerArgs<TSuggestion> = {
  inputRef: React.RefObject<TextInput | null>;
  isSuggestionPanelActive: boolean;
  isSearchSessionActive: boolean;
  isRestaurantOverlayVisible: boolean;
  isSearchLoading: boolean;
  showPollsOverlay: boolean;
  query: string;
  shouldShowSearchShortcuts: boolean;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  cancelSearchEditOnBackRef: React.MutableRefObject<boolean>;
  restoreHomeOnSearchBackRef: React.MutableRefObject<boolean>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  pendingResultsSheetRevealRef: React.MutableRefObject<boolean>;
  shortcutContentFadeMode: { value: number };
  shortcutFadeDefault: number;
  shortcutFadeHold: number;
  captureSearchSessionQuery: () => void;
  dismissTransientOverlays: () => void;
  allowAutocompleteResults: () => void;
  suppressAutocompleteResults: () => void;
  beginSuggestionCloseHold: (variant?: 'default' | 'submitting') => boolean;
  flushPendingResultsSheetReveal: () => void;
  cancelAutocomplete: () => void;
  restoreDockedPolls: () => void;
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
  isSearchSessionActive,
  isRestaurantOverlayVisible,
  isSearchLoading,
  showPollsOverlay,
  query,
  shouldShowSearchShortcuts,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  cancelSearchEditOnBackRef,
  restoreHomeOnSearchBackRef,
  searchSessionQueryRef,
  pendingResultsSheetRevealRef,
  shortcutContentFadeMode,
  shortcutFadeDefault,
  shortcutFadeHold,
  captureSearchSessionQuery,
  dismissTransientOverlays,
  allowAutocompleteResults,
  suppressAutocompleteResults,
  beginSuggestionCloseHold,
  flushPendingResultsSheetReveal,
  cancelAutocomplete,
  restoreDockedPolls,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setSuggestions,
  setQuery,
}: UseSearchFocusControllerArgs<TSuggestion>): UseSearchFocusControllerResult => {
  const handleSearchFocus = React.useCallback(() => {
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
        isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
      );
      setIsAutocompleteSuppressed(true);
      setIsSuggestionPanelActive(false);
      const nextQuery = searchSessionQueryRef.current.trim();
      if (isSearchSessionActive && nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      if (isSearchSessionActive) {
        flushPendingResultsSheetReveal();
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
      isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
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
      pendingResultsSheetRevealRef.current = false;
      return;
    }
    if (isSearchSessionActive) {
      flushPendingResultsSheetReveal();
    }
  }, [
    allowSearchBlurExitRef,
    beginSuggestionCloseHold,
    cancelAutocomplete,
    cancelSearchEditOnBackRef,
    flushPendingResultsSheetReveal,
    ignoreNextSearchBlurRef,
    inputRef,
    isRestaurantOverlayVisible,
    isSearchEditingRef,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    pendingResultsSheetRevealRef,
    query,
    restoreDockedPolls,
    restoreHomeOnSearchBackRef,
    searchSessionQueryRef,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    setShowSuggestions,
    setSuggestions,
    showPollsOverlay,
  ]);

  const handleSearchBack = React.useCallback(() => {
    suppressAutocompleteResults();
    if (!isSearchSessionActive) {
      ignoreNextSearchBlurRef.current = false;
      cancelSearchEditOnBackRef.current = false;
      restoreHomeOnSearchBackRef.current = true;
      allowSearchBlurExitRef.current = true;
      shortcutContentFadeMode.value = shouldShowSearchShortcuts
        ? shortcutFadeHold
        : shortcutFadeDefault;
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
    isSearchSessionActive,
    restoreHomeOnSearchBackRef,
    shortcutContentFadeMode,
    shortcutFadeDefault,
    shortcutFadeHold,
    shouldShowSearchShortcuts,
    suppressAutocompleteResults,
  ]);

  return {
    handleSearchFocus,
    handleSearchBlur,
    handleSearchBack,
  };
};
