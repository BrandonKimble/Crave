import React from 'react';

import type {
  SearchRootProfileAppExecutionArgsRuntime,
  UseSearchRootProfileActionRuntimeArgs,
} from './use-search-root-profile-action-runtime-contract';

type UseSearchRootProfileAppExecutionArgsRuntimeArgs = Pick<
  UseSearchRootProfileActionRuntimeArgs,
  'rootSessionRuntime' | 'requestLaneRuntime'
>;

export const useSearchRootProfileAppExecutionArgsRuntime = ({
  rootSessionRuntime,
  requestLaneRuntime,
}: UseSearchRootProfileAppExecutionArgsRuntimeArgs): SearchRootProfileAppExecutionArgsRuntime => {
  const {
    runtimeOwner: { phaseBMaterializerRef },
    runtimeFlags: { hydrationOperationId },
    hydrationRuntimeState: { resultsHydrationKey, hydratedResultsKey },
  } = rootSessionRuntime;
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: {
        clearOwner: { clearSearchAfterProfileDismiss },
        resultsPresentationOwner,
      },
    },
  } = requestLaneRuntime;

  const pendingMarkerOpenAnimationFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
      if (pendingFrame != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    };
  }, []);

  return {
    pendingMarkerOpenAnimationFrameRef,
    appExecutionArgs: {
      foregroundExecutionArgs: {
        ensureInitialCameraReady: rootSessionRuntime.mapBootstrapRuntime.ensureInitialCameraReady,
      },
      closeExecutionArgs: {
        pendingMarkerOpenAnimationFrameRef,
        resultsHydrationKey,
        hydratedResultsKey,
        hydrationOperationId,
        phaseBMaterializerRef,
        clearSearchAfterProfileDismiss,
      },
      resultsExecutionArgs: {
        resultsSheetExecutionModel: resultsPresentationOwner.resultsSheetExecutionModel,
      },
    },
  };
};
