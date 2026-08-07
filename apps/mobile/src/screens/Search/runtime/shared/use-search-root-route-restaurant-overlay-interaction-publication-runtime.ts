import React from 'react';

import type {
  SearchRootRouteRestaurantOverlayInteractionPublication,
  SearchRootRouteRestaurantOverlayInteractionPublicationLane,
} from './search-root-route-publication-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootProfilePresentationControlLane } from './search-root-control-plane-runtime-contract';

type UseSearchRootRouteRestaurantOverlayInteractionPublicationRuntimeArgs = {
  routeRestaurantOverlayInteractionPublicationLane: SearchRootRouteRestaurantOverlayInteractionPublicationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
};

export const useSearchRootRouteRestaurantOverlayInteractionPublicationRuntime = ({
  routeRestaurantOverlayInteractionPublicationLane,
  rootOverlayFoundationRuntime,
  profilePresentationControlLane,
}: UseSearchRootRouteRestaurantOverlayInteractionPublicationRuntimeArgs): void => {
  const routeRestaurantOverlayInteractionPublication =
    React.useMemo<SearchRootRouteRestaurantOverlayInteractionPublication>(
      () => ({
        closeRestaurantProfile:
          profilePresentationControlLane.profileOwner.profileActions.closeRestaurantProfile,
      }),
      [profilePresentationControlLane.profileOwner.profileActions.closeRestaurantProfile]
    );

  React.useEffect(() => {
    routeRestaurantOverlayInteractionPublicationLane.syncRouteRestaurantOverlayInteractionPublication(
      routeRestaurantOverlayInteractionPublication
    );
  }, [
    routeRestaurantOverlayInteractionPublication,
    routeRestaurantOverlayInteractionPublicationLane,
  ]);
};
