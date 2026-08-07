import React from 'react';

import { createProfileFocusActionRuntime } from './profile-focus-action-runtime';
import { createProfileOpenActionRuntime } from './profile-open-action-runtime';
import type {
  CreateProfileActionRuntimeArgs,
  CreateProfilePresentationActionRuntimeArgs,
} from './profile-action-runtime-port-contract';
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
  // F1064: the three factories below read `actionExecutionPorts` + `runtimeState` only, and
  // their args type now says so — the six no-op ports this memo used to fabricate purely to
  // satisfy a god-shaped contract are GONE, not merely unused.
  const actionRuntimeArgs = React.useMemo<CreateProfilePresentationActionRuntimeArgs>(
    () => ({
      runtimeState,
      actionExecutionPorts,
    }),
    [actionExecutionPorts, runtimeState]
  );
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
      ...createProfilePreviewActionRuntime(actionRuntimeArgs),
      ...createProfileOpenActionRuntime(actionRuntimeArgs, restaurantActionModelRuntime),
      ...createProfileFocusActionRuntime(actionRuntimeArgs, restaurantActionModelRuntime),
    }),
    [actionRuntimeArgs, restaurantActionModelRuntime]
  );
};
