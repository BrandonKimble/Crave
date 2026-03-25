import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';

type SearchLayout = {
  top: number;
  height: number;
};

type SearchInteractionRef = React.MutableRefObject<{
  isInteracting: boolean;
}>;

type SearchShortcutsLayoutCache = {
  frame: LayoutRectangle | null;
  chipFrames: Record<string, LayoutRectangle>;
};

type UseSearchLayoutControllerArgs = {
  searchInteractionRef: SearchInteractionRef;
  searchContainerPaddingTop: number;
};

type UseSearchLayoutControllerResult = {
  searchLayout: SearchLayout;
  searchContainerFrame: LayoutRectangle | null;
  searchBarFrame: LayoutRectangle | null;
  searchShortcutsFrame: LayoutRectangle | null;
  searchShortcutChipFrames: Record<string, LayoutRectangle>;
  searchContainerLayoutCacheRef: React.MutableRefObject<LayoutRectangle | null>;
  searchShortcutsLayoutCacheRef: React.MutableRefObject<SearchShortcutsLayoutCache>;
  handleSearchHeaderLayout: (event: LayoutChangeEvent) => void;
  handleSearchContainerLayout: (event: LayoutChangeEvent) => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
};

export const useSearchLayoutController = ({
  searchInteractionRef,
  searchContainerPaddingTop,
}: UseSearchLayoutControllerArgs): UseSearchLayoutControllerResult => {
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
  const searchShortcutsLayoutCacheRef = React.useRef<SearchShortcutsLayoutCache>({
    frame: null,
    chipFrames: {},
  });

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

      const isUsableLayout = layout.width > 0 && layout.height > searchContainerPaddingTop + 0.5;
      if (isUsableLayout) {
        searchContainerLayoutCacheRef.current = layout;
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
          return layout;
        });
      }
    },
    [searchContainerFrame, searchContainerPaddingTop, searchInteractionRef, searchLayout.height]
  );

  const handleSearchShortcutsRowLayout = React.useCallback((layout: LayoutRectangle) => {
    searchShortcutsLayoutCacheRef.current.frame = layout;
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
      return layout;
    });
  }, []);

  const handleRestaurantsShortcutLayout = React.useCallback((layout: LayoutRectangle) => {
    setSearchShortcutChipFrames((prev) => {
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
      const next = { ...prev, restaurants: layout };
      searchShortcutsLayoutCacheRef.current.chipFrames = {
        ...searchShortcutsLayoutCacheRef.current.chipFrames,
        restaurants: layout,
      };
      return next;
    });
  }, []);

  const handleDishesShortcutLayout = React.useCallback((layout: LayoutRectangle) => {
    setSearchShortcutChipFrames((prev) => {
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
      const next = { ...prev, dishes: layout };
      searchShortcutsLayoutCacheRef.current.chipFrames = {
        ...searchShortcutsLayoutCacheRef.current.chipFrames,
        dishes: layout,
      };
      return next;
    });
  }, []);

  return {
    searchLayout,
    searchContainerFrame,
    searchBarFrame,
    searchShortcutsFrame,
    searchShortcutChipFrames,
    searchContainerLayoutCacheRef,
    searchShortcutsLayoutCacheRef,
    handleSearchHeaderLayout,
    handleSearchContainerLayout,
    handleSearchShortcutsRowLayout,
    handleRestaurantsShortcutLayout,
    handleDishesShortcutLayout,
  };
};
