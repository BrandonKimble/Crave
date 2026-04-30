import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import type {
  SearchInteractionRef,
  SearchLayout,
} from './use-search-suggestion-surface-runtime-contract';
import { useSearchSuggestionSearchContainerLayoutRuntime } from './use-search-suggestion-search-container-layout-runtime';
import { useSearchSuggestionSearchHeaderLayoutRuntime } from './use-search-suggestion-search-header-layout-runtime';

type UseSearchSuggestionSearchLayoutRuntimeArgs = {
  startupGeometrySeed: import('./search-startup-geometry').SearchStartupGeometrySeed;
  searchInteractionRef: SearchInteractionRef;
};

type SearchSuggestionSearchLayoutRuntime = {
  searchLayout: SearchLayout;
  searchBarFrame: LayoutRectangle | null;
  searchContainerFrame: LayoutRectangle | null;
  cachedSearchContainerFrame: LayoutRectangle | null;
  handleSearchHeaderLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
  handleSearchContainerLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
};

export const useSearchSuggestionSearchLayoutRuntime = ({
  startupGeometrySeed,
  searchInteractionRef,
}: UseSearchSuggestionSearchLayoutRuntimeArgs): SearchSuggestionSearchLayoutRuntime => {
  const searchHeaderLayoutRuntime = useSearchSuggestionSearchHeaderLayoutRuntime({
    startupGeometrySeed,
    searchInteractionRef,
  });
  const searchContainerLayoutRuntime =
    useSearchSuggestionSearchContainerLayoutRuntime({
      startupGeometrySeed,
      searchInteractionRef,
    });

  return React.useMemo(
    () => ({
      searchLayout: searchContainerLayoutRuntime.searchLayout,
      searchBarFrame: searchHeaderLayoutRuntime.searchBarFrame,
      searchContainerFrame: searchContainerLayoutRuntime.searchContainerFrame,
      cachedSearchContainerFrame:
        searchContainerLayoutRuntime.cachedSearchContainerFrame,
      handleSearchHeaderLayout:
        searchHeaderLayoutRuntime.handleSearchHeaderLayout,
      handleSearchContainerLayout:
        searchContainerLayoutRuntime.handleSearchContainerLayout,
    }),
    [
      searchContainerLayoutRuntime.cachedSearchContainerFrame,
      searchContainerLayoutRuntime.handleSearchContainerLayout,
      searchContainerLayoutRuntime.searchContainerFrame,
      searchContainerLayoutRuntime.searchLayout,
      searchHeaderLayoutRuntime.handleSearchHeaderLayout,
      searchHeaderLayoutRuntime.searchBarFrame,
    ]
  );
};
