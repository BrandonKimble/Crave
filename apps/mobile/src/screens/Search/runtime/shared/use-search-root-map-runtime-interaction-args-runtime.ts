import type { SearchRootMapInteractionArgsRuntime } from './use-search-root-map-display-runtime-contract';
import type { UseSearchRootMapDisplayRuntimeArgs } from './use-search-root-map-display-runtime-contract';

export type SearchRootMapRuntimeInteractionArgsRuntime = {
  interactionArgs: Pick<
    SearchRootMapInteractionArgsRuntime['interactionArgs'],
    | 'searchInteractionRef'
    | 'anySheetDraggingRef'
    | 'pendingMarkerOpenAnimationFrameRef'
    | 'isSearchSessionActive'
    | 'cancelAutocomplete'
    | 'cameraIntentArbiter'
    | 'viewportBoundsService'
    | 'commitCameraViewport'
    | 'lastCameraStateRef'
    | 'lastPersistedCameraRef'
    | 'hasResults'
  >;
};

export const useSearchRootMapRuntimeInteractionArgsRuntime = ({
  rootSessionRuntime,
  pendingMarkerOpenAnimationFrameRef,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'rootSessionRuntime' | 'pendingMarkerOpenAnimationFrameRef'
>): SearchRootMapRuntimeInteractionArgsRuntime => {
  const {
    runtimeOwner: { viewportBoundsService, cameraIntentArbiter },
    resultsArrivalState: { hasResults },
    runtimeFlags: { isSearchSessionActive },
    primitives: {
      searchInteractionRef,
      anySheetDraggingRef,
      lastCameraStateRef,
      lastPersistedCameraRef,
      commitCameraViewport,
    },
    requestStatusRuntime: { cancelAutocomplete },
  } = rootSessionRuntime;

  return {
    interactionArgs: {
      searchInteractionRef,
      anySheetDraggingRef,
      pendingMarkerOpenAnimationFrameRef,
      isSearchSessionActive,
      cancelAutocomplete,
      cameraIntentArbiter,
      viewportBoundsService,
      commitCameraViewport,
      lastCameraStateRef,
      lastPersistedCameraRef,
      hasResults,
    },
  };
};
