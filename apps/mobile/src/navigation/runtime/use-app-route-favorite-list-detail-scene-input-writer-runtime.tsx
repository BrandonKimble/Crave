import React from 'react';

import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import {
  useFavoriteListDetailRouteSceneDescriptor,
  type FavoriteListDetailRouteSceneDescriptor,
} from '../../screens/FavoritesListDetail';
import type {
  AppOverlayTopLevelProductRouteKey,
  OverlayRouteEntry,
} from './app-overlay-route-types';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

type FavoriteListDetailRouteState = {
  listId: string | null;
  ownerSceneKey: AppOverlayTopLevelProductRouteKey | null;
};

const getFavoriteListDetailRouteState = (
  activeOverlayRoute: OverlayRouteEntry
): FavoriteListDetailRouteState => {
  if (activeOverlayRoute.key !== 'favoriteListDetail') {
    return {
      listId: null,
      ownerSceneKey: null,
    };
  }
  const params = activeOverlayRoute.params as OverlayRouteEntry<'favoriteListDetail'>['params'];
  return {
    listId: params?.listId ?? null,
    ownerSceneKey: params?.ownerSceneKey ?? null,
  };
};

export const useAppRouteFavoriteListDetailSceneInputWriterRuntime = ({
  routeSceneRuntime,
  activeOverlayRoute,
  sceneLayout,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
  activeOverlayRoute: OverlayRouteEntry;
  sceneLayout: SearchRouteSceneLayoutState;
}): void => {
  const routeState = getFavoriteListDetailRouteState(activeOverlayRoute);
  const handleClose = React.useCallback(() => {
    routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
  }, [routeSceneRuntime.routeOverlayRouteCommandRuntime]);
  const favoriteListDetailSceneDescriptor = useFavoriteListDetailRouteSceneDescriptor({
    listId: routeState.listId,
    ownerSceneKey: routeState.ownerSceneKey,
    sceneLayout,
    isActive: activeOverlayRoute.key === 'favoriteListDetail',
    onClose: handleClose,
  });

  React.useEffect(() => {
    if (favoriteListDetailSceneDescriptor == null) {
      routeSceneRuntime.sceneInputLane.clearRouteSceneInput('favoriteListDetail');
      return;
    }
    routeSceneRuntime.sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'favoriteListDetail',
      ...(favoriteListDetailSceneDescriptor satisfies FavoriteListDetailRouteSceneDescriptor),
    });
  }, [favoriteListDetailSceneDescriptor, routeSceneRuntime.sceneInputLane]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.sceneInputLane.clearRouteSceneInput('favoriteListDetail');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
