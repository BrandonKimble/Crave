import { computeSceneChromeHeight } from '../../../../navigation/runtime/scene-chrome-geometry';
import type {
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchScenePanelSurfaceCompositeRuntime } from './use-search-root-search-scene-panel-surface-composite-runtime';

export const useSearchRootRouteSearchSceneSurfacePanelPartsRuntime = ({
  routeSearchSceneDataRuntime,
  routeSearchSceneSurfaceStateRuntime,
  // F1336(c): this used to also declare `visualAssemblyRuntime` (via a Pick<> on the results
  // surface args) and `routeSearchSceneReadModelRuntime`. Neither was destructured; the caller
  // passed both every render. Two more dead parameters, without even a `void` to admit it.
}: {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneSurfaceStateRuntime: SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime;
}) => {
  const routeSearchScenePanelSurfaceCompositeRuntime =
    useSearchRootSearchScenePanelSurfaceCompositeRuntime({
      // The COMPUTED chrome fact (strip-band seam law §4) — the measured lane and its
      // magic 64 fallback are deleted.
      resolvedResultsHeaderHeightForRender: computeSceneChromeHeight('search'),
      shouldShowResultsSurface:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
          .shouldShowResultsSurface,
      surfaceMode:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime.surfaceMode,
      resolvedResults:
        routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
      activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
      onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
      resolutionFailure:
        routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.resolutionFailure,
    });

  return {
    routeSearchScenePanelBackgroundComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.backgroundComponent,
    routeSearchScenePanelOverlayComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.overlayComponent,
  };
};
