import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';

import { assertSearchStartupGeometryRect } from './search-startup-geometry';
import {
  areSearchLayoutRectanglesClose,
  hasUsableSearchHeaderHeight,
} from './search-suggestion-search-layout-runtime';
import type { SearchInteractionRef } from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionSearchHeaderLayoutRuntimeArgs = {
  startupGeometrySeed: import('./search-startup-geometry').SearchStartupGeometrySeed;
  searchInteractionRef: SearchInteractionRef;
};

type SearchSuggestionSearchHeaderLayoutRuntime = {
  searchBarFrame: LayoutRectangle | null;
  handleSearchHeaderLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
};

export const useSearchSuggestionSearchHeaderLayoutRuntime = ({
  startupGeometrySeed,
  searchInteractionRef,
}: UseSearchSuggestionSearchHeaderLayoutRuntimeArgs): SearchSuggestionSearchHeaderLayoutRuntime => {
  const [searchBarFrame, setSearchBarFrame] = React.useState<LayoutRectangle | null>(
    () => startupGeometrySeed.searchHeaderFrame
  );

  const handleSearchHeaderLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (searchInteractionRef.current.isInteracting && searchBarFrame) {
        return;
      }

      const { layout } = nativeEvent;
      assertSearchStartupGeometryRect(
        'searchHeaderFrame',
        startupGeometrySeed.searchHeaderFrame,
        layout
      );

      setSearchBarFrame((prev) => {
        if (
          prev &&
          hasUsableSearchHeaderHeight(prev.height) &&
          !hasUsableSearchHeaderHeight(layout.height)
        ) {
          return prev;
        }
        if (prev && areSearchLayoutRectanglesClose(prev, layout)) {
          return prev;
        }
        return layout;
      });
    },
    [searchBarFrame, searchInteractionRef, startupGeometrySeed.searchHeaderFrame]
  );

  return React.useMemo(
    () => ({
      searchBarFrame,
      handleSearchHeaderLayout,
    }),
    [handleSearchHeaderLayout, searchBarFrame]
  );
};
