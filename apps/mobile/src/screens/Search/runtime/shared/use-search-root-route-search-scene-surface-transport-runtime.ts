import type {
  SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
  SearchRootRuntimeRouteSearchSceneSheetTransportRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchSceneListItemContentRuntime } from './use-search-root-search-scene-list-item-content-runtime';
import { useSearchRootSearchSceneSheetPlaneRuntime } from './use-search-root-search-scene-sheet-plane-runtime';

export const useSearchRootRouteSearchSceneSurfaceTransportRuntime = ({
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  resultsControlRuntime,
  visualAssemblyRuntime,
  routeSearchSceneDataRuntime,
  routeSearchSceneReadModelRuntime,
}: Pick<
  SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs,
  | 'stateAssemblyRuntime'
  | 'overlayFoundationAssemblyRuntime'
  | 'resultsControlRuntime'
  | 'visualAssemblyRuntime'
> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneReadModelRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime;
}): SearchRootRuntimeRouteSearchSceneSheetTransportRuntime => {
  const routeSearchSceneListItemContentRuntime = useSearchRootSearchSceneListItemContentRuntime({
    activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
    renderListItem:
      routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors.renderListItem,
  });
  const routeSearchSceneSheetPlaneRuntime = useSearchRootSearchSceneSheetPlaneRuntime({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    resultsSheetControlLane: resultsControlRuntime.resultsSheetControlLane,
    resultsPresentationStateControlLane: resultsControlRuntime.resultsPresentationStateControlLane,
    searchSheetContentLaneKind:
      routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind,
    sceneVisualRuntime: visualAssemblyRuntime.sceneVisualRuntime,
  });
  return {
    routeSearchSceneListItemContentRuntime,
    routeSearchSceneSheetPlaneRuntime,
  };
};
