import React from 'react';

import { createProfileAutoOpenActionModel } from './profile-auto-open-action-runtime';
import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileRuntimeActions } from './profile-owner-runtime-contract';
import { executeProfileAutoOpenAction } from './profile-runtime-action-execution';

type UseProfileOwnerAutoOpenKickoffRuntimeArgs = {
  queryState: CreateProfileActionRuntimeArgs['queryState'];
  runtimeState: CreateProfileActionRuntimeArgs['runtimeState'];
  autoOpenActionExecutionPorts: CreateProfileActionRuntimeArgs['autoOpenActionExecutionPorts'];
  profileActions: Pick<
    ProfileRuntimeActions,
    'refreshOpenRestaurantProfileSelection' | 'openRestaurantProfile'
  >;
};

export const useProfileOwnerAutoOpenKickoffRuntime = ({
  queryState,
  runtimeState,
  autoOpenActionExecutionPorts,
  profileActions,
}: UseProfileOwnerAutoOpenKickoffRuntimeArgs): void => {
  const runNextProfileAutoOpenAction = React.useCallback(() => {
    executeProfileAutoOpenAction({
      actionModel: createProfileAutoOpenActionModel({
        results: queryState.results,
        isProfileAutoOpenSuppressed: queryState.isProfileAutoOpenSuppressed,
        pendingSelection: runtimeState.getPendingSelection(),
        currentQueryKey: queryState.currentQueryKey,
        activeOpenRestaurantId: runtimeState.getActiveOpenRestaurantId(),
        lastAutoOpenKey: runtimeState.getLastAutoOpenKey(),
      }),
      ports: {
        ...autoOpenActionExecutionPorts,
        refreshOpenRestaurantProfileSelection: profileActions.refreshOpenRestaurantProfileSelection,
        openRestaurantProfile: profileActions.openRestaurantProfile,
      },
    });
  }, [
    autoOpenActionExecutionPorts,
    profileActions.openRestaurantProfile,
    profileActions.refreshOpenRestaurantProfileSelection,
    queryState,
    runtimeState,
  ]);

  React.useEffect(() => {
    runNextProfileAutoOpenAction();
  }, [runNextProfileAutoOpenAction]);
};
