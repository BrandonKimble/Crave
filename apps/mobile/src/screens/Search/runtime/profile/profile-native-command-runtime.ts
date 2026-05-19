import React from 'react';

import type {
  ProfilePresentationCommandExecutionContext,
} from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { PROFILE_CAMERA_ANIMATION_MODE } from './profile-camera-motion-constants';

export type ProfileNativeCommandExecutionModel = {
  commitProfileCameraTargetCommand: (
    targetCamera: CameraSnapshot,
    executionContext: ProfilePresentationCommandExecutionContext
  ) => boolean;
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
    (
      targetCamera: CameraSnapshot,
      executionContext: ProfilePresentationCommandExecutionContext
    ) => {
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
          requestToken: executionContext.requestToken,
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
