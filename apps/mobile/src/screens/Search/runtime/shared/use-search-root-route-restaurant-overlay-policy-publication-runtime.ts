import React from 'react';

import type {
  SearchRootRouteRestaurantOverlayPolicyPublication,
  SearchRootRouteRestaurantOverlayPolicyPublicationLane,
} from './search-root-route-publication-contract';
import type { SearchRootResultsPresentationStateControlLane } from './use-search-root-control-plane-runtime-contract';

type UseSearchRootRouteRestaurantOverlayPolicyPublicationRuntimeArgs = {
  routeRestaurantOverlayPolicyPublicationLane: SearchRootRouteRestaurantOverlayPolicyPublicationLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
};

export const useSearchRootRouteRestaurantOverlayPolicyPublicationRuntime = ({
  routeRestaurantOverlayPolicyPublicationLane,
  resultsPresentationStateControlLane,
}: UseSearchRootRouteRestaurantOverlayPolicyPublicationRuntimeArgs): void => {
  const routeRestaurantOverlayPolicyPublication =
    React.useMemo<SearchRootRouteRestaurantOverlayPolicyPublication>(
      () => ({
        shouldSuppressRestaurantOverlay:
          resultsPresentationStateControlLane.presentationState.shouldSuppressRestaurantOverlay,
        shouldFreezeRestaurantPanelContent:
          resultsPresentationStateControlLane.presentationState.shouldFreezeRestaurantPanelContent,
        shouldEnableRestaurantOverlayInteraction:
          resultsPresentationStateControlLane.presentationState
            .shouldEnableRestaurantOverlayInteraction,
      }),
      [
        resultsPresentationStateControlLane.presentationState
          .shouldEnableRestaurantOverlayInteraction,
        resultsPresentationStateControlLane.presentationState.shouldFreezeRestaurantPanelContent,
        resultsPresentationStateControlLane.presentationState.shouldSuppressRestaurantOverlay,
      ]
    );

  React.useEffect(() => {
    routeRestaurantOverlayPolicyPublicationLane.syncRouteRestaurantOverlayPolicyPublication(
      routeRestaurantOverlayPolicyPublication
    );
  }, [routeRestaurantOverlayPolicyPublication, routeRestaurantOverlayPolicyPublicationLane]);
};
