import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRootSessionAssemblyRuntime } from './use-search-root-session-assembly-runtime';
import { useSearchRootSessionCoreLaneRuntime } from './use-search-root-session-core-lane-runtime';
import { useSearchRootSessionPrimitivesLaneRuntime } from './use-search-root-session-primitives-lane-runtime';
import { useRouteEntryOriginCameraPortRuntime } from './use-route-entry-origin-camera-port-runtime';
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
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
};

export const useSearchRootSessionRuntime = ({
  isSignedIn: _isSignedIn,
  accessToken,
  startupPollBounds,
  startupCamera,
  markMainMapLoaded,
  markMainMapReady,
  rootPrimitivesRuntime,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
}: UseSearchRootSessionRuntimeHookArgs): SearchRootSessionRuntimeLanes => {
  const { interactionPrimitivesRuntime, sessionControlServices } =
    useSearchRootSessionAssemblyRuntime({
      startupPollBounds,
      rootPrimitivesRuntime,
      searchRuntimeBus,
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort,
    });
  const sessionPrimitivesLane = useSearchRootSessionPrimitivesLaneRuntime({
    interactionPrimitivesRuntime,
    cameraIntentArbiter: sessionControlServices.cameraIntentArbiter,
  });
  // D56 camera-in-ORIGIN: the camera is a field of the route entry's OriginSnapshot, captured
  // at push commit and restored per-pop by the origin seam. This hook only lends that seam the
  // two map-owned verbs (read the trigger camera / commit it back through the arbiter); it holds
  // no slot of its own, and there is no session-boundary special case left anywhere.
  useRouteEntryOriginCameraPortRuntime({
    searchRuntimeBus,
    viewportBoundsService: sessionControlServices.viewportBoundsService,
    cameraIntentArbiter: sessionControlServices.cameraIntentArbiter,
    commitCameraViewport: sessionPrimitivesLane.primitives.commitCameraViewport,
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
