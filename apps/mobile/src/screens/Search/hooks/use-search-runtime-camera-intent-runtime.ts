import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import { createCameraIntentArbiter, type CameraIntentArbiter } from '../runtime/map/camera-intent-arbiter';
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
  const latestNativeCameraExecutorRef = React.useRef(searchMapNativeCameraExecutor);
  const latestCameraRef = React.useRef(cameraRef);
  latestNativeCameraExecutorRef.current = searchMapNativeCameraExecutor;
  latestCameraRef.current = cameraRef;

  const executeCameraRefCommand = React.useCallback(
    ({
      center,
      zoom,
      padding,
      animationMode,
      animationDurationMs,
      completionId,
    }: {
      center: [number, number];
      zoom: number;
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
        padding,
        animationMode,
        animationDurationMs,
        completionId,
        onCommandRejected,
      }) => {
        const shouldPreferNativeCommand =
          (animationMode ?? 'none') === 'none' &&
          (animationDurationMs == null || animationDurationMs === 0);
        if (
          shouldPreferNativeCommand &&
          latestNativeCameraExecutorRef.current.executeCameraCommand({
            center,
            zoom,
            padding,
            animationMode,
            animationDurationMs,
            completionId,
            onCommandRejected,
          })
        ) {
          return true;
        }
        if (
          executeCameraRefCommand({
            center,
            zoom,
            padding,
            animationMode,
            animationDurationMs,
            completionId,
          })
        ) {
          return true;
        }
        if (
          !shouldPreferNativeCommand &&
          latestNativeCameraExecutorRef.current.executeCameraCommand({
            center,
            zoom,
            padding,
            animationMode,
            animationDurationMs,
            completionId,
            onCommandRejected,
          })
        ) {
          return true;
        }
        return executeCameraRefCommand({
          center,
          zoom,
          padding,
          animationMode,
          animationDurationMs,
          completionId,
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
