import type {
  SearchRootRouteRestaurantOverlayInteractionPublicationLane,
  SearchRootRouteRestaurantOverlayPolicyPublicationLane,
  SearchRootRouteRestaurantOverlayPanelContentPublicationLane,
  SearchRootRouteVisualHostPublicationLane,
} from './search-root-route-runtime-contract';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { useSearchRootRuntimeVisualAssemblyRuntime } from './use-search-root-runtime-visual-assembly-runtime';

export type SearchRootRouteAncillaryPublicationRuntimeParams = {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  routeVisualHostPublicationLane: SearchRootRouteVisualHostPublicationLane;
  routeRestaurantOverlayPanelContentPublicationLane: SearchRootRouteRestaurantOverlayPanelContentPublicationLane;
  routeRestaurantOverlayPolicyPublicationLane: SearchRootRouteRestaurantOverlayPolicyPublicationLane;
  routeRestaurantOverlayInteractionPublicationLane: SearchRootRouteRestaurantOverlayInteractionPublicationLane;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
};
