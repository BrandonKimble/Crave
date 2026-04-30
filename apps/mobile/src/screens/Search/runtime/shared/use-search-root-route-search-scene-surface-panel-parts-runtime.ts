import type {
  SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneInteractionFrostRuntime,
  SearchRootRuntimeRouteSearchSceneDataRuntime,
  SearchRootRuntimeRouteSearchSceneReadModelRuntime,
  SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime,
} from './route-search-scene-runtime-contract';
import { useSearchRootSearchScenePanelSurfaceCompositeRuntime } from './use-search-root-search-scene-panel-surface-composite-runtime';

export const useSearchRootRouteSearchSceneSurfacePanelPartsRuntime = ({
  visualAssemblyRuntime,
  routeSearchSceneDataRuntime,
  routeSearchSceneReadModelRuntime,
  routeSearchSceneSurfaceStateRuntime,
  routeSearchSceneInteractionFrostRuntime,
}: Pick<SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs, 'visualAssemblyRuntime'> & {
  routeSearchSceneDataRuntime: SearchRootRuntimeRouteSearchSceneDataRuntime;
  routeSearchSceneReadModelRuntime: SearchRootRuntimeRouteSearchSceneReadModelRuntime;
  routeSearchSceneSurfaceStateRuntime: SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime;
  routeSearchSceneInteractionFrostRuntime: SearchRootRuntimeRouteSearchSceneInteractionFrostRuntime;
}) => {
  const routeSearchScenePanelSurfaceCompositeRuntime =
    useSearchRootSearchScenePanelSurfaceCompositeRuntime({
      sceneVisualRuntime: visualAssemblyRuntime.sceneVisualRuntime,
      resolvedResultsHeaderHeightForRender:
        routeSearchSceneDataRuntime.routeSearchSceneChromeFreezeRuntime
          .effectiveResultsHeaderHeightForRender || 64,
      preMeasureOverlay:
        routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors
          .preMeasureOverlay,
      shouldShowResultsSurface:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
          .shouldShowResultsSurface,
      shouldRenderWhiteWash:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
          .shouldRenderWhiteWash,
      shouldUseInteractionSurface:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime
          .shouldUseInteractionSurface,
      surfaceActive:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime.surfaceActive,
      surfaceMode:
        routeSearchSceneSurfaceStateRuntime.routeSearchSceneSurfacePanelStateRuntime.surfaceMode,
      searchSceneRenderRuntime: routeSearchSceneSurfaceStateRuntime.routeSearchSceneRenderRuntime,
      interactionFrostAnimatedStyle:
        routeSearchSceneInteractionFrostRuntime.interactionFrostAnimatedStyle,
      resolvedResults:
        routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
      activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
      onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
    });

  return {
    routeSearchScenePanelBackgroundComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.backgroundComponent,
    routeSearchScenePanelOverlayComponent:
      routeSearchScenePanelSurfaceCompositeRuntime.overlayComponent,
  };
};
