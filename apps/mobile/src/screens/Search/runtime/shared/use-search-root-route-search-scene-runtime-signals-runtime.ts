import type {
  SearchRootRouteSearchSceneDataRuntimeArgs,
  SearchRootRuntimeRouteSearchSceneRuntimeSignalsRuntime,
} from './route-search-scene-runtime-contract';

export const useSearchRootRouteSearchSceneRuntimeSignalsRuntime = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
}: Pick<
  SearchRootRouteSearchSceneDataRuntimeArgs,
  'sessionAssemblyRuntime' | 'stateAssemblyRuntime' | 'overlayFoundationAssemblyRuntime'
>): SearchRootRuntimeRouteSearchSceneRuntimeSignalsRuntime => {
  return {
    routeSearchSceneShouldLogResultsViewability:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .shouldLogResultsViewability,
    routeSearchSceneOnRuntimeMechanismEvent:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .emitRuntimeMechanismEvent,
    routeSearchSceneHeaderDividerAnimatedStyle:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.appRouteResultsSheetRuntimeOwner
        .headerDividerAnimatedStyle,
    routeSearchSceneMapQueryBudget:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.mapQueryBudget,
    routeSearchScenePhaseBMaterializerRef:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.phaseBMaterializerRef,
    routeSearchSceneSearchInteractionRef:
      stateAssemblyRuntime.stateFoundationLane.sessionPrimitivesLane.primitives
        .searchInteractionRef,
  };
};
