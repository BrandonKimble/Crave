import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';
import { useSearchRuntimeFlagsRuntime } from './use-search-runtime-flags-runtime';
import { useSearchRuntimePrimitivesRuntime } from './use-search-runtime-primitives-runtime';
import { useSearchRootCameraViewportRuntime } from './use-search-root-camera-viewport-runtime';
import { useSearchRootHydrationRuntimeState } from './use-search-root-hydration-runtime-state';
import { useSearchRootResultsArrivalStateRuntime } from './use-search-root-results-arrival-state-runtime';
import { useSearchRootSharedSnapStateRuntime } from './use-search-root-shared-snap-state-runtime';
import type {
  SearchRootCameraViewportRuntime,
  SearchRootHydrationRuntimeState,
  SearchRootResultsArrivalState,
  SearchRootSessionRuntime,
  SearchRootSharedSnapState,
  UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';
import { useSearchMapNativeCameraExecutor } from '../map/search-map-native-camera-executor';

type UseSearchRootSessionStateRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  | 'startupPollBounds'
  | 'cameraRef'
  | 'markerEngineRef'
  | 'setMapCenter'
  | 'setMapZoom'
  | 'setMapCameraAnimation'
>;

export type SearchRootSessionStateRuntime = {
  runtimeOwner: SearchRootSessionRuntime['runtimeOwner'];
  sharedSnapState: SearchRootSharedSnapState;
  resultsArrivalState: SearchRootResultsArrivalState;
  runtimeFlags: SearchRootSessionRuntime['runtimeFlags'];
  primitives: SearchRootSessionRuntime['primitives'];
  hydrationRuntimeState: SearchRootHydrationRuntimeState;
};

export const useSearchRootSessionStateRuntime = ({
  startupPollBounds,
  cameraRef,
  markerEngineRef,
  setMapCenter,
  setMapZoom,
  setMapCameraAnimation,
}: UseSearchRootSessionStateRuntimeArgs): SearchRootSessionStateRuntime => {
  const searchMapNativeCameraExecutor = useSearchMapNativeCameraExecutor();
  const runtimeOwner = useSearchRuntimeOwner({
    startupPollBounds,
    cameraRef,
    searchMapNativeCameraExecutor,
    setMapCenter,
    setMapZoom,
    setMapCameraAnimation,
  });
  const sharedSnapState = useSearchRootSharedSnapStateRuntime();
  const resultsArrivalState = useSearchRootResultsArrivalStateRuntime({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
  });
  const cameraViewportRuntime: SearchRootCameraViewportRuntime = useSearchRootCameraViewportRuntime(
    {
      runtimeOwner,
    }
  );
  const runtimeFlags = useSearchRuntimeFlagsRuntime({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
    resultsRequestKey: resultsArrivalState.resultsRequestKey,
  });
  const runtimePrimitives = useSearchRuntimePrimitivesRuntime({
    markerEngineRef,
  });
  const hydrationRuntimeState = useSearchRootHydrationRuntimeState({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
  });

  return {
    runtimeOwner,
    sharedSnapState,
    resultsArrivalState,
    runtimeFlags,
    primitives: {
      ...runtimePrimitives,
      ...cameraViewportRuntime,
    },
    hydrationRuntimeState,
  };
};
