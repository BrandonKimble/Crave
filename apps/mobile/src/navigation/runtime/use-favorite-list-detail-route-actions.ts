import React from 'react';

import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';
import type {
  AppOverlayTopLevelProductRouteKey,
  OverlayKey,
  OverlayRouteEntry,
} from './app-overlay-route-types';

type OpenFavoriteListDetailRouteArgs = {
  listId: string;
  parentSceneKey: AppOverlayTopLevelProductRouteKey;
  ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
  openerRouteKey?: OverlayKey | null;
};

const getRouteOpenerKey = (activeRoute: OverlayRouteEntry): OverlayKey => activeRoute.key;

export const useFavoriteListDetailRouteActions = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const nextRouteInstanceRef = React.useRef(0);

  const openFavoriteListDetailRoute = React.useCallback(
    ({
      listId,
      parentSceneKey,
      ownerSceneKey,
      openerRouteKey,
    }: OpenFavoriteListDetailRouteArgs) => {
      const routeState = routeSceneRuntime.routeOverlayRouteCommandRuntime.getRouteState();
      const activeRoute = routeState.activeOverlayRoute;
      nextRouteInstanceRef.current += 1;
      const resolvedOwnerSceneKey = ownerSceneKey ?? parentSceneKey;
      routeSceneRuntime.routeOverlayRouteCommandRuntime.pushRoute('favoriteListDetail', {
        listId,
        parentSceneKey,
        ownerSceneKey: resolvedOwnerSceneKey,
        openerRouteKey: openerRouteKey ?? getRouteOpenerKey(activeRoute),
        routeInstanceId: `favoriteListDetail-${resolvedOwnerSceneKey}-${nextRouteInstanceRef.current}`,
      });
    },
    [routeSceneRuntime.routeOverlayRouteCommandRuntime]
  );

  return React.useMemo(
    () => ({
      openFavoriteListDetailRoute,
    }),
    [openFavoriteListDetailRoute]
  );
};
