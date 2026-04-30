import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import { useSearchRootSearchSceneBusPublicationRuntime } from './use-search-root-search-scene-bus-publication-runtime';
import { useSearchRootSearchSceneListHydrationPublicationRuntime } from './use-search-root-search-scene-list-hydration-publication-runtime';
import type { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';

export const useSearchRouteSearchSceneBusPublicationOwner = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  routeSearchSceneModel,
  profileControlRuntime,
  resultsControlRuntime,
  filterModalControlLane,
  foregroundInteractionControlLane,
}: {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  routeSearchSceneModel: ReturnType<typeof useSearchRouteSearchSceneModelOwner>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): void => {
  useSearchRootSearchSceneListHydrationPublicationRuntime({
    searchRuntimeBus: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.searchRuntimeBus,
    resolvedResultsRuntime:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime,
    hydrationKeyRuntime:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime,
    resultsReadModelSelectors:
      routeSearchSceneModel.routeSearchSceneReadModelRuntime
        .routeSearchSceneResultsReadModelSelectors,
  });
  useSearchRootSearchSceneBusPublicationRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    filterModalControlLane,
    foregroundInteractionControlLane,
    profilePresentationControlLane: profileControlRuntime.profilePresentationControlLane,
    preparedResultsSnapshotControlLane: resultsControlRuntime.preparedResultsSnapshotControlLane,
  });
};
