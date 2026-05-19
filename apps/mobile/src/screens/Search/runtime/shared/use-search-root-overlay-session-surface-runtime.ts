import React from 'react';
import { PixelRatio, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import type { SearchRootOverlaySessionSurfaceRuntime } from './search-root-scaffold-runtime-contract';
import type { RouteOverlayVisibilityAuthority } from './route-authority-contract';
import {
  assertSearchStartupGeometryValue,
  buildSearchStartupGeometrySeed,
  resolveSearchBottomInset,
} from './search-startup-geometry';

type UseSearchRootOverlaySessionSurfaceRuntimeArgs = {
  insetsTop: number;
  insetsBottom: number;
  routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
};

export const useSearchRootOverlaySessionSurfaceRuntime = ({
  insetsTop,
  insetsBottom,
  routeOverlayVisibilityAuthority,
}: UseSearchRootOverlaySessionSurfaceRuntimeArgs): SearchRootOverlaySessionSurfaceRuntime => {
  const { width, height } = useWindowDimensions();
  const startupGeometrySeed = React.useMemo(
    () =>
      buildSearchStartupGeometrySeed({
        windowWidth: width,
        windowHeight: height,
        insetsTop,
        insetsBottom,
      }),
    [height, insetsBottom, insetsTop, width]
  );
  const handleBottomNavLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      assertSearchStartupGeometryValue(
        'bottomNav.top',
        startupGeometrySeed.bottomNavTop,
        PixelRatio.roundToNearestPixel(layout.y)
      );
      assertSearchStartupGeometryValue(
        'bottomNav.height',
        startupGeometrySeed.bottomNavHeight,
        PixelRatio.roundToNearestPixel(layout.height)
      );
    },
    [startupGeometrySeed.bottomNavHeight, startupGeometrySeed.bottomNavTop]
  );

  const shouldRenderSearchOverlay =
    routeOverlayVisibilityAuthority.getSnapshot().shouldRenderSearchOverlay;

  return React.useMemo(
    () => ({
      searchBarTop: startupGeometrySeed.searchBarTop,
      bottomInset: resolveSearchBottomInset(insetsBottom),
      handleBottomNavLayout,
      bottomNavHiddenTranslateY: startupGeometrySeed.bottomNavHiddenTranslateY,
      navBarTopForSnaps: startupGeometrySeed.navBarTopForSnaps,
      navBarCutoutHeight: startupGeometrySeed.navBarCutoutHeight,
      shouldRenderSearchOverlay,
    }),
    [
      handleBottomNavLayout,
      insetsBottom,
      insetsTop,
      shouldRenderSearchOverlay,
      startupGeometrySeed.bottomNavHiddenTranslateY,
      startupGeometrySeed.navBarCutoutHeight,
      startupGeometrySeed.navBarTopForSnaps,
      startupGeometrySeed.searchBarTop,
    ]
  );
};
