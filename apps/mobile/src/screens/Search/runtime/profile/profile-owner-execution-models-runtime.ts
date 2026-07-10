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
import { useProfileDirectPresentationRuntime } from './profile-direct-presentation-runtime';
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

  // L3 cutover slices 2+3: the machine's transaction runtime still assembles (deleted in
  // the next slice) but the PORTS bind to the DIRECT runtime — camera + standard push/hide;
  // the pop-teardown writer owns every close.
  const machinePresentationRuntime = useProfilePreparedPresentationRuntime({
    preparedProfileCompletionHandlerRef,
    runBatch: unstable_batchedUpdates as (fn: () => void) => void,
    nativeExecutionModel,
    runtimeStateOwner,
    appExecutionRuntime,
  });
  void machinePresentationRuntime;
  const directPresentationRuntime = useProfileDirectPresentationRuntime({
    nativeExecutionModel,
    routeOverlayRouteCommandRuntime: routeSceneRuntime.routeOverlayRouteCommandRuntime,
    setProfileTransitionStatus: runtimeStateOwner.transitionRuntimeState.setProfileTransitionStatus,
  });
  const preparedPresentationRuntime = React.useMemo(
    () =>
      ({
        ...machinePresentationRuntime,
        ...directPresentationRuntime,
      }) as ProfilePreparedPresentationRuntime,
    [directPresentationRuntime, machinePresentationRuntime]
  );

  return React.useMemo(
    () => ({
      nativeExecutionModel,
      appExecutionRuntime,
      preparedPresentationRuntime,
    }),
    [appExecutionRuntime, nativeExecutionModel, preparedPresentationRuntime]
  );
};
