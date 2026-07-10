import React from 'react';

import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { PROFILE_CAMERA_ANIMATION_MODE } from './profile-camera-motion-constants';

export type ProfileNativeCommandExecutionModel = {
  commitProfileCameraTargetCommand: (targetCamera: CameraSnapshot) => boolean;
};

type UseProfileNativeCommandExecutionRuntimeArgs = {
  profileCameraAnimationMs: number;
  pendingProfileCameraTargetRef: React.MutableRefObject<CameraSnapshot | null>;
  setIsFollowingUser: (isFollowingUser: boolean) => void;
  suppressMapMoved: () => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number; padding?: CameraSnapshot['padding'] },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
      deferControlledCameraStateUntilCompletion?: boolean;
    }
  ) => boolean;
};

export const useProfileNativeCommandExecutionRuntime = ({
  profileCameraAnimationMs,
  pendingProfileCameraTargetRef,
  setIsFollowingUser,
  suppressMapMoved,
  commitCameraViewport,
}: UseProfileNativeCommandExecutionRuntimeArgs): ProfileNativeCommandExecutionModel => {
  const commitProfileCameraTargetCommand = React.useCallback(
    (targetCamera: CameraSnapshot) => {
      setIsFollowingUser(false);
      suppressMapMoved();
      const didCommit = commitCameraViewport(
        {
          center: targetCamera.center,
          zoom: targetCamera.zoom,
          padding: targetCamera.padding ?? null,
        },
        {
          allowDuringGesture: true,
          animationMode: PROFILE_CAMERA_ANIMATION_MODE,
          animationDurationMs: profileCameraAnimationMs,
          requestToken: null,
          deferControlledCameraStateUntilCompletion: true,
        }
      );
      if (didCommit) {
        pendingProfileCameraTargetRef.current = targetCamera;
      }
      return didCommit;
    },
    [
      commitCameraViewport,
      pendingProfileCameraTargetRef,
      profileCameraAnimationMs,
      setIsFollowingUser,
      suppressMapMoved,
    ]
  );

  return React.useMemo(
    () => ({
      commitProfileCameraTargetCommand,
    }),
    [commitProfileCameraTargetCommand]
  );
};
