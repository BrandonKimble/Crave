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
  searchShortcutsScrollOffsetX: number;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleShortcutChipLayout: (chipId: string, layout: LayoutRectangle) => void;
  handleSearchShortcutsScroll: (offsetX: number) => void;
};

const cloneSearchLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

export const useSearchSuggestionShortcutLayoutRuntime =
  (): SearchSuggestionShortcutLayoutRuntime => {
    const [searchShortcutsFrame, setSearchShortcutsFrame] = React.useState<LayoutRectangle | null>(
      null
    );
    const [searchShortcutChipFrames, setSearchShortcutChipFrames] = React.useState<
      Record<string, LayoutRectangle>
    >({});
    // R7 groundwork: the shortcut row is a horizontal scroll surface; chip onLayout
    // coordinates are content-relative, so the current scroll offset is state the
    // layout-resolution runtime needs to shift chip frames into the row viewport.
    const [searchShortcutsScrollOffsetX, setSearchShortcutsScrollOffsetX] = React.useState(0);
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

    const handleShortcutChipLayout = React.useCallback(
      (chipId: string, layout: LayoutRectangle) => {
        setSearchShortcutChipFrames((prev) => {
          const nextLayout = cloneSearchLayoutRectangle(layout);
          const prevLayout = prev[chipId];
          if (
            prevLayout &&
            Math.abs(prevLayout.x - layout.x) < 0.5 &&
            Math.abs(prevLayout.y - layout.y) < 0.5 &&
            Math.abs(prevLayout.width - layout.width) < 0.5 &&
            Math.abs(prevLayout.height - layout.height) < 0.5
          ) {
            return prev;
          }
          const next = { ...prev, [chipId]: nextLayout };
          searchShortcutsLayoutCacheRef.current = {
            ...searchShortcutsLayoutCacheRef.current,
            chipFrames: {
              ...searchShortcutsLayoutCacheRef.current.chipFrames,
              [chipId]: nextLayout,
            },
          };
          return next;
        });
      },
      []
    );

    const handleSearchShortcutsScroll = React.useCallback((offsetX: number) => {
      setSearchShortcutsScrollOffsetX((prev) => (Math.abs(prev - offsetX) < 0.5 ? prev : offsetX));
    }, []);

    return React.useMemo(
      () => ({
        searchShortcutsFrame,
        cachedSearchShortcutsFrame: searchShortcutsLayoutCacheRef.current.frame,
        searchShortcutChipFrames,
        cachedSearchShortcutChipFrames: searchShortcutsLayoutCacheRef.current.chipFrames,
        searchShortcutsScrollOffsetX,
        handleSearchShortcutsRowLayout,
        handleShortcutChipLayout,
        handleSearchShortcutsScroll,
      }),
      [
        handleSearchShortcutsScroll,
        handleShortcutChipLayout,
        handleSearchShortcutsRowLayout,
        searchShortcutChipFrames,
        searchShortcutsFrame,
        searchShortcutsScrollOffsetX,
      ]
    );
  };
