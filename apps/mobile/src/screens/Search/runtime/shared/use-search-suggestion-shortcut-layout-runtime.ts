import React from 'react';
import type { LayoutRectangle } from 'react-native';

type SearchSuggestionShortcutLayoutCache = {
  frame: LayoutRectangle | null;
  chipFrames: Record<string, LayoutRectangle>;
};

type SearchSuggestionShortcutLayoutRuntime = {
  searchShortcutsFrame: LayoutRectangle | null;
  cachedSearchShortcutsFrame: LayoutRectangle | null;
  searchShortcutChipFrames: Record<string, LayoutRectangle>;
  cachedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
};

const cloneSearchLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

export const useSearchSuggestionShortcutLayoutRuntime =
  (): SearchSuggestionShortcutLayoutRuntime => {
    const [searchShortcutsFrame, setSearchShortcutsFrame] =
      React.useState<LayoutRectangle | null>(null);
    const [searchShortcutChipFrames, setSearchShortcutChipFrames] = React.useState<
      Record<string, LayoutRectangle>
    >({});
    const searchShortcutsLayoutCacheRef = React.useRef<SearchSuggestionShortcutLayoutCache>({
      frame: null,
      chipFrames: {},
    });

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

    return React.useMemo(
      () => ({
        searchShortcutsFrame,
        cachedSearchShortcutsFrame: searchShortcutsLayoutCacheRef.current.frame,
        searchShortcutChipFrames,
        cachedSearchShortcutChipFrames:
          searchShortcutsLayoutCacheRef.current.chipFrames,
        handleSearchShortcutsRowLayout,
        handleRestaurantsShortcutLayout,
        handleDishesShortcutLayout,
      }),
      [
        handleDishesShortcutLayout,
        handleRestaurantsShortcutLayout,
        handleSearchShortcutsRowLayout,
        searchShortcutChipFrames,
        searchShortcutsFrame,
      ]
    );
  };
