import type {
  SearchForegroundInteractionSubmitHandlers,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundPrimarySubmitRuntime } from './use-search-foreground-primary-submit-runtime';
import { useSearchForegroundRecentSubmitRuntime } from './use-search-foreground-recent-submit-runtime';
import { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';
import { useSearchForegroundSuggestionSubmitRuntime } from './use-search-foreground-suggestion-submit-runtime';

type UseSearchForegroundSubmitRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'submittedQuery'
  | 'searchMode'
  | 'activeTab'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'isSuggestionPanelActive'
  | 'shouldShowDockedPolls'
  | 'captureSearchSessionOrigin'
  | 'ensureSearchOverlay'
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
  | 'deferRecentSearchUpsert'
  | 'openRestaurantProfilePreview'
>;

export const useSearchForegroundSubmitRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  isSuggestionPanelActive,
  shouldShowDockedPolls,
  captureSearchSessionOrigin,
  ensureSearchOverlay,
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
}: UseSearchForegroundSubmitRuntimeArgs): SearchForegroundInteractionSubmitHandlers => {
  const preparationRuntime = useSearchForegroundSubmitPreparationRuntime({
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
  });

  const primarySubmitRuntime = useSearchForegroundPrimarySubmitRuntime({
    submitRuntime,
    query,
    submittedQuery,
    searchMode,
    activeTab,
    hasResults,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    shouldShowDockedPolls,
    resetFocusedMapState,
    resetMapMoveFlag,
    setQuery,
    setRestaurantOnlyIntent,
    preparationRuntime,
  });

  const suggestionSubmitRuntime = useSearchForegroundSuggestionSubmitRuntime({
    submitRuntime,
    query,
    captureSearchSessionOrigin,
    ensureSearchOverlay,
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

  const recentSubmitRuntime = useSearchForegroundRecentSubmitRuntime({
    submitRuntime,
    setRestaurantOnlyIntent,
    pendingRestaurantSelectionRef,
    deferRecentSearchUpsert,
    openRestaurantProfilePreview,
    preparationRuntime,
  });

  return {
    ...primarySubmitRuntime,
    ...suggestionSubmitRuntime,
    ...recentSubmitRuntime,
  };
};
