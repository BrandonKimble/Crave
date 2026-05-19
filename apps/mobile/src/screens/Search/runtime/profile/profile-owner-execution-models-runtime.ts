import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { useProfileAppExecutionModelRuntime } from './profile-app-execution-model-runtime';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import { useProfileNativeExecutionModelRuntime } from './profile-native-execution-model-runtime';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type {
  ProfileOwnerNativeExecutionArgs,
  ProfileSearchContext,
} from './profile-owner-runtime-contract';
import {
  useProfilePreparedPresentationRuntime,
  type PreparedProfilePresentationCompletionEvent,
} from './profile-prepared-presentation-runtime';
import type { ProfilePreparedPresentationRuntime } from './profile-prepared-presentation-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import type { ProfileAppExecutionArgs } from './profile-app-execution-runtime-contract';

type UseProfileOwnerExecutionModelsRuntimeArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  resultsPresentationSurfaceAuthority: ProfileSearchContext['resultsPresentationSurfaceAuthority'];
  runtimeStateOwner: ProfileRuntimeStateOwner;
  nativeExecutionArgs: ProfileOwnerNativeExecutionArgs;
  appExecutionArgs: ProfileAppExecutionArgs;
};

export type ProfileOwnerExecutionModelsRuntime = {
  nativeExecutionModel: ProfileNativeExecutionModel;
  appExecutionRuntime: ProfileAppExecutionRuntime;
  preparedPresentationRuntime: ProfilePreparedPresentationRuntime;
};

export const useProfileOwnerExecutionModelsRuntime = ({
  routeSceneRuntime,
  resultsPresentationSurfaceAuthority,
  runtimeStateOwner,
  nativeExecutionArgs,
  appExecutionArgs,
}: UseProfileOwnerExecutionModelsRuntimeArgs): ProfileOwnerExecutionModelsRuntime => {
  const preparedProfileCompletionHandlerRef = React.useRef<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >(null);

  const nativeExecutionModel = useProfileNativeExecutionModelRuntime({
    preparedProfileCompletionHandlerRef,
    nativeExecutionArgs,
    setProfileCameraPadding: runtimeStateOwner.shellRuntimeState.setProfileCameraPadding,
  });

  const appExecutionRuntime = useProfileAppExecutionModelRuntime({
    routeSceneRuntime,
    resultsPresentationSurfaceAuthority,
    appExecutionArgs,
    runtimeStateOwner,
    preparedProfileCompletionHandlerRef,
  });

  const preparedPresentationRuntime = useProfilePreparedPresentationRuntime({
    preparedProfileCompletionHandlerRef,
    runBatch: unstable_batchedUpdates as (fn: () => void) => void,
    nativeExecutionModel,
    runtimeStateOwner,
    appExecutionRuntime,
  });

  return React.useMemo(
    () => ({
      nativeExecutionModel,
      appExecutionRuntime,
      preparedPresentationRuntime,
    }),
    [appExecutionRuntime, nativeExecutionModel, preparedPresentationRuntime]
  );
};
