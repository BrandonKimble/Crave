import React from 'react';

import type { RouteOverlayIdentityAuthority } from './route-authority-contract';
import type { RouteOverlayIdentitySnapshot } from '../../../../navigation/runtime/route-overlay-navigation-snapshot-contract';
import {
  dismissTransientOverlays,
  registerTransientDismissor,
} from '../../../../overlays/overlayTransientDismissorRuntime';
import type { SearchOverlayStoreRuntime } from './search-root-scaffold-runtime-contract';

const selectRouteIdentityRuntime = (
  snapshot: RouteOverlayIdentitySnapshot
): Pick<
  SearchOverlayStoreRuntime,
  | 'activeOverlayKey'
  | 'rootOverlay'
  | 'isSearchOverlay'
  | 'showBookmarksOverlay'
  | 'showPollsOverlay'
  | 'showProfileOverlay'
> => ({
  activeOverlayKey: snapshot.activeOverlayRouteKey,
  rootOverlay: snapshot.rootOverlayKey,
  isSearchOverlay: snapshot.rootOverlayKey === 'search',
  showBookmarksOverlay: snapshot.rootOverlayKey === 'bookmarks',
  showPollsOverlay: false,
  showProfileOverlay: snapshot.rootOverlayKey === 'profile',
});

export const useSearchRootOverlayStoreRuntime = ({
  routeOverlayIdentityAuthority,
}: {
  routeOverlayIdentityAuthority: RouteOverlayIdentityAuthority;
}): SearchOverlayStoreRuntime => {
  const routeIdentityRef = React.useRef(
    selectRouteIdentityRuntime(routeOverlayIdentityAuthority.getSnapshot())
  );

  React.useEffect(
    () =>
      routeOverlayIdentityAuthority.registerTarget({
        attributionLabel: 'SearchRootOverlayStoreRuntime',
        syncIdentitySnapshot: (snapshot) => {
          routeIdentityRef.current = selectRouteIdentityRuntime(snapshot);
        },
      }),
    [routeOverlayIdentityAuthority]
  );

  return React.useMemo(
    () =>
      Object.defineProperties(
        {
          registerTransientDismissor,
          dismissTransientOverlays,
          getIdentitySnapshot: () => routeIdentityRef.current,
        } as SearchOverlayStoreRuntime,
        {
          activeOverlayKey: {
            enumerable: true,
            get: () => routeIdentityRef.current.activeOverlayKey,
          },
          rootOverlay: {
            enumerable: true,
            get: () => routeIdentityRef.current.rootOverlay,
          },
          isSearchOverlay: {
            enumerable: true,
            get: () => routeIdentityRef.current.isSearchOverlay,
          },
          showBookmarksOverlay: {
            enumerable: true,
            get: () => routeIdentityRef.current.showBookmarksOverlay,
          },
          showPollsOverlay: {
            enumerable: true,
            get: () => routeIdentityRef.current.showPollsOverlay,
          },
          showProfileOverlay: {
            enumerable: true,
            get: () => routeIdentityRef.current.showProfileOverlay,
          },
        }
      ),
    []
  );
};
