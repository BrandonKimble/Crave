import type {
  SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
  SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchScenePanelSurfaceCompositeRuntime } from './use-search-root-search-scene-panel-surface-composite-runtime';

export const useSearchRootRouteSearchSceneSurfacePanelPartsRuntime = ({
  routeSearchSceneDataRuntime,
  routeSearchSceneSurfaceStateRuntime,
}: Pick<SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs, 'visualAssemblyRuntime'> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneReadModelRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime;
  routeSearchSceneSurfaceStateRuntime: SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime;
}) => {
  const routeSearchScenePanelSurfaceCompositeRuntime =
    useSearchRootSearchScenePanelSurfaceCompositeRuntime({
      resolvedResultsHeaderHeightForRender:
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
          .effectiveResultsHeaderHeightForRender || 64,
      filtersHeaderHeight:
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
          .effectiveFiltersHeaderHeightBase || 0,
      shouldShowResultsSurface:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
          .shouldShowResultsSurface,
      surfaceActive:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime.surfaceActive,
      surfaceMode:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime.surfaceMode,
      resolvedResults:
        routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
      activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
      onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
      resolutionFailure:
        routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.resolutionFailure,
      onRetryResolution: routeSearchSceneDataRuntime.routeSearchSceneRetryResolution,
    });

  return {
    routeSearchScenePanelBackgroundComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.backgroundComponent,
    routeSearchScenePanelOverlayComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.overlayComponent,
  };
};
