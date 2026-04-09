import React from 'react';

import { useBottomSheetProgrammaticRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import type { BottomSheetProgrammaticRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import { executeAndStripNativeProfileSheetCommands } from './profile-presentation-native-sheet-transport';
import type {
  ProfilePresentationCommandExecutionContext,
  ProfilePresentationCommandExecutionPayload,
} from './profile-prepared-presentation-transaction-contract';
import type { CameraSnapshot } from './profile-transition-state-contract';

const PROFILE_CAMERA_ANIMATION_MODE = 'easeTo';

export type ProfileNativeCommandExecutionModel = {
  restaurantSheetRuntimeModel: BottomSheetProgrammaticRuntimeModel;
  executeAndStripNativeSheetCommands: (
    payload: ProfilePresentationCommandExecutionPayload
  ) => ProfilePresentationCommandExecutionPayload;
  commitProfileCameraTargetCommand: (
    targetCamera: CameraSnapshot,
    executionContext: ProfilePresentationCommandExecutionContext
  ) => boolean;
};

type UseProfileNativeCommandExecutionRuntimeArgs = {
  onProgrammaticHidden: (requestToken: number | null) => void;
  onProgrammaticSnapSettled: (
    snap: 'expanded' | 'middle' | 'collapsed',
    requestToken: number | null
  ) => void;
  profileCameraAnimationMs: number;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  setIsFollowingUser: (isFollowingUser: boolean) => void;
  suppressMapMoved: () => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
    }
  ) => boolean;
};

export const useProfileNativeCommandExecutionRuntime = ({
  onProgrammaticHidden,
  onProgrammaticSnapSettled,
  profileCameraAnimationMs,
  lastCameraStateRef,
  setIsFollowingUser,
  suppressMapMoved,
  commitCameraViewport,
}: UseProfileNativeCommandExecutionRuntimeArgs): ProfileNativeCommandExecutionModel => {
  const restaurantSheetRuntimeModel = useBottomSheetProgrammaticRuntimeModel({
    onProgrammaticHidden,
    onProgrammaticSnapSettled,
  });

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
        },
        {
          allowDuringGesture: true,
          animationMode: PROFILE_CAMERA_ANIMATION_MODE,
          animationDurationMs: profileCameraAnimationMs,
          requestToken: executionContext.requestToken,
        }
      );
      if (didCommit) {
        lastCameraStateRef.current = {
          center: targetCamera.center,
          zoom: targetCamera.zoom,
        };
      }
      return didCommit;
    },
    [
      commitCameraViewport,
      lastCameraStateRef,
      profileCameraAnimationMs,
      setIsFollowingUser,
      suppressMapMoved,
    ]
  );

  return React.useMemo(
    () => ({
      restaurantSheetRuntimeModel,
      executeAndStripNativeSheetCommands: executeAndStripNativeProfileSheetCommands,
      commitProfileCameraTargetCommand,
    }),
    [commitProfileCameraTargetCommand, restaurantSheetRuntimeModel]
  );
};
