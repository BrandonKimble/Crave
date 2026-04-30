import type { SearchSuggestionLayoutVisualRuntime } from '../shared/use-search-suggestion-surface-runtime-contract';

type SearchSuggestionLayoutVisualRuntimeValue = SearchSuggestionLayoutVisualRuntime;

export const createSearchSuggestionLayoutVisualRuntimeValue = ({
  resetSearchHeaderFocusProgress,
  searchHeaderFocusProgress,
  suggestionHeaderHeightAnimatedStyle,
  suggestionScrollTopAnimatedStyle,
  suggestionScrollMaxHeightAnimatedStyle,
  suggestionHeaderDividerAnimatedStyle,
  suggestionScrollHandler,
  suggestionTopFillHeight,
  suggestionScrollMaxHeightTarget,
}: SearchSuggestionLayoutVisualRuntimeValue): SearchSuggestionLayoutVisualRuntimeValue => ({
  resetSearchHeaderFocusProgress,
  searchHeaderFocusProgress,
  suggestionHeaderHeightAnimatedStyle,
  suggestionScrollTopAnimatedStyle,
  suggestionScrollMaxHeightAnimatedStyle,
  suggestionHeaderDividerAnimatedStyle,
  suggestionScrollHandler,
  suggestionTopFillHeight,
  suggestionScrollMaxHeightTarget,
});
