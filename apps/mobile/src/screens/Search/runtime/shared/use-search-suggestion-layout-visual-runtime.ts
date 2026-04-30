import React from 'react';

import { createSearchSuggestionLayoutVisualRuntimeValue } from '../controller/search-suggestion-layout-visual-runtime';
import type {
  SearchSuggestionLayoutVisualRuntime,
  SearchSuggestionLayoutVisualRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';
import { useSearchSuggestionLayoutAnimationRuntime } from './use-search-suggestion-layout-animation-runtime';
import { useSearchSuggestionLayoutGeometryRuntime } from './use-search-suggestion-layout-geometry-runtime';

export const useSearchSuggestionLayoutVisualRuntime = ({
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldDriveSuggestionLayout,
  shouldShowSuggestionBackground,
  searchLayout,
  suggestionContentHeight,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutLayout,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
}: SearchSuggestionLayoutVisualRuntimeArgs): SearchSuggestionLayoutVisualRuntime => {
  const suggestionLayoutGeometryRuntime = useSearchSuggestionLayoutGeometryRuntime({
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground,
    searchLayout,
    suggestionContentHeight,
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutLayout,
    resolvedSearchContainerFrame,
    resolvedSearchShortcutsFrame,
  });

  const suggestionLayoutAnimationRuntime = useSearchSuggestionLayoutAnimationRuntime({
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    shouldDriveSuggestionLayout,
    suggestionHeaderHeightTarget:
      suggestionLayoutGeometryRuntime.suggestionHeaderHeightTarget,
    suggestionScrollTopTarget:
      suggestionLayoutGeometryRuntime.suggestionScrollTopTarget,
    suggestionScrollMaxHeightTarget:
      suggestionLayoutGeometryRuntime.suggestionScrollMaxHeightTarget,
  });

  return React.useMemo(
    () =>
      createSearchSuggestionLayoutVisualRuntimeValue({
        resetSearchHeaderFocusProgress:
          suggestionLayoutAnimationRuntime.resetSearchHeaderFocusProgress,
        searchHeaderFocusProgress:
          suggestionLayoutAnimationRuntime.searchHeaderFocusProgress,
        suggestionHeaderHeightAnimatedStyle:
          suggestionLayoutAnimationRuntime.suggestionHeaderHeightAnimatedStyle,
        suggestionScrollTopAnimatedStyle:
          suggestionLayoutAnimationRuntime.suggestionScrollTopAnimatedStyle,
        suggestionScrollMaxHeightAnimatedStyle:
          suggestionLayoutAnimationRuntime.suggestionScrollMaxHeightAnimatedStyle,
        suggestionHeaderDividerAnimatedStyle:
          suggestionLayoutAnimationRuntime.suggestionHeaderDividerAnimatedStyle,
        suggestionScrollHandler:
          suggestionLayoutAnimationRuntime.suggestionScrollHandler,
        suggestionTopFillHeight:
          suggestionLayoutGeometryRuntime.suggestionTopFillHeight,
        suggestionScrollMaxHeightTarget:
          suggestionLayoutGeometryRuntime.suggestionScrollMaxHeightTarget,
      }),
    [
      suggestionLayoutAnimationRuntime.resetSearchHeaderFocusProgress,
      suggestionLayoutAnimationRuntime.searchHeaderFocusProgress,
      suggestionLayoutAnimationRuntime.suggestionHeaderDividerAnimatedStyle,
      suggestionLayoutAnimationRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionLayoutAnimationRuntime.suggestionScrollHandler,
      suggestionLayoutAnimationRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionLayoutAnimationRuntime.suggestionScrollTopAnimatedStyle,
      suggestionLayoutGeometryRuntime.suggestionScrollMaxHeightTarget,
      suggestionLayoutGeometryRuntime.suggestionTopFillHeight,
    ]
  );
};
