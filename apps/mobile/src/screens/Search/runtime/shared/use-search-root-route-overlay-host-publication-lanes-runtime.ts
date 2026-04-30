import React from 'react';

import {
  EMPTY_SEARCH_ROOT_ROUTE_HOST_PUBLICATION,
  type SearchRootRouteHostPublication,
} from './search-root-route-publication-contract';
import type {
  SearchRootRouteRestaurantOverlayInteractionPublicationLane,
  SearchRootRouteRestaurantOverlayPolicyPublicationLane,
  SearchRootRouteRestaurantOverlayPanelContentPublicationLane,
  SearchRootRouteVisualHostPublicationLane,
} from './search-root-route-runtime-contract';
import type { useSearchRootRouteControlRuntime } from './use-search-root-route-control-runtime';

export const useSearchRootRouteOverlayHostPublicationLanesRuntime = ({
  routeSceneRuntime,
  routeRestaurantOverlayRuntime,
}: Pick<
  ReturnType<typeof useSearchRootRouteControlRuntime>,
  'routeSceneRuntime' | 'routeRestaurantOverlayRuntime'
>): {
  routeVisualHostPublicationLane: SearchRootRouteVisualHostPublicationLane;
  routeRestaurantOverlayPanelContentPublicationLane: SearchRootRouteRestaurantOverlayPanelContentPublicationLane;
  routeRestaurantOverlayPolicyPublicationLane: SearchRootRouteRestaurantOverlayPolicyPublicationLane;
  routeRestaurantOverlayInteractionPublicationLane: SearchRootRouteRestaurantOverlayInteractionPublicationLane;
} => {
  const routeHostPublicationRef = React.useRef<SearchRootRouteHostPublication>(
    EMPTY_SEARCH_ROOT_ROUTE_HOST_PUBLICATION
  );
  const routeVisualHostPublicationLane: SearchRootRouteVisualHostPublicationLane = React.useMemo(
    () => ({
      syncRouteHostPublication: (routeHostPublication) => {
        const previousRouteHostPublication = routeHostPublicationRef.current;

        if (
          previousRouteHostPublication.routeHostOverlayGeometryRuntime !==
          routeHostPublication.routeHostOverlayGeometryRuntime
        ) {
          routeSceneRuntime.syncRouteHostOverlayGeometryRuntime(
            routeHostPublication.routeHostOverlayGeometryRuntime
          );
        }
        if (
          previousRouteHostPublication.routeHostVisualRuntime !==
          routeHostPublication.routeHostVisualRuntime
        ) {
          routeSceneRuntime.syncRouteHostVisualRuntime(routeHostPublication.routeHostVisualRuntime);
        }

        routeHostPublicationRef.current = routeHostPublication;
      },
    }),
    [routeSceneRuntime]
  );

  React.useEffect(
    () => () => {
      routeVisualHostPublicationLane.syncRouteHostPublication(
        EMPTY_SEARCH_ROOT_ROUTE_HOST_PUBLICATION
      );
    },
    [routeVisualHostPublicationLane]
  );

  return {
    routeVisualHostPublicationLane,
    routeRestaurantOverlayPanelContentPublicationLane:
      routeRestaurantOverlayRuntime.routeRestaurantOverlayPanelContentPublicationLane,
    routeRestaurantOverlayPolicyPublicationLane:
      routeRestaurantOverlayRuntime.routeRestaurantOverlayPolicyPublicationLane,
    routeRestaurantOverlayInteractionPublicationLane:
      routeRestaurantOverlayRuntime.routeRestaurantOverlayInteractionPublicationLane,
  };
};
