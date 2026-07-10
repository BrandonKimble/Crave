import React from 'react';

import { useProfileNativeCommandExecutionRuntime } from './profile-native-command-runtime';
import { useProfileNativeCompletionRuntime } from './profile-native-completion-runtime';
import type {
  ProfileNativeExecutionArgs,
  ProfileNativeExecutionModel,
} from './profile-native-execution-runtime-contract';
import { useProfileNativeTransitionExecutionRuntime } from './profile-native-transition-runtime';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

type UseProfileNativeExecutionModelRuntimeArgs = {
  nativeExecutionArgs: ProfileNativeExecutionArgs;
  setProfileCameraPadding: (padding: CameraSnapshot['padding']) => void;
};

export const useProfileNativeExecutionModelRuntime = ({
  nativeExecutionArgs: {
    emitRuntimeMechanismEvent,
    cameraIntentArbiter,
    profileCameraAnimationMs,
    lastCameraStateRef,
    setIsFollowingUser,
    suppressMapMoved,
    commitCameraViewport,
  },
  setProfileCameraPadding,
}: UseProfileNativeExecutionModelRuntimeArgs): ProfileNativeExecutionModel => {
  const pendingProfileCameraTargetRef = React.useRef<CameraSnapshot | null>(null);

  React.useEffect(() => {
    cameraIntentArbiter.setControlledCameraPaddingSyncHandler(setProfileCameraPadding);
    return () => {
      cameraIntentArbiter.setControlledCameraPaddingSyncHandler(null);
    };
  }, [cameraIntentArbiter, setProfileCameraPadding]);

  useProfileNativeCompletionRuntime({
    cameraIntentArbiter,
    lastCameraStateRef,
    pendingProfileCameraTargetRef,
  });
  const transitionExecutionModel = useProfileNativeTransitionExecutionRuntime({
    emitRuntimeMechanismEvent,
    lastCameraStateRef,
  });
  const commandExecutionModel = useProfileNativeCommandExecutionRuntime({
    profileCameraAnimationMs,
    pendingProfileCameraTargetRef,
    setIsFollowingUser,
    suppressMapMoved,
    commitCameraViewport,
  });

  return React.useMemo(
    () => ({
      transitionExecutionModel,
      commandExecutionModel,
    }),
    [commandExecutionModel, transitionExecutionModel]
  );
};
