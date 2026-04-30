import React from 'react';

import { useSearchSuggestionHeaderHolesRuntime } from './use-search-suggestion-header-holes-runtime';
import { useSearchSuggestionLayoutStateRuntime } from './use-search-suggestion-layout-state-runtime';
import { useSearchSuggestionLayoutVisualRuntime } from './use-search-suggestion-layout-visual-runtime';
import type {
  SearchSuggestionLayoutRuntime,
  SearchSuggestionVisibilityRuntime,
} from './use-search-suggestion-surface-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootSessionPrimitivesLane } from './use-search-root-session-runtime-contract';
import { getSearchStartupGeometrySeed } from './search-startup-geometry';

type UseSearchSuggestionLayoutPlaneRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  suggestionVisibilityRuntime: SearchSuggestionVisibilityRuntime;
};

export const useSearchSuggestionLayoutPlaneRuntime = ({
  rootPrimitivesRuntime,
  rootSessionPrimitivesLane,
  suggestionVisibilityRuntime,
}: UseSearchSuggestionLayoutPlaneRuntimeArgs): SearchSuggestionLayoutRuntime => {
  const startupGeometrySeed = React.useMemo(() => getSearchStartupGeometrySeed(), []);

  const suggestionLayoutStateRuntime = useSearchSuggestionLayoutStateRuntime({
    searchInteractionRef: rootSessionPrimitivesLane.primitives.searchInteractionRef,
    startupGeometrySeed,
    query: rootPrimitivesRuntime.searchState.query,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    shouldDriveSuggestionLayout: suggestionVisibilityRuntime.shouldDriveSuggestionLayout,
    shouldRenderSuggestionPanel: suggestionVisibilityRuntime.shouldRenderSuggestionPanel,
  });
  const suggestionLayoutVisualRuntime = useSearchSuggestionLayoutVisualRuntime({
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: suggestionVisibilityRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: suggestionVisibilityRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: suggestionVisibilityRuntime.shouldShowSuggestionBackground,
    searchLayout: suggestionLayoutStateRuntime.searchLayout,
    suggestionContentHeight: suggestionLayoutStateRuntime.suggestionContentHeight,
    shouldFreezeSuggestionHeader: suggestionLayoutStateRuntime.shouldFreezeSuggestionHeader,
    shouldIncludeShortcutLayout: suggestionLayoutStateRuntime.shouldIncludeShortcutLayout,
    resolvedSearchContainerFrame: suggestionLayoutStateRuntime.resolvedSearchContainerFrame,
    resolvedSearchShortcutsFrame: suggestionLayoutStateRuntime.resolvedSearchShortcutsFrame,
  });
  const suggestionHeaderHolesRuntime = useSearchSuggestionHeaderHolesRuntime({
    shouldDriveSuggestionLayout: suggestionLayoutStateRuntime.shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader: suggestionLayoutStateRuntime.shouldFreezeSuggestionHeader,
    shouldIncludeShortcutHoles: suggestionLayoutStateRuntime.shouldIncludeShortcutHoles,
    resolvedSearchContainerFrame: suggestionLayoutStateRuntime.resolvedSearchContainerFrame,
    resolvedSearchShortcutsFrame: suggestionLayoutStateRuntime.resolvedSearchShortcutsFrame,
    resolvedSearchShortcutChipFrames: suggestionLayoutStateRuntime.resolvedSearchShortcutChipFrames,
  });

  return React.useMemo(
    () => ({
      handleSuggestionContentSizeChange:
        suggestionLayoutStateRuntime.handleSuggestionContentSizeChange,
      searchLayout: suggestionLayoutStateRuntime.searchLayout,
      searchBarFrame: suggestionLayoutStateRuntime.searchBarFrame,
      resolvedSearchShortcutsFrame: suggestionLayoutStateRuntime.resolvedSearchShortcutsFrame,
      resolvedSearchShortcutChipFrames:
        suggestionLayoutStateRuntime.resolvedSearchShortcutChipFrames,
      handleSearchHeaderLayout: suggestionLayoutStateRuntime.handleSearchHeaderLayout,
      handleSearchContainerLayout: suggestionLayoutStateRuntime.handleSearchContainerLayout,
      handleSearchShortcutsRowLayout: suggestionLayoutStateRuntime.handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout: suggestionLayoutStateRuntime.handleRestaurantsShortcutLayout,
      handleDishesShortcutLayout: suggestionLayoutStateRuntime.handleDishesShortcutLayout,
      resetSearchHeaderFocusProgress: suggestionLayoutVisualRuntime.resetSearchHeaderFocusProgress,
      searchHeaderFocusProgress: suggestionLayoutVisualRuntime.searchHeaderFocusProgress,
      suggestionHeaderHeightAnimatedStyle:
        suggestionLayoutVisualRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionScrollTopAnimatedStyle:
        suggestionLayoutVisualRuntime.suggestionScrollTopAnimatedStyle,
      suggestionScrollMaxHeightAnimatedStyle:
        suggestionLayoutVisualRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionHeaderDividerAnimatedStyle:
        suggestionLayoutVisualRuntime.suggestionHeaderDividerAnimatedStyle,
      suggestionScrollHandler: suggestionLayoutVisualRuntime.suggestionScrollHandler,
      resolvedSuggestionHeaderHoles: suggestionHeaderHolesRuntime.resolvedSuggestionHeaderHoles,
      suggestionTopFillHeight: suggestionLayoutVisualRuntime.suggestionTopFillHeight,
      suggestionScrollMaxHeightTarget:
        suggestionLayoutVisualRuntime.suggestionScrollMaxHeightTarget,
    }),
    [
      suggestionHeaderHolesRuntime.resolvedSuggestionHeaderHoles,
      suggestionLayoutStateRuntime.resolvedSearchShortcutChipFrames,
      suggestionLayoutStateRuntime.resolvedSearchShortcutsFrame,
      suggestionLayoutStateRuntime.handleDishesShortcutLayout,
      suggestionLayoutStateRuntime.handleRestaurantsShortcutLayout,
      suggestionLayoutStateRuntime.handleSearchContainerLayout,
      suggestionLayoutStateRuntime.handleSearchHeaderLayout,
      suggestionLayoutStateRuntime.handleSearchShortcutsRowLayout,
      suggestionLayoutStateRuntime.handleSuggestionContentSizeChange,
      suggestionLayoutStateRuntime.searchBarFrame,
      suggestionLayoutStateRuntime.searchLayout,
      suggestionLayoutVisualRuntime.resetSearchHeaderFocusProgress,
      suggestionLayoutVisualRuntime.searchHeaderFocusProgress,
      suggestionLayoutVisualRuntime.suggestionHeaderDividerAnimatedStyle,
      suggestionLayoutVisualRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionLayoutVisualRuntime.suggestionScrollHandler,
      suggestionLayoutVisualRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionLayoutVisualRuntime.suggestionScrollMaxHeightTarget,
      suggestionLayoutVisualRuntime.suggestionScrollTopAnimatedStyle,
      suggestionLayoutVisualRuntime.suggestionTopFillHeight,
    ]
  );
};
