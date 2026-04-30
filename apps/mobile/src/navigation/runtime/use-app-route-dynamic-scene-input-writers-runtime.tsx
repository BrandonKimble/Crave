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
import { useRouteAuthoritySelector } from './use-route-authority-selector';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

const INACTIVE_POLL_CREATION_ROUTE: OverlayRouteEntry = {
  key: 'search',
  params: undefined,
};

type PollCreationRouteStateRuntime = {
  activeOverlayRoute: OverlayRouteEntry;
};

const useAppRoutePollsRouteStateRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): PollCreationRouteStateRuntime => {
  const selectPollCreationRoute = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot): PollCreationRouteStateRuntime => ({
      activeOverlayRoute:
        snapshot.activeOverlayRoute.key === 'pollCreation'
          ? snapshot.activeOverlayRoute
          : INACTIVE_POLL_CREATION_ROUTE,
    }),
    []
  );
  const [overlayNavigationState, setOverlayNavigationState] =
    React.useState<PollCreationRouteStateRuntime>(() =>
      selectPollCreationRoute(routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot())
    );

  React.useEffect(
    () =>
      routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
        selector: selectPollCreationRoute,
        syncNavigationSnapshot: (_snapshot, selectedRouteState) => {
          setOverlayNavigationState(selectedRouteState);
        },
        isEqual: (left, right) => left.activeOverlayRoute === right.activeOverlayRoute,
        attributionLabel: 'AppRoutePollCreationSceneInputWriterRuntime',
      }),
    [routeSceneRuntime, selectPollCreationRoute]
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
  const pollsRouteStateRuntime = useAppRoutePollsRouteStateRuntime({
    routeSceneRuntime,
  });
  const sceneLayout = useAppRouteSceneLayoutRuntime({
    routeSceneRuntime,
  });
  const routeSheetSnapSessionState = useAppRouteSheetSnapSessionSelector({
    authority: routeSceneRuntime.routeSheetSnapSessionAuthority,
    selector: React.useCallback(
      (snapshot): AppRouteSceneSheetSessionInputState => ({
        pollsDockedSnapRequest: snapshot.pollsDockedSnapRequest,
        isDockedPollsDismissed: snapshot.isDockedPollsDismissed,
        dockedPollsRestoreInFlight: snapshot.dockedPollsRestoreInFlight,
        ignoreDockedPollsHiddenUntilMs: snapshot.ignoreDockedPollsHiddenUntilMs,
        pollCreationSnapRequest: snapshot.pollCreationSnapRequest,
      }),
      []
    ),
    isEqual: areAppRouteSceneSheetSessionInputStatesEqual,
  });

  useAppRoutePollCreationSceneInputWriterRuntime({
    routeSceneRuntime,
    activeOverlayRoute: pollsRouteStateRuntime.activeOverlayRoute,
    sceneLayout,
    pollCreationSnapRequest: routeSheetSnapSessionState.pollCreationSnapRequest,
  });
};
