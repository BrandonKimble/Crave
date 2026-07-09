import React from 'react';

import { getAppOverlayRouteMetadata } from './app-overlay-route-types';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import type { RouteOverlayNavigationSnapshot } from './route-overlay-navigation-snapshot-contract';
import { setNavOutChildSceneRevealed } from './nav-out-derivation-store';

const selectIsChildSceneRevealed = (snapshot: RouteOverlayNavigationSnapshot): boolean =>
  getAppOverlayRouteMetadata(snapshot.activeOverlayRoute.key).role === 'child';

/**
 * THE single writer of the nav-out derivation store: projects the route navigation snapshot
 * (top-of-stack role) into `isChildSceneRevealed`. Mounted once in the app shell next to the
 * other route-runtime writer hosts.
 */
export const useAppRouteNavOutDerivationWriterRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  React.useEffect(() => {
    setNavOutChildSceneRevealed(
      selectIsChildSceneRevealed(routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot())
    );
    return routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
      selector: selectIsChildSceneRevealed,
      syncNavigationSnapshot: (_snapshot, isChildSceneRevealed) => {
        setNavOutChildSceneRevealed(isChildSceneRevealed);
      },
      isEqual: (left, right) => left === right,
      attributionLabel: 'AppRouteNavOutDerivationWriterRuntime',
    });
  }, [routeSceneRuntime]);
};
