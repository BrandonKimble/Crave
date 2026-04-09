import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import type { ProfileRuntimeActions } from './profile-owner-runtime-contract';
import { useProfileOwnerPresentationActionsRuntime } from './profile-owner-presentation-actions-runtime';
import { useProfileOwnerRuntimeActionsRuntime } from './profile-owner-runtime-actions-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerActionSurfaceRuntimeArgs = {
  queryState: CreateProfileActionRuntimeArgs['queryState'];
  selectionState: CreateProfileActionRuntimeArgs['selectionState'];
  runtimeState: CreateProfileActionRuntimeArgs['runtimeState'];
  actionExecutionPorts: CreateProfileActionRuntimeArgs['actionExecutionPorts'];
  refreshSelectionExecutionPorts: CreateProfileActionRuntimeArgs['refreshSelectionExecutionPorts'];
  hydrateRestaurantProfileById: ProfileRuntimeStateOwner['hydrationRuntime']['hydrateRestaurantProfileById'];
  resetRestaurantProfileFocusSession: ProfileRuntimeStateOwner['focusRuntime']['resetRestaurantProfileFocusSession'];
  appExecutionRuntime: Pick<ProfileAppExecutionRuntime, 'commandExecutionModel'>;
};

export const useProfileOwnerActionSurfaceRuntime = ({
  queryState,
  selectionState,
  runtimeState,
  actionExecutionPorts,
  refreshSelectionExecutionPorts,
  hydrateRestaurantProfileById,
  resetRestaurantProfileFocusSession,
  appExecutionRuntime,
}: UseProfileOwnerActionSurfaceRuntimeArgs): ProfileRuntimeActions => {
  const presentationActions = useProfileOwnerPresentationActionsRuntime({
    queryState,
    selectionState,
    runtimeState,
    actionExecutionPorts,
  });

  const runtimeActions = useProfileOwnerRuntimeActionsRuntime({
    runtimeState,
    actionExecutionPorts,
    refreshSelectionExecutionPorts,
    focusRestaurantProfileCamera: presentationActions.focusRestaurantProfileCamera,
  });

  return React.useMemo(
    () => ({
      clearMapHighlightedRestaurantId:
        appExecutionRuntime.commandExecutionModel.clearMapHighlightedRestaurantId,
      hydrateRestaurantProfileById,
      focusRestaurantProfileCamera: presentationActions.focusRestaurantProfileCamera,
      openRestaurantProfilePreview: presentationActions.openRestaurantProfilePreview,
      openRestaurantProfile: presentationActions.openRestaurantProfile,
      openRestaurantProfileFromResults: presentationActions.openRestaurantProfileFromResults,
      refreshOpenRestaurantProfileSelection: runtimeActions.refreshOpenRestaurantProfileSelection,
      resetRestaurantProfileFocusSession,
      closeRestaurantProfile: runtimeActions.closeRestaurantProfile,
    }),
    [
      appExecutionRuntime.commandExecutionModel.clearMapHighlightedRestaurantId,
      hydrateRestaurantProfileById,
      presentationActions,
      resetRestaurantProfileFocusSession,
      runtimeActions,
    ]
  );
};
