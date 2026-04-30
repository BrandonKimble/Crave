import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundQuerySubmitRuntime } from './use-search-foreground-query-submit-runtime';
import { useSearchForegroundSearchAreaSubmitRuntime } from './use-search-foreground-search-area-submit-runtime';
import { useSearchForegroundSuggestionSubmitRuntime } from './use-search-foreground-suggestion-submit-runtime';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';
import { useSearchForegroundViewportShortcutRuntime } from './use-search-foreground-viewport-shortcut-runtime';

type UseSearchForegroundDirectSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'submittedQuery'
  | 'searchMode'
  | 'activeTab'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'shouldShowDockedPollsRef'
  | 'prepareSearchSessionEntry'
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'dismissSearchKeyboard'
  | 'beginSubmitTransition'
  | 'resetFocusedMapState'
  | 'resetMapMoveFlag'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'setRestaurantOnlyIntent'
  | 'pendingRestaurantSelectionRef'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'openRestaurantProfilePreview'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundDirectSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  | 'handleSubmit'
  | 'handleBestDishesHere'
  | 'handleBestRestaurantsHere'
  | 'handleSearchThisArea'
  | 'handleSuggestionPress'
>;

export const useSearchForegroundDirectSubmitRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  shouldShowDockedPollsRef,
  prepareSearchSessionEntry,
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
  submitPreparationRuntime,
}: UseSearchForegroundDirectSubmitRuntimeArgs): SearchForegroundDirectSubmitRuntime => {
  const querySubmitRuntime = useSearchForegroundQuerySubmitRuntime({
    submitRuntime,
    query,
    shouldShowDockedPollsRef,
    submitPreparationRuntime,
  });
  const viewportShortcutRuntime = useSearchForegroundViewportShortcutRuntime({
    submitRuntime,
    shouldShowDockedPollsRef,
    setQuery,
    submitPreparationRuntime,
  });
  const searchAreaSubmitRuntime = useSearchForegroundSearchAreaSubmitRuntime({
    submitRuntime,
    query,
    submittedQuery,
    searchMode,
    activeTab,
    hasResults,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    resetFocusedMapState,
    resetMapMoveFlag,
    setRestaurantOnlyIntent,
  });
  const suggestionSubmitRuntime = useSearchForegroundSuggestionSubmitRuntime({
    submitRuntime,
    query,
    prepareSearchSessionEntry,
    suppressAutocompleteResults,
    cancelAutocomplete,
    dismissSearchKeyboard,
    beginSubmitTransition,
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
  });

  return React.useMemo(
    () => ({
      handleSubmit: querySubmitRuntime.handleSubmit,
      handleBestDishesHere: viewportShortcutRuntime.handleBestDishesHere,
      handleBestRestaurantsHere: viewportShortcutRuntime.handleBestRestaurantsHere,
      handleSearchThisArea: searchAreaSubmitRuntime.handleSearchThisArea,
      handleSuggestionPress: suggestionSubmitRuntime.handleSuggestionPress,
    }),
    [
      querySubmitRuntime.handleSubmit,
      searchAreaSubmitRuntime.handleSearchThisArea,
      suggestionSubmitRuntime.handleSuggestionPress,
      viewportShortcutRuntime.handleBestDishesHere,
      viewportShortcutRuntime.handleBestRestaurantsHere,
    ]
  );
};
