import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { SearchRootCameraViewportRuntime } from './search-root-session-runtime-contract';
import type {
  SearchRootSessionPrimitivesLane,
  SearchRuntimePrimitivesRuntime,
} from './search-root-session-runtime-contract';

type UseSearchRootSessionPrimitivesLaneRuntimeArgs = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  cameraIntentArbiter: CameraIntentArbiter;
};

export const useSearchRootSessionPrimitivesLaneRuntime = ({
  interactionPrimitivesRuntime,
  cameraIntentArbiter,
}: UseSearchRootSessionPrimitivesLaneRuntimeArgs): SearchRootSessionPrimitivesLane => {
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  // F1335: `lastVisibleSheetStateRef` was minted here, typed on
  // SearchRootCameraViewportRuntime and threaded through the session lane — and never read
  // OR written anywhere in apps/mobile/src. A ref that is never written cannot hold state and
  // a ref that is never read cannot inform anything; it was a name promising a memory that
  // did not exist. Deleted here and on the contract.
  const lastCameraStateRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const lastPersistedCameraRef = React.useRef<string | null>(null);
  const commitCameraViewport = React.useCallback<
    SearchRootCameraViewportRuntime['commitCameraViewport']
  >(
    (payload, options) =>
      cameraIntentArbiter.commit({
        center: payload.center,
        zoom: payload.zoom,
        padding: payload.padding,
        allowDuringGesture: options?.allowDuringGesture,
        animationMode: options?.animationMode,
        animationDurationMs: options?.animationDurationMs,
        requestToken: options?.requestToken,
        deferControlledCameraStateUntilCompletion:
          options?.deferControlledCameraStateUntilCompletion,
      }),
    [cameraIntentArbiter]
  );
  const cameraViewportRuntime: SearchRootCameraViewportRuntime = React.useMemo(
    () => ({
      lastSearchBoundsCaptureSeqRef,
      lastCameraStateRef,
      lastPersistedCameraRef,
      commitCameraViewport,
    }),
    [commitCameraViewport]
  );
  const appRouteSceneCameraMotionTargetPorts = React.useMemo(
    () => ({
      cameraIntentArbiter,
      lastCameraStateRef,
    }),
    [cameraIntentArbiter]
  );
  const primitives = React.useMemo(
    () => ({
      ...interactionPrimitivesRuntime,
      ...cameraViewportRuntime,
    }),
    [cameraViewportRuntime, interactionPrimitivesRuntime]
  );

  return React.useMemo(
    () => ({
      primitives,
      appRouteSceneCameraMotionTargetPorts,
    }),
    [appRouteSceneCameraMotionTargetPorts, primitives]
  );
};
