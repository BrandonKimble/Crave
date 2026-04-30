import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import { createCameraIntentArbiter, type CameraIntentArbiter } from '../runtime/map/camera-intent-arbiter';
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
  setMapCameraAnimation,
}: UseSearchRuntimeCameraIntentRuntimeArgs): SearchRuntimeCameraIntentRuntime => {
  const cameraIntentArbiterRef = React.useRef<CameraIntentArbiter | null>(null);
  if (!cameraIntentArbiterRef.current) {
    cameraIntentArbiterRef.current = createCameraIntentArbiter({
      commandCameraViewport: ({
        center,
        zoom,
        animationMode,
        animationDurationMs,
        completionId: _completionId,
      }) => {
        if (
          searchMapNativeCameraExecutor.executeCameraCommand({
            center,
            zoom,
            animationMode,
            animationDurationMs,
          })
        ) {
          return true;
        }
        const camera = cameraRef.current;
        if (typeof camera?.setCamera !== 'function') {
          return false;
        }
        camera.setCamera({
          type: 'CameraStop',
          centerCoordinate: center,
          zoomLevel: zoom,
          animationMode,
          animationDuration: animationDurationMs,
        });
        return true;
      },
      setMapCenter: (center: [number, number]) => {
        setMapCenter((previous) =>
          previous && previous[0] === center[0] && previous[1] === center[1] ? previous : center
        );
      },
      setMapZoom: (zoom: number) => {
        setMapZoom((previous) => (previous === zoom ? previous : zoom));
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
