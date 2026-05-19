import React from 'react';

import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { SearchRootCameraViewportRuntime } from './use-search-root-session-runtime-contract';
import type {
  SearchRootSessionPrimitivesLane,
  SearchRuntimePrimitivesRuntime,
} from './use-search-root-session-runtime-contract';

type UseSearchRootSessionPrimitivesLaneRuntimeArgs = {
  interactionPrimitivesRuntime: SearchRuntimePrimitivesRuntime;
  cameraIntentArbiter: CameraIntentArbiter;
};

export const useSearchRootSessionPrimitivesLaneRuntime = ({
  interactionPrimitivesRuntime,
  cameraIntentArbiter,
}: UseSearchRootSessionPrimitivesLaneRuntimeArgs): SearchRootSessionPrimitivesLane => {
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  const lastVisibleSheetStateRef =
    React.useRef<Exclude<import('../../../../overlays/types').OverlaySheetSnap, 'hidden'>>(
      'middle'
    );
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
      lastVisibleSheetStateRef,
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
