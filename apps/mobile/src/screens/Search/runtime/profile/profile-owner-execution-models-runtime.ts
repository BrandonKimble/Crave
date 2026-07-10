import React from 'react';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { useProfileAppExecutionModelRuntime } from './profile-app-execution-model-runtime';
import type { ProfileAppExecutionRuntime } from '../../../../navigation/runtime/app-route-profile-app-execution-runtime-contract';
import { useProfileNativeExecutionModelRuntime } from './profile-native-execution-model-runtime';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type {
  ProfileOwnerNativeExecutionArgs,
  ProfileSearchContext,
} from './profile-owner-runtime-contract';
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
  const nativeExecutionModel = useProfileNativeExecutionModelRuntime({
    nativeExecutionArgs,
    setProfileCameraPadding: runtimeStateOwner.shellRuntimeState.setProfileCameraPadding,
  });

  const appExecutionRuntime = useProfileAppExecutionModelRuntime({
    routeSceneRuntime,
    resultsPresentationSurfaceAuthority,
    appExecutionArgs,
  });

  // L3 slice 4: the transaction machine is DELETED — the direct runtime IS the
  // presentation surface (camera + standard push/hide; the pop-teardown writer owns
  // every close).
  const directPresentationRuntime = useProfileDirectPresentationRuntime({
    nativeExecutionModel,
    routeOverlayRouteCommandRuntime: routeSceneRuntime.routeOverlayRouteCommandRuntime,
    setProfileTransitionStatus: runtimeStateOwner.transitionRuntimeState.setProfileTransitionStatus,
  });
  const preparedPresentationRuntime: ProfilePreparedPresentationRuntime = directPresentationRuntime;

  return React.useMemo(
    () => ({
      nativeExecutionModel,
      appExecutionRuntime,
      preparedPresentationRuntime,
    }),
    [appExecutionRuntime, nativeExecutionModel, preparedPresentationRuntime]
  );
};
