import React from 'react';

import { useProfileNativeCommandExecutionRuntime } from './profile-native-command-runtime';
import { useProfileNativeCompletionRuntime } from './profile-native-completion-runtime';
import type {
  ProfileNativeExecutionArgs,
  ProfileNativeExecutionModel,
} from './profile-native-execution-runtime-contract';
import { useProfileNativeTransitionExecutionRuntime } from './profile-native-transition-runtime';

type UseProfileNativeExecutionModelRuntimeArgs = {
  preparedProfileCompletionHandlerRef: ProfileNativeExecutionArgs['preparedProfileCompletionHandlerRef'];
  nativeExecutionArgs: Omit<ProfileNativeExecutionArgs, 'preparedProfileCompletionHandlerRef'>;
};

export const useProfileNativeExecutionModelRuntime = ({
  preparedProfileCompletionHandlerRef,
  nativeExecutionArgs: {
    emitRuntimeMechanismEvent,
    cameraIntentArbiter,
    profileCameraAnimationMs,
    lastVisibleSheetStateRef,
    lastCameraStateRef,
    setIsFollowingUser,
    suppressMapMoved,
    commitCameraViewport,
  },
}: UseProfileNativeExecutionModelRuntimeArgs): ProfileNativeExecutionModel => {
  const { handlePreparedProfileOverlayDismissed, handlePreparedProfileSheetSettled } =
    useProfileNativeCompletionRuntime({
      preparedProfileCompletionHandlerRef,
      cameraIntentArbiter,
    });
  const transitionExecutionModel = useProfileNativeTransitionExecutionRuntime({
    emitRuntimeMechanismEvent,
    lastVisibleSheetStateRef,
    lastCameraStateRef,
  });
  const commandExecutionModel = useProfileNativeCommandExecutionRuntime({
    onProgrammaticHidden: handlePreparedProfileOverlayDismissed,
    onProgrammaticSnapSettled: handlePreparedProfileSheetSettled,
    profileCameraAnimationMs,
    lastCameraStateRef,
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
