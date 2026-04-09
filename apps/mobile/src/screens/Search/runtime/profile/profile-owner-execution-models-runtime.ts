import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { useOverlayStore } from '../../../../store/overlayStore';
import { useProfileAppExecutionModelRuntime } from './profile-app-execution-model-runtime';
import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
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

const useIsSearchOverlayVisible = (): boolean =>
  useOverlayStore((state) => {
    const rootOverlay = state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key;
    return rootOverlay === 'search';
  });

type UseProfileOwnerExecutionModelsRuntimeArgs = {
  searchRuntimeBus: ProfileSearchContext['searchRuntimeBus'];
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
  searchRuntimeBus,
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
  });

  const appExecutionRuntime = useProfileAppExecutionModelRuntime({
    searchRuntimeBus,
    appExecutionArgs,
    runtimeStateOwner,
  });

  const preparedPresentationRuntime = useProfilePreparedPresentationRuntime({
    preparedProfileCompletionHandlerRef,
    runBatch: unstable_batchedUpdates as (fn: () => void) => void,
    nativeExecutionModel,
    runtimeStateOwner,
    appExecutionRuntime,
    isSearchOverlay: useIsSearchOverlayVisible(),
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
