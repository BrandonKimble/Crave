import React from 'react';

import type {
  SearchRootBootstrapEnvironment,
  SearchRootEnvironment,
} from './search-root-environment-contract';
import { useSearchRootMapBootstrapRuntime } from './use-search-root-map-bootstrap-runtime';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type {
  SearchRootSessionControlServicesRuntime,
  SearchRootSessionCoreLane,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootSessionCoreLaneRuntimeArgs = {
  accessToken: SearchRootEnvironment['accessToken'];
  startupCamera: SearchRootBootstrapEnvironment['startupCamera'];
  markMainMapLoaded: () => void;
  markMainMapReady: () => void;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  sessionControlServices: SearchRootSessionControlServicesRuntime;
  sessionPrimitivesLane: SearchRootSessionPrimitivesLane;
};

export const useSearchRootSessionCoreLaneRuntime = ({
  accessToken,
  startupCamera,
  markMainMapLoaded,
  markMainMapReady,
  rootPrimitivesRuntime,
  sessionControlServices,
  sessionPrimitivesLane,
}: UseSearchRootSessionCoreLaneRuntimeArgs): SearchRootSessionCoreLane => {
  const mapBootstrapRuntime = useSearchRootMapBootstrapRuntime({
    accessToken,
    startupCamera,
    markMainMapLoaded,
    markMainMapReady,
    commitCameraViewport: sessionPrimitivesLane.primitives.commitCameraViewport,
    lastCameraStateRef: sessionPrimitivesLane.primitives.lastCameraStateRef,
    lastPersistedCameraRef: sessionPrimitivesLane.primitives.lastPersistedCameraRef,
    viewportBoundsService: sessionControlServices.viewportBoundsService,
    mapState: rootPrimitivesRuntime.mapState,
  });

  return React.useMemo(
    () => ({
      mapBootstrapRuntime,
      ...sessionControlServices,
    }),
    [mapBootstrapRuntime, sessionControlServices]
  );
};
