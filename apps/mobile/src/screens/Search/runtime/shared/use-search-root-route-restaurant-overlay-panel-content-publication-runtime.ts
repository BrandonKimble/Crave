import React from 'react';

import type {
  SearchRootRouteRestaurantOverlayPanelContentPublication,
  SearchRootRouteRestaurantOverlayPanelContentPublicationLane,
} from './search-root-route-publication-contract';
import type { SearchRootProfilePresentationControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootRouteRestaurantOverlayPanelContentPublicationRuntimeArgs = {
  routeRestaurantOverlayPanelContentPublicationLane: SearchRootRouteRestaurantOverlayPanelContentPublicationLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootRouteRestaurantOverlayPanelContentPublicationRuntime = ({
  routeRestaurantOverlayPanelContentPublicationLane,
  profilePresentationControlLane,
  stateFoundationLane,
}: UseSearchRootRouteRestaurantOverlayPanelContentPublicationRuntimeArgs): void => {
  const routeRestaurantOverlayPanelContentPublication =
    React.useMemo<SearchRootRouteRestaurantOverlayPanelContentPublication>(
      () => ({
        restaurantPanelSnapshot:
          profilePresentationControlLane.profileOwner.profileViewState.restaurantPanelSnapshot,
        suggestionProgress: stateFoundationLane.rootSuggestionRuntime.suggestionProgress,
      }),
      [
        profilePresentationControlLane.profileOwner.profileViewState.restaurantPanelSnapshot,
        stateFoundationLane.rootSuggestionRuntime.suggestionProgress,
      ]
    );

  React.useEffect(() => {
    routeRestaurantOverlayPanelContentPublicationLane.syncRouteRestaurantOverlayPanelContentPublication(
      routeRestaurantOverlayPanelContentPublication
    );
  }, [
    routeRestaurantOverlayPanelContentPublication,
    routeRestaurantOverlayPanelContentPublicationLane,
  ]);
};
