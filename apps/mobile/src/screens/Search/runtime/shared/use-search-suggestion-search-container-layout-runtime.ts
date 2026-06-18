import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';

import { assertSearchStartupGeometryValue } from './search-startup-geometry';
import {
  areSearchLayoutRectanglesClose,
  cloneSearchLayoutRectangle,
  hasUsableSearchContainerHeight,
} from './search-suggestion-search-layout-runtime';
import type {
  SearchInteractionRef,
  SearchLayout,
} from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionSearchContainerLayoutRuntimeArgs = {
  startupGeometrySeed: import('./search-startup-geometry').SearchStartupGeometrySeed;
  searchInteractionRef: SearchInteractionRef;
};

type SearchSuggestionSearchContainerLayoutRuntime = {
  searchLayout: SearchLayout;
  searchContainerFrame: LayoutRectangle | null;
  cachedSearchContainerFrame: LayoutRectangle | null;
  handleSearchContainerLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
};

export const useSearchSuggestionSearchContainerLayoutRuntime = ({
  startupGeometrySeed,
  searchInteractionRef,
}: UseSearchSuggestionSearchContainerLayoutRuntimeArgs): SearchSuggestionSearchContainerLayoutRuntime => {
  const [searchLayout, setSearchLayout] = React.useState<SearchLayout>(() => ({
    top: startupGeometrySeed.searchContainerFrame.y,
    height: startupGeometrySeed.searchContainerFrame.height,
  }));
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    () => startupGeometrySeed.searchContainerFrame
  );
  const searchContainerLayoutCacheRef = React.useRef<LayoutRectangle | null>(
    startupGeometrySeed.searchContainerFrame
  );

  const handleSearchContainerLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (
        searchInteractionRef.current.isInteracting &&
        searchLayout.height > 0 &&
        searchContainerFrame
      ) {
        return;
      }

      const { layout } = nativeEvent;
      assertSearchStartupGeometryValue(
        'searchContainerFrame.y',
        startupGeometrySeed.searchContainerFrame.y,
        layout.y
      );
      assertSearchStartupGeometryValue(
        'searchContainerFrame.height',
        startupGeometrySeed.searchContainerFrame.height,
        layout.height
      );

      const hasUsableIncomingLayout = hasUsableSearchContainerHeight(layout.height);
      if (layout.height > 0) {
        setSearchLayout((prev) => {
          if (hasUsableSearchContainerHeight(prev.height) && !hasUsableIncomingLayout) {
            return prev;
          }
          if (prev.top === layout.y && prev.height === layout.height) {
            return prev;
          }
          return { top: layout.y, height: layout.height };
        });
      }

      const isUsableLayout = layout.width > 0 && hasUsableIncomingLayout;
      if (!isUsableLayout) {
        return;
      }

      const nextLayout = cloneSearchLayoutRectangle(layout);
      searchContainerLayoutCacheRef.current = nextLayout;
      setSearchContainerFrame((prev) => {
        if (prev && areSearchLayoutRectanglesClose(prev, layout)) {
          return prev;
        }
        return nextLayout;
      });
    },
    [
      searchContainerFrame,
      searchInteractionRef,
      searchLayout.height,
      startupGeometrySeed.searchContainerFrame.height,
      startupGeometrySeed.searchContainerFrame.y,
    ]
  );

  return React.useMemo(
    () => ({
      searchLayout,
      searchContainerFrame,
      cachedSearchContainerFrame: searchContainerLayoutCacheRef.current,
      handleSearchContainerLayout,
    }),
    [handleSearchContainerLayout, searchContainerFrame, searchLayout]
  );
};
