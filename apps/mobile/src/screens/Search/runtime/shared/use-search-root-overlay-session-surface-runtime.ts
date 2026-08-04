import React from 'react';
import { PixelRatio, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import type { SearchRootOverlaySessionSurfaceRuntime } from './search-root-scaffold-runtime-contract';
import type { RouteOverlayVisibilityAuthority } from './route-authority-contract';
import {
  assertSearchStartupGeometryValue,
  buildSearchStartupGeometrySeed,
  resolveSearchBottomInset,
} from './search-startup-geometry';
import { useRouteAuthoritySelector } from '../../../../navigation/runtime/use-route-authority-selector';
import type { RouteOverlayVisibilitySnapshot } from '../../../../navigation/runtime/route-overlay-visibility-snapshot-contract';

const selectShouldRenderSearchOverlay = (snapshot: RouteOverlayVisibilitySnapshot): boolean =>
  snapshot.shouldRenderSearchOverlay;

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

  // F1323(a) — SUBSCRIBED, not read once during render.
  //
  // This was `routeOverlayVisibilityAuthority.getSnapshot().shouldRenderSearchOverlay` in the
  // render body, folded straight into the memo below. The authority was never subscribed here,
  // so the value only refreshed when something ELSE happened to re-render this hook — and it
  // propagates from here into the chrome host, the suggestion shell's pointerEvents, and the
  // presentation owner. A value that changes without re-rendering its readers is not state,
  // and reading it during render is the failure mode that looks correct in every manual test:
  // some unrelated render is almost always close enough to hide it.
  //
  // `useRouteAuthoritySelector` is the house pattern for exactly this and was already imported
  // in this territory; the selector narrows to the one boolean so an unrelated visibility-
  // snapshot field cannot wake this hook.
  const shouldRenderSearchOverlay = useRouteAuthoritySelector<
    RouteOverlayVisibilitySnapshot,
    boolean
  >({
    subscribe: React.useCallback(
      (listener: () => void) => routeOverlayVisibilityAuthority.subscribe(listener),
      [routeOverlayVisibilityAuthority]
    ),
    getSnapshot: routeOverlayVisibilityAuthority.getSnapshot,
    selector: selectShouldRenderSearchOverlay,
    attributionOwner: 'useSearchRootOverlaySessionSurfaceRuntime',
    attributionOperation: 'shouldRenderSearchOverlaySelector',
  });

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
