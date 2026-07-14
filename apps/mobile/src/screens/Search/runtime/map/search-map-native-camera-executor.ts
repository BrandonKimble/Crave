import React from 'react';
import { NativeModules, Platform } from 'react-native';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

const MODULE_NAME = 'PresentationCommandExecutor';
const SEARCH_MAP_CAMERA_HOST_KEY = 'search_map_camera';

type NativeCameraStopPayload = {
  centerCoordinate: string;
  zoom: number;
  heading?: number;
  pitch?: number;
  mode: 2 | 5;
  duration: number;
  animationCompletionId?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
};

type NativeCameraCommandPayload = {
  hostKey: string;
  stop: NativeCameraStopPayload;
};

type SearchMapCameraExecutorNativeModule = {
  cameraCommandExecutionAvailable?: boolean;
  executeCameraCommand: (payload: NativeCameraCommandPayload) => Promise<void>;
};

const nativeModule = (
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules as Record<string, unknown>)[MODULE_NAME]
    : null
) as SearchMapCameraExecutorNativeModule | null;

type SearchMapCameraCommand = {
  center: [number, number];
  zoom: number;
  bearing?: number | null;
  pitch?: number | null;
  padding?: CameraSnapshot['padding'];
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
  completionId?: string | null;
  onCommandRejected?: (completionId: string | null) => void;
};

export type SearchMapNativeCameraExecutor = {
  cameraCommandExecutionAvailable: boolean;
  executeCameraCommand: (command: SearchMapCameraCommand) => boolean;
};

const mapAnimationMode = (animationMode?: 'none' | 'easeTo'): 2 | 5 =>
  animationMode === 'none' ? 5 : 2;

const buildNativeCameraStopPayload = (command: SearchMapCameraCommand): NativeCameraStopPayload => {
  const stop: NativeCameraStopPayload = {
    // Native (RNMBXCamera.toUpdateItem) decodes this as a Turf.Feature — a bare
    // Point geometry fails the decode and the whole stop is silently dropped.
    centerCoordinate: JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: command.center },
      properties: {},
    }),
    zoom: command.zoom,
    mode: mapAnimationMode(command.animationMode),
    duration:
      typeof command.animationDurationMs === 'number' &&
      Number.isFinite(command.animationDurationMs)
        ? Math.max(0, command.animationDurationMs)
        : 0,
  };
  if (typeof command.bearing === 'number' && Number.isFinite(command.bearing)) {
    stop.heading = command.bearing;
  }
  if (typeof command.pitch === 'number' && Number.isFinite(command.pitch)) {
    stop.pitch = command.pitch;
  }
  if (command.completionId) {
    stop.animationCompletionId = command.completionId;
  }
  if (command.padding) {
    stop.paddingTop = command.padding.paddingTop;
    stop.paddingRight = command.padding.paddingRight;
    stop.paddingBottom = command.padding.paddingBottom;
    stop.paddingLeft = command.padding.paddingLeft;
  }
  return stop;
};

export const useSearchMapNativeCameraExecutor = (): SearchMapNativeCameraExecutor => {
  const cameraCommandExecutionAvailable = nativeModule?.cameraCommandExecutionAvailable === true;

  const executeCameraCommand = React.useCallback(
    (command: SearchMapCameraCommand): boolean => {
      if (!cameraCommandExecutionAvailable || !nativeModule) {
        return false;
      }
      nativeModule
        .executeCameraCommand({
          hostKey: SEARCH_MAP_CAMERA_HOST_KEY,
          stop: buildNativeCameraStopPayload(command),
        })
        .catch((error: unknown) => {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log(
              `[CAMCOMMIT] native executeCameraCommand REJECTED: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
          command.onCommandRejected?.(command.completionId ?? null);
        });
      return true;
    },
    [cameraCommandExecutionAvailable]
  );

  return React.useMemo(
    () => ({
      cameraCommandExecutionAvailable,
      executeCameraCommand,
    }),
    [cameraCommandExecutionAvailable, executeCameraCommand]
  );
};
