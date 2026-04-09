import React from 'react';

import { createProfileFocusActionRuntime } from './profile-focus-action-runtime';
import { createProfileOpenActionRuntime } from './profile-open-action-runtime';
import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileRuntimeActions } from './profile-owner-runtime-contract';
import { createProfilePreviewActionRuntime } from './profile-preview-action-runtime';
import { createProfileRestaurantActionModelRuntime } from './profile-restaurant-action-model-runtime';

type UseProfileOwnerPresentationActionsRuntimeArgs = {
  queryState: CreateProfileActionRuntimeArgs['queryState'];
  selectionState: CreateProfileActionRuntimeArgs['selectionState'];
  runtimeState: CreateProfileActionRuntimeArgs['runtimeState'];
  actionExecutionPorts: CreateProfileActionRuntimeArgs['actionExecutionPorts'];
};

export type ProfileOwnerPresentationActionsRuntime = Pick<
  ProfileRuntimeActions,
  | 'focusRestaurantProfileCamera'
  | 'openRestaurantProfilePreview'
  | 'openRestaurantProfile'
  | 'openRestaurantProfileFromResults'
>;

export const useProfileOwnerPresentationActionsRuntime = ({
  queryState,
  selectionState,
  runtimeState,
  actionExecutionPorts,
}: UseProfileOwnerPresentationActionsRuntimeArgs): ProfileOwnerPresentationActionsRuntime => {
  const restaurantActionModelRuntime = React.useMemo(
    () =>
      createProfileRestaurantActionModelRuntime({
        queryState,
        selectionState,
        runtimeState,
      }),
    [queryState, runtimeState, selectionState]
  );

  return React.useMemo(
    () => ({
      ...createProfilePreviewActionRuntime({
        runtimeState,
        actionExecutionPorts,
      }),
      ...createProfileOpenActionRuntime(
        {
          actionExecutionPorts,
        },
        restaurantActionModelRuntime
      ),
      ...createProfileFocusActionRuntime(
        {
          actionExecutionPorts,
        },
        restaurantActionModelRuntime
      ),
    }),
    [actionExecutionPorts, restaurantActionModelRuntime, runtimeState]
  );
};
