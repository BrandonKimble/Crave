import React from 'react';
import { PixelRatio, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';

import { LINE_HEIGHTS } from '../../../../constants/typography';
import { SCREEN_HEIGHT, SEARCH_CONTAINER_PADDING_TOP } from '../../constants/search';
import {
  getCachedBottomNavMetrics,
  setCachedBottomNavMetricsFromLayout,
} from '../../utils/bottom-nav-metrics-cache';

const NAV_BOTTOM_PADDING = 12;
const NAV_TOP_PADDING = 14;

type UseSearchBottomNavRuntimeArgs = {
  searchLayoutTop: number;
  searchBarFrame: LayoutRectangle | null;
  insetsBottom: number;
};

type SearchBottomNavRuntime = {
  searchBarTop: number;
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
  bottomNavHiddenTranslateY: number;
  navBarTopForSnaps: number;
  navBarCutoutHeight: number;
};

export const useSearchBottomNavRuntime = ({
  searchLayoutTop,
  searchBarFrame,
  insetsBottom,
}: UseSearchBottomNavRuntimeArgs): SearchBottomNavRuntime => {
  const searchBarTop = React.useMemo(() => {
    const rawTop = searchBarFrame
      ? searchLayoutTop + searchBarFrame.y
      : searchLayoutTop + SEARCH_CONTAINER_PADDING_TOP;
    return Math.max(rawTop, 0);
  }, [searchBarFrame, searchLayoutTop]);

  const bottomInset = Math.max(insetsBottom, 12);
  const [bottomNavFrame, setBottomNavFrame] = React.useState<LayoutRectangle | null>(() => {
    const cached = getCachedBottomNavMetrics();
    if (!cached) {
      return null;
    }
    return { x: 0, y: cached.top, width: 0, height: cached.height };
  });
  const handleBottomNavLayout = React.useCallback((event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setCachedBottomNavMetricsFromLayout(layout);
    setBottomNavFrame((previous) => {
      if (
        previous &&
        Math.abs(previous.x - layout.x) < 0.5 &&
        Math.abs(previous.y - layout.y) < 0.5 &&
        Math.abs(previous.width - layout.width) < 0.5 &&
        Math.abs(previous.height - layout.height) < 0.5
      ) {
        return previous;
      }
      return layout;
    });
  }, []);

  const estimatedNavBarHeight = PixelRatio.roundToNearestPixel(
    NAV_TOP_PADDING + 24 + 2 + LINE_HEIGHTS.body + bottomInset + NAV_BOTTOM_PADDING
  );
  const resolvedEstimatedNavBarHeight =
    Number.isFinite(estimatedNavBarHeight) && estimatedNavBarHeight > 0 ? estimatedNavBarHeight : 0;
  const fallbackNavBarHeight =
    bottomNavFrame?.height && bottomNavFrame.height > 0
      ? bottomNavFrame.height
      : resolvedEstimatedNavBarHeight;
  const bottomNavHiddenTranslateY = Math.max(24, fallbackNavBarHeight + bottomInset + 12);
  const navBarTopForSnaps =
    bottomNavFrame && Number.isFinite(bottomNavFrame.y) && bottomNavFrame.y > 0
      ? bottomNavFrame.y
      : SCREEN_HEIGHT - fallbackNavBarHeight;
  const navBarCutoutHeight = fallbackNavBarHeight;

  return React.useMemo(
    () => ({
      searchBarTop,
      bottomInset,
      handleBottomNavLayout,
      bottomNavHiddenTranslateY,
      navBarTopForSnaps,
      navBarCutoutHeight,
    }),
    [
      bottomInset,
      bottomNavHiddenTranslateY,
      handleBottomNavLayout,
      navBarCutoutHeight,
      navBarTopForSnaps,
      searchBarTop,
    ]
  );
};
