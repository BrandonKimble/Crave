import React from 'react';

import {
  createProfileCloseActionModel,
  createProfileRefreshSelectionActionModel,
} from './profile-action-models';
import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileRuntimeActions } from './profile-owner-runtime-contract';
import {
  executeProfileCloseAction,
  executeProfileRefreshSelectionAction,
} from './profile-runtime-action-execution';

type UseProfileOwnerRuntimeActionsRuntimeArgs = {
  runtimeState: CreateProfileActionRuntimeArgs['runtimeState'];
  actionExecutionPorts: CreateProfileActionRuntimeArgs['actionExecutionPorts'];
  refreshSelectionExecutionPorts: CreateProfileActionRuntimeArgs['refreshSelectionExecutionPorts'];
  focusRestaurantProfileCamera: ProfileRuntimeActions['focusRestaurantProfileCamera'];
};

export type ProfileOwnerRuntimeActionsRuntime = Pick<
  ProfileRuntimeActions,
  'refreshOpenRestaurantProfileSelection' | 'closeRestaurantProfile'
>;

export const useProfileOwnerRuntimeActionsRuntime = ({
  runtimeState,
  actionExecutionPorts,
  refreshSelectionExecutionPorts,
  focusRestaurantProfileCamera,
}: UseProfileOwnerRuntimeActionsRuntimeArgs): ProfileOwnerRuntimeActionsRuntime =>
  React.useMemo(
    () => ({
      refreshOpenRestaurantProfileSelection: (restaurant, queryLabel) => {
        executeProfileRefreshSelectionAction({
          actionModel: createProfileRefreshSelectionActionModel({
            restaurant,
            queryLabel,
          }),
          ports: {
            ...refreshSelectionExecutionPorts,
            focusRestaurantProfileCamera,
          },
        });
      },
      closeRestaurantProfile: (options) => {
        executeProfileCloseAction({
          actionModel: createProfileCloseActionModel({
            hasPanelSnapshot: runtimeState.hasPanelSnapshot(),
            transitionStatus: runtimeState.getProfileTransitionStatus(),
            currentRestaurantId: runtimeState.getCurrentPanelRestaurantId(),
            options,
          }),
          ports: actionExecutionPorts,
        });
      },
    }),
    [
      actionExecutionPorts,
      focusRestaurantProfileCamera,
      refreshSelectionExecutionPorts,
      runtimeState,
    ]
  );
