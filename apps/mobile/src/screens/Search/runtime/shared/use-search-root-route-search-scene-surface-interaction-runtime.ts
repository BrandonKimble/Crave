import type {
  SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneInteractionFrostRuntime,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchSceneInteractionFrostRuntime } from './use-search-root-search-scene-interaction-frost-runtime';

export const useSearchRootRouteSearchSceneSurfaceInteractionRuntime = ({
  controlAuthorityRuntime,
  routeSearchSceneDataRuntime,
  routeSearchSceneSurfaceStateRuntime,
}: Pick<SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs, 'controlAuthorityRuntime'> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneSurfaceStateRuntime: SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime;
}): SearchRootRuntimeRouteSearchSceneInteractionFrostRuntime =>
  useSearchRootSearchSceneInteractionFrostRuntime({
    notifyToggleInteractionFrostReady:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
        .resultsPresentationOwner.interactionModel.notifyToggleInteractionFrostReady,
    pendingPresentationIntentId:
      routeSearchSceneDataRuntime.routeSearchScenePresentationRuntimeState
        .pendingPresentationIntentId,
    shouldShowInteractionLoadingState:
      routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
        .shouldShowInteractionLoadingState,
  });
