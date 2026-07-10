import React from 'react';

import { createSearchForegroundSubmitHandlersRuntimeValue } from '../controller/search-foreground-submit-runtime';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundDirectSubmitRuntime } from './use-search-foreground-direct-submit-runtime';
import { useSearchForegroundRecentSubmitRuntime } from './use-search-foreground-recent-submit-runtime';
import { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

export const useSearchForegroundSubmitRuntime = ({
  submitRuntime,
  query,
  suggestions,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  isSuggestionPanelActive,
  shouldShowDockedPollsRef,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  resetFocusedMapState,
  resetMapMoveFlag,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  setRestaurantOnlyIntent,
  pendingRestaurantSelectionRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  deferRecentSearchUpsert,
  openRestaurantProfilePreview,
  openPollDetail,
}: SearchForegroundSubmitRuntimeArgs): SearchForegroundInteractionSubmitHandlers => {
  const submitPreparationRuntime = useSearchForegroundSubmitPreparationRuntime({
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
    setRestaurantOnlyIntent,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
  });

  const directSubmitRuntime = useSearchForegroundDirectSubmitRuntime({
    submitRuntime,
    query,
    suggestions,
    submittedQuery,
    searchMode,
    activeTab,
    hasResults,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    isSuggestionPanelActive,
    shouldShowDockedPollsRef,
    suppressAutocompleteResults,
    cancelAutocomplete,
    dismissSearchKeyboard,
    beginSubmitTransition,
    resetFocusedMapState,
    resetMapMoveFlag,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setQuery,
    setRestaurantOnlyIntent,
    pendingRestaurantSelectionRef,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    openRestaurantProfilePreview,
    openPollDetail,
    submitPreparationRuntime,
  });

  const recentSubmitRuntime = useSearchForegroundRecentSubmitRuntime({
    submitRuntime,
    isSuggestionPanelActive,
    pendingRestaurantSelectionRef,
    setRestaurantOnlyIntent,
    deferRecentSearchUpsert,
    openRestaurantProfilePreview,
    submitPreparationRuntime,
  });

  return React.useMemo(
    () =>
      createSearchForegroundSubmitHandlersRuntimeValue({
        ...directSubmitRuntime,
        ...recentSubmitRuntime,
      }),
    [directSubmitRuntime, recentSubmitRuntime]
  );
};
