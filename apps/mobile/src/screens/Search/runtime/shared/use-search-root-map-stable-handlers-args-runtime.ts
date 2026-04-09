import type {
  SearchRootMapStableHandlersArgsRuntime,
  UseSearchRootMapDisplayRuntimeArgs,
} from './use-search-root-map-display-runtime-contract';

export const useSearchRootMapStableHandlersArgsRuntime = ({
  rootSessionRuntime,
  requestLaneRuntime,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'rootSessionRuntime' | 'requestLaneRuntime'
>): SearchRootMapStableHandlersArgsRuntime => {
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;

  return {
    stableHandlersArgs: {
      handleMapLoaded: rootSessionRuntime.mapBootstrapRuntime.handleMapLoaded,
      handleExecutionBatchMountedHidden: resultsPresentationOwner.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: resultsPresentationOwner.handleMarkerEnterStarted,
      handleMarkerEnterSettled: resultsPresentationOwner.handleMarkerEnterSettled,
      handleMarkerExitStarted: resultsPresentationOwner.handleMarkerExitStarted,
      handleMarkerExitSettled: resultsPresentationOwner.handleMarkerExitSettled,
    },
  };
};
