import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import {
  createCameraIntentArbiter,
  type CameraIntentArbiter,
} from '../runtime/map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { SearchMapNativeCameraExecutor } from '../runtime/map/search-map-native-camera-executor';

type MapCameraAnimation = {
  mode: 'none' | 'easeTo';
  durationMs: number;
  completionId: string | null;
};

type UseSearchRuntimeCameraIntentRuntimeArgs = {
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  searchMapNativeCameraExecutor: SearchMapNativeCameraExecutor;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setMapBearing: React.Dispatch<React.SetStateAction<number | null>>;
  setMapPitch: React.Dispatch<React.SetStateAction<number | null>>;
  setMapCameraAnimation: React.Dispatch<React.SetStateAction<MapCameraAnimation>>;
};

export type SearchRuntimeCameraIntentRuntime = {
  cameraIntentArbiter: CameraIntentArbiter;
};

export const useSearchRuntimeCameraIntentRuntime = ({
  cameraRef,
  searchMapNativeCameraExecutor,
  setMapCenter,
  setMapZoom,
  setMapBearing,
  setMapPitch,
  setMapCameraAnimation,
}: UseSearchRuntimeCameraIntentRuntimeArgs): SearchRuntimeCameraIntentRuntime => {
  const cameraIntentArbiterRef = React.useRef<CameraIntentArbiter | null>(null);
  const latestNativeCameraExecutorRef = React.useRef(searchMapNativeCameraExecutor);
  const latestCameraRef = React.useRef(cameraRef);
  latestNativeCameraExecutorRef.current = searchMapNativeCameraExecutor;
  latestCameraRef.current = cameraRef;

  const executeCameraRefCommand = React.useCallback(
    ({
      center,
      zoom,
      bearing,
      pitch,
      padding,
      animationMode,
      animationDurationMs,
      completionId,
    }: {
      center: [number, number];
      zoom: number;
      bearing?: number | null;
      pitch?: number | null;
      padding?: CameraSnapshot['padding'];
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      completionId: string | null;
    }): boolean => {
      const camera = latestCameraRef.current.current;
      if (typeof camera?.setCamera !== 'function') {
        return false;
      }
      camera.setCamera({
        type: 'CameraStop',
        centerCoordinate: center,
        zoomLevel: zoom,
        heading: bearing ?? undefined,
        pitch: pitch ?? undefined,
        padding: padding ?? undefined,
        animationMode,
        animationDuration: animationDurationMs,
        animationCompletionId: completionId,
      });
      return true;
    },
    []
  );

  if (!cameraIntentArbiterRef.current) {
    cameraIntentArbiterRef.current = createCameraIntentArbiter({
      commandCameraViewport: ({
        center,
        zoom,
        bearing,
        pitch,
        padding,
        animationMode,
        animationDurationMs,
        completionId,
        onCommandRejected,
      }) => {
        // cameraRef.setCamera is the proven path for BOTH modes. The native
        // host-registry executor silently no-ops for plain camera stops (it
        // resolves without moving the map), so it is only a fallback for when
        // the ref isn't mounted yet.
        if (
          executeCameraRefCommand({
            center,
            zoom,
            bearing,
            pitch,
            padding,
            animationMode,
            animationDurationMs,
            completionId,
          })
        ) {
          return true;
        }
        return latestNativeCameraExecutorRef.current.executeCameraCommand({
          center,
          zoom,
          bearing,
          pitch,
          padding,
          animationMode,
          animationDurationMs,
          completionId,
          onCommandRejected,
        });
      },
      setMapCenter: (center: [number, number]) => {
        setMapCenter((previous) =>
          previous && previous[0] === center[0] && previous[1] === center[1] ? previous : center
        );
      },
      setMapZoom: (zoom: number) => {
        setMapZoom((previous) => (previous === zoom ? previous : zoom));
      },
      setMapBearing: (bearing: number | null) => {
        setMapBearing((previous) => (previous === bearing ? previous : bearing));
      },
      setMapPitch: (pitch: number | null) => {
        setMapPitch((previous) => (previous === pitch ? previous : pitch));
      },
      setMapCameraAnimation: (animation: MapCameraAnimation) => {
        setMapCameraAnimation((previous) =>
          previous.mode === animation.mode &&
          previous.durationMs === animation.durationMs &&
          previous.completionId === animation.completionId
            ? previous
            : animation
        );
      },
    });
  }
  const cameraIntentArbiter = cameraIntentArbiterRef.current;

  return React.useMemo(
    () => ({
      cameraIntentArbiter,
    }),
    [cameraIntentArbiter]
  );
};
