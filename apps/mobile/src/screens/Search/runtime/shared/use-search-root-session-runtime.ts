import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRootSessionAssemblyRuntime } from './use-search-root-session-assembly-runtime';
import { useSearchRootSessionCoreLaneRuntime } from './use-search-root-session-core-lane-runtime';
import { useSearchRootSessionPrimitivesLaneRuntime } from './use-search-root-session-primitives-lane-runtime';
import type {
  SearchRootSessionRuntimeLanes,
  UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';

type UseSearchRootSessionRuntimeHookArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  | 'isSignedIn'
  | 'accessToken'
  | 'startupPollBounds'
  | 'startupCamera'
  | 'markMainMapLoaded'
  | 'markMainMapReady'
  | 'searchMapNativeCameraExecutor'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  searchRuntimeBus: SearchRuntimeBus;
};

export const useSearchRootSessionRuntime = ({
  isSignedIn: _isSignedIn,
  accessToken,
  startupPollBounds,
  startupCamera,
  markMainMapLoaded,
  markMainMapReady,
  rootPrimitivesRuntime,
  searchMapNativeCameraExecutor,
  searchRuntimeBus,
}: UseSearchRootSessionRuntimeHookArgs): SearchRootSessionRuntimeLanes => {
  const { interactionPrimitivesRuntime, sessionControlServices } =
    useSearchRootSessionAssemblyRuntime({
      startupPollBounds,
      rootPrimitivesRuntime,
      searchMapNativeCameraExecutor,
      searchRuntimeBus,
    });
  const sessionPrimitivesLane = useSearchRootSessionPrimitivesLaneRuntime({
    interactionPrimitivesRuntime,
    cameraIntentArbiter: sessionControlServices.cameraIntentArbiter,
  });
  const sessionCoreLane = useSearchRootSessionCoreLaneRuntime({
    accessToken,
    startupCamera,
    markMainMapLoaded,
    markMainMapReady,
    rootPrimitivesRuntime,
    sessionControlServices,
    sessionPrimitivesLane,
  });
  return React.useMemo(
    () => ({
      sessionCoreLane,
      sessionPrimitivesLane,
    }),
    [sessionCoreLane, sessionPrimitivesLane]
  );
};
