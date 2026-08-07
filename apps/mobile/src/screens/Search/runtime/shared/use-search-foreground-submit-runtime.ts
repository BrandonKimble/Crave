import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './search-foreground-interaction-runtime-contract';
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
  shouldShowDockedSceneRef,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  resetFocusedMapState,
  resetMapMoveFlag,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setSuggestions,
  setQuery,
  setIsAutocompleteSuppressed,
  pendingRestaurantSelectionRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  deferRecentSearchUpsert,
  openRestaurantProfilePreview,
  openPollDetail,
  openUserProfile,
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
    setSuggestions,
    setQuery,
    setIsAutocompleteSuppressed,
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
    shouldShowDockedSceneRef,
    suppressAutocompleteResults,
    cancelAutocomplete,
    dismissSearchKeyboard,
    beginSubmitTransition,
    resetFocusedMapState,
    resetMapMoveFlag,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setSuggestions,
    setQuery,
    setIsAutocompleteSuppressed,
    pendingRestaurantSelectionRef,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    openRestaurantProfilePreview,
    openPollDetail,
    openUserProfile,
    submitPreparationRuntime,
  });

  const recentSubmitRuntime = useSearchForegroundRecentSubmitRuntime({
    submitRuntime,
    pendingRestaurantSelectionRef,
    deferRecentSearchUpsert,
    openRestaurantProfilePreview,
    submitPreparationRuntime,
  });

  /**
   * F1610: the repacker this replaced destructured EIGHT named fields, so it also acted as a
   * FILTER — anything extra on `directSubmitRuntime` / `recentSubmitRuntime` was dropped
   * before the value escaped. A naive `{ ...directSubmitRuntime, ...recentSubmitRuntime }`
   * inline would have preserved the type (spreads bypass excess-property checking) while
   * changing the RUNTIME value. The fields are therefore named explicitly here; the two
   * sources happen to partition them exactly today (5 + 3), and this literal is what keeps
   * that true rather than assuming it.
   */
  return React.useMemo<SearchForegroundInteractionSubmitHandlers>(
    () => ({
      handleSubmit: directSubmitRuntime.handleSubmit,
      handleBestDishesHere: directSubmitRuntime.handleBestDishesHere,
      handleBestRestaurantsHere: directSubmitRuntime.handleBestRestaurantsHere,
      handleSearchThisArea: directSubmitRuntime.handleSearchThisArea,
      handleSuggestionPress: directSubmitRuntime.handleSuggestionPress,
      handleRecentSearchPress: recentSubmitRuntime.handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress: recentSubmitRuntime.handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress: recentSubmitRuntime.handleRecentlyViewedFoodPress,
    }),
    [directSubmitRuntime, recentSubmitRuntime]
  );
};
