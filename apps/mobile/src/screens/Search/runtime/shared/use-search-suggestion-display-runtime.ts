import { AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';
import type {
  SearchSuggestionDisplayRuntime,
  SearchSuggestionDisplayRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionDisplayRuntime = ({
  query,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  isRecentLoading,
  isRecentlyViewedLoading,
  isRecentlyViewedFoodsLoading,
  isSuggestionPanelActive,
  isAutocompleteSuppressed,
  isAutocompleteLoading,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
}: SearchSuggestionDisplayRuntimeArgs): SearchSuggestionDisplayRuntime => {
  const isSuggestionClosing = isSuggestionPanelVisible && !isSuggestionPanelActive;
  const trimmedQuery = query.trim();
  const hasTypedQuery = trimmedQuery.length > 0;
  const baseShouldShowRecentSection = shouldDriveSuggestionLayout && !hasTypedQuery;
  const baseShouldRenderRecentSection =
    baseShouldShowRecentSection &&
    (recentSearches.length > 0 ||
      recentlyViewedRestaurants.length > 0 ||
      recentlyViewedFoods.length > 0 ||
      isRecentLoading ||
      isRecentlyViewedLoading ||
      isRecentlyViewedFoodsLoading);
  const baseShouldRenderAutocompleteSection =
    shouldDriveSuggestionLayout &&
    !isAutocompleteSuppressed &&
    trimmedQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const shouldSuppressAutocompletePanelWhileLoading =
    !isSuggestionClosing &&
    baseShouldRenderAutocompleteSection &&
    isAutocompleteLoading &&
    suggestions.length === 0;

  return {
    shouldShowSuggestionBackground: shouldDriveSuggestionLayout,
    baseShouldRenderAutocompleteSection,
    liveShouldRenderAutocompleteSection:
      !isSuggestionClosing &&
      baseShouldRenderAutocompleteSection &&
      !shouldSuppressAutocompletePanelWhileLoading,
    liveShouldRenderRecentSection: !isSuggestionClosing && baseShouldRenderRecentSection,
    shouldShowAutocompleteSpinnerInBar:
      baseShouldRenderAutocompleteSection && isAutocompleteLoading,
  };
};
