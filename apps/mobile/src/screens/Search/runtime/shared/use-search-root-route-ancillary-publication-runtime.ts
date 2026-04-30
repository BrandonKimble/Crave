import { useSearchRootRouteRestaurantOverlayInteractionPublicationRuntime } from './use-search-root-route-restaurant-overlay-interaction-publication-runtime';
import { useSearchRootRouteRestaurantOverlayPolicyPublicationRuntime } from './use-search-root-route-restaurant-overlay-policy-publication-runtime';
import { useSearchRootRouteRestaurantOverlayPanelContentPublicationRuntime } from './use-search-root-route-restaurant-overlay-panel-content-publication-runtime';
import { useSearchRootRouteVisualHostPublicationRuntime } from './use-search-root-route-visual-host-publication-runtime';
import type { SearchRootRouteAncillaryPublicationRuntimeParams } from './search-root-route-publication-runtime-contract';

export const useSearchRootRouteAncillaryPublicationRuntime = ({
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  routeVisualHostPublicationLane,
  routeRestaurantOverlayPanelContentPublicationLane,
  routeRestaurantOverlayPolicyPublicationLane,
  routeRestaurantOverlayInteractionPublicationLane,
  profileControlRuntime,
  resultsControlRuntime,
  visualAssemblyRuntime,
}: SearchRootRouteAncillaryPublicationRuntimeParams): void => {
  useSearchRootRouteVisualHostPublicationRuntime({
    routeVisualHostPublicationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    routeHostVisualRuntime: visualAssemblyRuntime.hostVisualRuntime.routeHostVisualRuntime,
  });
  useSearchRootRouteRestaurantOverlayPanelContentPublicationRuntime({
    routeRestaurantOverlayPanelContentPublicationLane,
    profilePresentationControlLane: profileControlRuntime.profilePresentationControlLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
  });
  useSearchRootRouteRestaurantOverlayPolicyPublicationRuntime({
    routeRestaurantOverlayPolicyPublicationLane,
    resultsPresentationStateControlLane: resultsControlRuntime.resultsPresentationStateControlLane,
  });
  useSearchRootRouteRestaurantOverlayInteractionPublicationRuntime({
    routeRestaurantOverlayInteractionPublicationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    profilePresentationControlLane: profileControlRuntime.profilePresentationControlLane,
  });
};
