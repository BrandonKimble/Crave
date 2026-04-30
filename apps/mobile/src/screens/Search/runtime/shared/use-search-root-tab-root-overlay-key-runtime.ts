import type { OverlayKey } from '../../../../overlays/types';
import type { RouteOverlayNavigationSnapshot } from '../../../../navigation/runtime/route-overlay-navigation-snapshot-contract';
import type { RouteOverlayNavigationAuthority } from './use-search-root-session-runtime-contract';
import React from 'react';

export const useSearchRootTabRootOverlayKeyRuntime = ({
  routeOverlayNavigationAuthority,
}: {
  routeOverlayNavigationAuthority: RouteOverlayNavigationAuthority;
}): OverlayKey => {
  const selectRootOverlayKey = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot) => snapshot.rootOverlayKey,
    []
  );
  const [rootOverlayKey, setRootOverlayKey] = React.useState<OverlayKey>(() =>
    selectRootOverlayKey(routeOverlayNavigationAuthority.getSnapshot())
  );

  React.useEffect(
    () =>
      routeOverlayNavigationAuthority.registerTarget({
        selector: selectRootOverlayKey,
        syncNavigationSnapshot: (_snapshot, selectedRootOverlayKey) => {
          setRootOverlayKey(selectedRootOverlayKey);
        },
        attributionLabel: 'SearchRootTabRootOverlayKeyRuntime',
      }),
    [routeOverlayNavigationAuthority, selectRootOverlayKey]
  );

  return rootOverlayKey;
};
