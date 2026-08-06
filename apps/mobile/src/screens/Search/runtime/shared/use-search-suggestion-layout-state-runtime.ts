import React from 'react';

import type {
  SearchSuggestionLayoutStateRuntime,
  SearchSuggestionLayoutStateRuntimeArgs,
} from './search-suggestion-surface-runtime-contract';
import { useSearchSuggestionContentHeightRuntime } from './use-search-suggestion-content-height-runtime';
import { useSearchSuggestionLayoutResolutionRuntime } from './use-search-suggestion-layout-resolution-runtime';
import { useSearchSuggestionSearchLayoutRuntime } from './use-search-suggestion-search-layout-runtime';
import { useSearchSuggestionShortcutLayoutRuntime } from './use-search-suggestion-shortcut-layout-runtime';

export const useSearchSuggestionLayoutStateRuntime = ({
  startupGeometrySeed,
  searchInteractionRef,
  query,
  isSuggestionPanelActive,
  shouldDisableSearchShortcuts,
  shouldDriveSuggestionLayout,
  shouldRenderSuggestionPanel,
}: SearchSuggestionLayoutStateRuntimeArgs): SearchSuggestionLayoutStateRuntime => {
  const suggestionContentHeightRuntime = useSearchSuggestionContentHeightRuntime({
    searchInteractionRef,
    shouldDriveSuggestionLayout,
    shouldRenderSuggestionPanel,
  });
  const searchSuggestionSearchLayoutRuntime = useSearchSuggestionSearchLayoutRuntime({
    startupGeometrySeed,
    searchInteractionRef,
  });

  const searchSuggestionShortcutLayoutRuntime = useSearchSuggestionShortcutLayoutRuntime();

  const searchSuggestionLayoutResolutionRuntime = useSearchSuggestionLayoutResolutionRuntime({
    query,
    isSuggestionPanelActive,
    shouldDisableSearchShortcuts,
    shouldDriveSuggestionLayout,
    searchContainerFrame: searchSuggestionSearchLayoutRuntime.searchContainerFrame,
    cachedSearchContainerFrame: searchSuggestionSearchLayoutRuntime.cachedSearchContainerFrame,
    searchShortcutsFrame: searchSuggestionShortcutLayoutRuntime.searchShortcutsFrame,
    cachedSearchShortcutsFrame: searchSuggestionShortcutLayoutRuntime.cachedSearchShortcutsFrame,
    searchShortcutChipFrames: searchSuggestionShortcutLayoutRuntime.searchShortcutChipFrames,
    cachedSearchShortcutChipFrames:
      searchSuggestionShortcutLayoutRuntime.cachedSearchShortcutChipFrames,
  });

  /**
   * F1620: the repacker this replaced re-declared all sixteen fields of
   * `SearchSuggestionLayoutStateRuntime` as an inline parameter type — a hand transcription
   * with nothing holding it to the contract, so a field REMOVED from the contract would have
   * gone stale here in silence. Typing the memo with the contract itself is the fix: the
   * transcription is gone, and both additions and removals are now tsc errors.
   */
  return React.useMemo<SearchSuggestionLayoutStateRuntime>(
    () => ({
      shouldDriveSuggestionLayout,
      handleSuggestionContentSizeChange:
        suggestionContentHeightRuntime.handleSuggestionContentSizeChange,
      searchLayout: searchSuggestionSearchLayoutRuntime.searchLayout,
      searchBarFrame: searchSuggestionSearchLayoutRuntime.searchBarFrame,
      handleSearchHeaderLayout: searchSuggestionSearchLayoutRuntime.handleSearchHeaderLayout,
      handleSearchContainerLayout: searchSuggestionSearchLayoutRuntime.handleSearchContainerLayout,
      handleSearchShortcutsRowLayout:
        searchSuggestionShortcutLayoutRuntime.handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout:
        searchSuggestionShortcutLayoutRuntime.handleRestaurantsShortcutLayout,
      handleDishesShortcutLayout: searchSuggestionShortcutLayoutRuntime.handleDishesShortcutLayout,
      suggestionContentHeight: suggestionContentHeightRuntime.suggestionContentHeight,
      shouldFreezeSuggestionHeader:
        searchSuggestionLayoutResolutionRuntime.shouldFreezeSuggestionHeader,
      shouldIncludeShortcutHoles:
        searchSuggestionLayoutResolutionRuntime.shouldIncludeShortcutHoles,
      shouldIncludeShortcutLayout:
        searchSuggestionLayoutResolutionRuntime.shouldIncludeShortcutLayout,
      resolvedSearchContainerFrame:
        searchSuggestionLayoutResolutionRuntime.resolvedSearchContainerFrame,
      resolvedSearchShortcutsFrame:
        searchSuggestionLayoutResolutionRuntime.resolvedSearchShortcutsFrame,
      resolvedSearchShortcutChipFrames:
        searchSuggestionLayoutResolutionRuntime.resolvedSearchShortcutChipFrames,
    }),
    [
      searchSuggestionLayoutResolutionRuntime.resolvedSearchContainerFrame,
      searchSuggestionLayoutResolutionRuntime.resolvedSearchShortcutChipFrames,
      searchSuggestionLayoutResolutionRuntime.resolvedSearchShortcutsFrame,
      searchSuggestionLayoutResolutionRuntime.shouldFreezeSuggestionHeader,
      searchSuggestionLayoutResolutionRuntime.shouldIncludeShortcutHoles,
      searchSuggestionLayoutResolutionRuntime.shouldIncludeShortcutLayout,
      searchSuggestionSearchLayoutRuntime.handleSearchContainerLayout,
      searchSuggestionSearchLayoutRuntime.handleSearchHeaderLayout,
      searchSuggestionSearchLayoutRuntime.searchBarFrame,
      searchSuggestionSearchLayoutRuntime.searchLayout,
      searchSuggestionShortcutLayoutRuntime.handleDishesShortcutLayout,
      searchSuggestionShortcutLayoutRuntime.handleRestaurantsShortcutLayout,
      searchSuggestionShortcutLayoutRuntime.handleSearchShortcutsRowLayout,
      shouldDriveSuggestionLayout,
      suggestionContentHeightRuntime.handleSuggestionContentSizeChange,
      suggestionContentHeightRuntime.suggestionContentHeight,
    ]
  );
};
