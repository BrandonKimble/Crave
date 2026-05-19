import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import { useSearchRootSearchSceneBusPublicationRuntime } from './use-search-root-search-scene-bus-publication-runtime';
import { useSearchRootSearchSceneListHydrationPublicationRuntime } from './use-search-root-search-scene-list-hydration-publication-runtime';
import type { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';

export const useSearchRouteSearchSceneBusPublicationOwner = ({
  sessionAssemblyRuntime,
  routeSearchSceneModel,
  routeSceneSwitchAuthority,
  filterModalControlLane,
  foregroundInteractionControlLane,
}: {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  routeSearchSceneModel: ReturnType<typeof useSearchRouteSearchSceneModelOwner>;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): void => {
  useSearchRootSearchSceneListHydrationPublicationRuntime({
    activeTab:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState
        .activeTab,
    resultsPresentationSurfaceAuthority:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.resultsPresentationSurfaceAuthority,
    routeSceneSwitchAuthority,
    searchInteractionRef:
      sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
    hydrationKeyRuntime:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime,
    resultsReadModelSelectors:
      routeSearchSceneModel.routeSearchSceneReadModelRuntime
        .routeSearchSceneResultsReadModelSelectors,
  });
  useSearchRootSearchSceneBusPublicationRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    filterModalControlLane,
    foregroundInteractionControlLane,
  });
};
