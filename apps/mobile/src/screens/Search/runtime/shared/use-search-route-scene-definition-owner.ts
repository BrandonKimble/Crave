import type { RouteShellSceneInputLane } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { useSearchRootRuntimeVisualAssemblyRuntime } from './use-search-root-runtime-visual-assembly-runtime';
import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { RouteSceneSwitchAuthority } from './search-root-route-runtime-contract';
import { useSearchRouteSearchSceneBodyInputOwner } from './use-search-route-search-scene-body-input-owner';
import { useSearchRouteSearchSceneBusPublicationOwner } from './use-search-route-search-scene-bus-publication-owner';
import { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';
import { useSearchRouteSearchSceneRouteInputOwner } from './use-search-route-search-scene-route-input-owner';
import type { SearchRouteResultsPolicyRuntime } from './search-route-results-policy-domain-contract';

type SearchRouteSceneDefinitionOwnerParams = {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  routeSceneInputLane: RouteShellSceneInputLane;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  searchRouteResultsPolicyRuntime: SearchRouteResultsPolicyRuntime;
};

export const useSearchRouteSceneDefinitionOwner = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  visualAssemblyRuntime,
  routeSceneSwitchAuthority,
  routeSceneInputLane,
  controlAuthorityRuntime,
  profileControlRuntime,
  resultsControlRuntime,
  filterModalControlLane,
  foregroundInteractionControlLane,
  searchRouteResultsPolicyRuntime,
}: SearchRouteSceneDefinitionOwnerParams): void => {
  const routeSearchSceneModel = useSearchRouteSearchSceneModelOwner({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    visualAssemblyRuntime,
    routeSceneSwitchAuthority,
    controlAuthorityRuntime,
    profileControlRuntime,
    resultsControlRuntime,
    filterModalControlLane,
    surfacePolicyController: searchRouteResultsPolicyRuntime.surfacePolicyController,
    readModelPolicyWriters: searchRouteResultsPolicyRuntime.readModelPolicyWriters,
  });

  useSearchRouteSearchSceneRouteInputOwner({
    routeSceneInputLane,
    routeSearchSceneModel,
  });

  useSearchRouteSearchSceneBodyInputOwner({
    routeSceneInputLane,
    routeSearchSceneModel,
  });

  useSearchRouteSearchSceneBusPublicationOwner({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    routeSearchSceneModel,
    profileControlRuntime,
    resultsControlRuntime,
    filterModalControlLane,
    foregroundInteractionControlLane,
  });
};
