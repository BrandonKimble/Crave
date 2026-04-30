import React from 'react';

import type { RouteHostOverlayGeometryBinding } from './route-authority-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';

export const useSearchRootRouteHostOverlayGeometryRuntime = ({
  rootOverlayFoundationRuntime,
}: {
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
}): RouteHostOverlayGeometryBinding =>
  React.useMemo(
    () => ({
      searchBarTop:
        rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
          .searchBarTop,
      navBarTopForSnaps:
        rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
          .navBarTopForSnaps,
      navBarCutoutHeight:
        rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
          .navBarCutoutHeight,
      bottomNavHiddenTranslateY:
        rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
          .bottomNavHiddenTranslateY,
    }),
    [
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
        .bottomNavHiddenTranslateY,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
        .navBarCutoutHeight,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime
        .navBarTopForSnaps,
      rootOverlayFoundationRuntime.rootOverlaySessionSurfaceRuntime.searchBarTop,
    ]
  );
