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
    routeSearchSceneOnRuntimeMechanismEvent:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .emitRuntimeMechanismEvent,
    routeSearchScenePhaseBMaterializerRef:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.phaseBMaterializerRef,
    routeSearchSceneSearchInteractionRef:
      stateAssemblyRuntime.stateFoundationLane.sessionPrimitivesLane.primitives
        .searchInteractionRef,
  };
};
