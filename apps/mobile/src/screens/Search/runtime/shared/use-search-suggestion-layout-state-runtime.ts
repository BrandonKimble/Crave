import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';

import { SEARCH_CONTAINER_PADDING_TOP } from '../../constants/search';
import type {
  SearchLayout,
  SearchSuggestionLayoutStateRuntime,
  SearchSuggestionLayoutStateRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

type SearchSuggestionShortcutLayoutCache = {
  frame: LayoutRectangle | null;
  chipFrames: Record<string, LayoutRectangle>;
};

const cloneSearchLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

export const useSearchSuggestionLayoutStateRuntime = ({
  searchInteractionRef,
  query,
  isSuggestionPanelActive,
  shouldDriveSuggestionLayout,
  shouldRenderSuggestionPanel,
}: SearchSuggestionLayoutStateRuntimeArgs): SearchSuggestionLayoutStateRuntime => {
  const [suggestionContentHeight, setSuggestionContentHeight] = React.useState(0);
  const suggestionContentHeightRef = React.useRef(0);
  const [searchLayout, setSearchLayout] = React.useState<SearchLayout>({ top: 0, height: 0 });
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const searchContainerLayoutCacheRef = React.useRef<LayoutRectangle | null>(null);
  const [searchBarFrame, setSearchBarFrame] = React.useState<LayoutRectangle | null>(null);
  const [searchShortcutsFrame, setSearchShortcutsFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const [searchShortcutChipFrames, setSearchShortcutChipFrames] = React.useState<
    Record<string, LayoutRectangle>
  >({});
  const searchShortcutsLayoutCacheRef = React.useRef<SearchSuggestionShortcutLayoutCache>({
    frame: null,
    chipFrames: {},
  });
  const shouldFreezeSuggestionHeader =
    shouldDriveSuggestionLayout && !isSuggestionPanelActive && query.trim().length > 0;

  const handleSuggestionContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      if (!shouldDriveSuggestionLayout || !shouldRenderSuggestionPanel) {
        return;
      }
      if (searchInteractionRef.current.isInteracting) {
        return;
      }
      const nextHeight = Math.max(0, height);
      if (Math.abs(nextHeight - suggestionContentHeightRef.current) < 1) {
        return;
      }
      suggestionContentHeightRef.current = nextHeight;
      setSuggestionContentHeight(nextHeight);
    },
    [searchInteractionRef, shouldDriveSuggestionLayout, shouldRenderSuggestionPanel]
  );

  const handleSearchHeaderLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (searchInteractionRef.current.isInteracting && searchBarFrame) {
        return;
      }
      const { layout } = nativeEvent;
      setSearchBarFrame((prev) => {
        if (
          prev &&
          Math.abs(prev.x - layout.x) < 0.5 &&
          Math.abs(prev.y - layout.y) < 0.5 &&
          Math.abs(prev.width - layout.width) < 0.5 &&
          Math.abs(prev.height - layout.height) < 0.5
        ) {
          return prev;
        }
        return layout;
      });
    },
    [searchBarFrame, searchInteractionRef]
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
      if (layout.height > 0) {
        setSearchLayout((prev) => {
          if (prev.top === layout.y && prev.height === layout.height) {
            return prev;
          }
          return { top: layout.y, height: layout.height };
        });
      }
      const isUsableLayout = layout.width > 0 && layout.height > SEARCH_CONTAINER_PADDING_TOP + 0.5;
      if (isUsableLayout) {
        const nextLayout = cloneSearchLayoutRectangle(layout);
        searchContainerLayoutCacheRef.current = nextLayout;
        setSearchContainerFrame((prev) => {
          if (
            prev &&
            Math.abs(prev.x - layout.x) < 0.5 &&
            Math.abs(prev.y - layout.y) < 0.5 &&
            Math.abs(prev.width - layout.width) < 0.5 &&
            Math.abs(prev.height - layout.height) < 0.5
          ) {
            return prev;
          }
          return nextLayout;
        });
      }
    },
    [searchContainerFrame, searchInteractionRef, searchLayout.height]
  );
  const handleSearchShortcutsRowLayout = React.useCallback((layout: LayoutRectangle) => {
    const nextLayout = cloneSearchLayoutRectangle(layout);
    searchShortcutsLayoutCacheRef.current = {
      ...searchShortcutsLayoutCacheRef.current,
      frame: nextLayout,
    };
    setSearchShortcutsFrame((prev) => {
      if (
        prev &&
        Math.abs(prev.x - layout.x) < 0.5 &&
        Math.abs(prev.y - layout.y) < 0.5 &&
        Math.abs(prev.width - layout.width) < 0.5 &&
        Math.abs(prev.height - layout.height) < 0.5
      ) {
        return prev;
      }
      return nextLayout;
    });
  }, []);
  const handleRestaurantsShortcutLayout = React.useCallback((layout: LayoutRectangle) => {
    setSearchShortcutChipFrames((prev) => {
      const nextLayout = cloneSearchLayoutRectangle(layout);
      const prevLayout = prev.restaurants;
      if (
        prevLayout &&
        Math.abs(prevLayout.x - layout.x) < 0.5 &&
        Math.abs(prevLayout.y - layout.y) < 0.5 &&
        Math.abs(prevLayout.width - layout.width) < 0.5 &&
        Math.abs(prevLayout.height - layout.height) < 0.5
      ) {
        return prev;
      }
      const next = { ...prev, restaurants: nextLayout };
      searchShortcutsLayoutCacheRef.current = {
        ...searchShortcutsLayoutCacheRef.current,
        chipFrames: {
          ...searchShortcutsLayoutCacheRef.current.chipFrames,
          restaurants: nextLayout,
        },
      };
      return next;
    });
  }, []);
  const handleDishesShortcutLayout = React.useCallback((layout: LayoutRectangle) => {
    setSearchShortcutChipFrames((prev) => {
      const nextLayout = cloneSearchLayoutRectangle(layout);
      const prevLayout = prev.dishes;
      if (
        prevLayout &&
        Math.abs(prevLayout.x - layout.x) < 0.5 &&
        Math.abs(prevLayout.y - layout.y) < 0.5 &&
        Math.abs(prevLayout.width - layout.width) < 0.5 &&
        Math.abs(prevLayout.height - layout.height) < 0.5
      ) {
        return prev;
      }
      const next = { ...prev, dishes: nextLayout };
      searchShortcutsLayoutCacheRef.current = {
        ...searchShortcutsLayoutCacheRef.current,
        chipFrames: {
          ...searchShortcutsLayoutCacheRef.current.chipFrames,
          dishes: nextLayout,
        },
      };
      return next;
    });
  }, []);

  const shouldUseSearchShortcutFrames = shouldDriveSuggestionLayout;
  const cachedSearchShortcutsFrame = searchShortcutsLayoutCacheRef.current.frame;
  const cachedSearchShortcutChipFrames = searchShortcutsLayoutCacheRef.current.chipFrames;
  const cachedSearchContainerFrame = searchContainerLayoutCacheRef.current;
  const resolvedSearchShortcutsFrame = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return null;
    }
    return searchShortcutsFrame ?? cachedSearchShortcutsFrame;
  }, [cachedSearchShortcutsFrame, searchShortcutsFrame, shouldUseSearchShortcutFrames]);
  const resolvedSearchShortcutChipFrames = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return {};
    }
    return { ...cachedSearchShortcutChipFrames, ...searchShortcutChipFrames };
  }, [cachedSearchShortcutChipFrames, searchShortcutChipFrames, shouldUseSearchShortcutFrames]);
  const hasResolvedSearchShortcutsFrame = Boolean(resolvedSearchShortcutsFrame);
  const shouldIncludeShortcutCutout =
    shouldDriveSuggestionLayout && hasResolvedSearchShortcutsFrame;
  const shouldIncludeShortcutHoles = shouldIncludeShortcutCutout;
  const shouldIncludeShortcutLayout = shouldIncludeShortcutCutout;
  const resolvedSearchContainerFrame = React.useMemo(() => {
    const isUsable = (frame: LayoutRectangle | null) =>
      Boolean(frame && frame.width > 0 && frame.height > SEARCH_CONTAINER_PADDING_TOP + 0.5);

    if (isUsable(searchContainerFrame)) {
      return searchContainerFrame;
    }
    if (isUsable(cachedSearchContainerFrame)) {
      return cachedSearchContainerFrame;
    }
    return null;
  }, [cachedSearchContainerFrame, searchContainerFrame]);

  return {
    shouldDriveSuggestionLayout,
    handleSuggestionContentSizeChange,
    searchLayout,
    searchBarFrame,
    handleSearchHeaderLayout,
    handleSearchContainerLayout,
    handleSearchShortcutsRowLayout,
    handleRestaurantsShortcutLayout,
    handleDishesShortcutLayout,
    suggestionContentHeight,
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutHoles,
    shouldIncludeShortcutLayout,
    resolvedSearchContainerFrame,
    resolvedSearchShortcutsFrame,
    resolvedSearchShortcutChipFrames,
  };
};
