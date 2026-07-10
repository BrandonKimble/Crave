import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRootSessionAssemblyRuntime } from './use-search-root-session-assembly-runtime';
import { useSearchRootSessionCoreLaneRuntime } from './use-search-root-session-core-lane-runtime';
import { useSearchRootSessionPrimitivesLaneRuntime } from './use-search-root-session-primitives-lane-runtime';
import { useSearchSessionOriginCameraRuntime } from './use-search-session-origin-camera-runtime';
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
  searchMapNativeCameraExecutor,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
}: UseSearchRootSessionRuntimeHookArgs): SearchRootSessionRuntimeLanes => {
  const { interactionPrimitivesRuntime, sessionControlServices } =
    useSearchRootSessionAssemblyRuntime({
      startupPollBounds,
      rootPrimitivesRuntime,
      searchMapNativeCameraExecutor,
      searchRuntimeBus,
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort,
    });
  const sessionPrimitivesLane = useSearchRootSessionPrimitivesLaneRuntime({
    interactionPrimitivesRuntime,
    cameraIntentArbiter: sessionControlServices.cameraIntentArbiter,
  });
  // Camera-in-origin (owner decision 2026-07-10): terminal dismiss glides the camera back
  // to the session's trigger viewport. Session-boundary-only — never overlaps the profile
  // pop's savedCamera channel.
  useSearchSessionOriginCameraRuntime({
    searchRuntimeBus,
    lastCameraStateRef: sessionPrimitivesLane.primitives.lastCameraStateRef,
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
