import React from 'react';

import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteOverlayNavigationSnapshot } from './route-overlay-navigation-snapshot-contract';
import type { RouteSceneLayoutSnapshot } from '../../screens/Search/runtime/shared/route-scene-layout-snapshot-contract';
import { useAppRouteSheetSnapSessionSelector } from './app-route-sheet-snap-session-runtime';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import {
  areAppRouteSceneSheetSessionInputStatesEqual,
  type AppRouteSceneSheetSessionInputState,
} from './app-route-dynamic-scene-inputs-contract';
import { useAppRoutePollCreationSceneInputWriterRuntime } from './use-app-route-poll-creation-scene-input-writer-runtime';
import { useAppRoutePollDetailSceneInputWriterRuntime } from './use-app-route-poll-detail-scene-input-writer-runtime';
import { useRouteAuthoritySelector } from './use-route-authority-selector';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const INACTIVE_DYNAMIC_CHILD_ROUTE: OverlayRouteEntry = {
  key: 'search',
  params: undefined,
};

type DynamicChildRouteStateRuntime = {
  activeOverlayRoute: OverlayRouteEntry;
};

const useAppRouteDynamicChildRouteStateRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): DynamicChildRouteStateRuntime => {
  const selectDynamicChildRoute = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot): DynamicChildRouteStateRuntime => ({
      activeOverlayRoute: ['pollCreation', 'pollDetail'].includes(
        snapshot.activeOverlayRoute.key
      )
        ? snapshot.activeOverlayRoute
        : INACTIVE_DYNAMIC_CHILD_ROUTE,
    }),
    []
  );
  const [overlayNavigationState, setOverlayNavigationState] =
    React.useState<DynamicChildRouteStateRuntime>(() =>
      selectDynamicChildRoute(routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot())
    );

  React.useEffect(
    () =>
      routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
        selector: selectDynamicChildRoute,
        syncNavigationSnapshot: (_snapshot, selectedRouteState) => {
          setOverlayNavigationState(selectedRouteState);
        },
        isEqual: (left, right) => left.activeOverlayRoute === right.activeOverlayRoute,
        attributionLabel: 'AppRouteDynamicChildSceneInputWriterRuntime',
      }),
    [routeSceneRuntime, selectDynamicChildRoute]
  );

  return React.useMemo(() => overlayNavigationState, [overlayNavigationState]);
};

const useAppRouteSceneLayoutRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): SearchRouteSceneLayoutState => {
  const sceneLayout = useRouteAuthoritySelector({
    subscribe: routeSceneRuntime.routeSceneLayoutAuthority.subscribe,
    getSnapshot: routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: RouteSceneLayoutSnapshot) => snapshot.routeSceneLayout,
      []
    ),
    attributionOwner: 'AppRoutePollCreationSceneInputWriterRuntime',
    attributionOperation: 'sceneLayoutSelector',
  });

  return sceneLayout ?? EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE;
};

export const useAppRouteDynamicSceneInputWritersRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  useSearchNavSwitchCommitAttribution('AppRoutePollCreationSceneInputWriterRuntime');
  const dynamicChildRouteStateRuntime = useAppRouteDynamicChildRouteStateRuntime({
    routeSceneRuntime,
  });
  const sceneLayout = useAppRouteSceneLayoutRuntime({
    routeSceneRuntime,
  });
  const routeSheetSnapSessionState = useAppRouteSheetSnapSessionSelector({
    authority: routeSceneRuntime.routeSheetSnapSessionAuthority,
    selector: React.useCallback(
      (snapshot): AppRouteSceneSheetSessionInputState => ({
        isDockedPollsDismissed: snapshot.isDockedPollsDismissed,
      }),
      []
    ),
    isEqual: areAppRouteSceneSheetSessionInputStatesEqual,
  });

  useAppRoutePollCreationSceneInputWriterRuntime({
    routeSceneRuntime,
    activeOverlayRoute: dynamicChildRouteStateRuntime.activeOverlayRoute,
    sceneLayout,
  });
  useAppRoutePollDetailSceneInputWriterRuntime({
    routeSceneRuntime,
    activeOverlayRoute: dynamicChildRouteStateRuntime.activeOverlayRoute,
    sceneLayout,
  });
};
