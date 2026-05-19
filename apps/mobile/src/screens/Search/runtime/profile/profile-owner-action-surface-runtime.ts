import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
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
  getRestaurantProfileRequestSeq: ProfileRuntimeStateOwner['hydrationRuntime']['getRestaurantProfileRequestSeq'];
  setRestaurantProfileRequestSeq: ProfileRuntimeStateOwner['hydrationRuntime']['setRestaurantProfileRequestSeq'];
  cancelActiveHydrationIntent: ProfileRuntimeStateOwner['hydrationRuntime']['cancelActiveHydrationIntent'];
  resetRestaurantProfileFocusSession: ProfileRuntimeStateOwner['focusRuntime']['resetRestaurantProfileFocusSession'];
  getProfileTransitionState: ProfileRuntimeStateOwner['transitionRuntimeState']['getProfileTransitionState'];
  finalizePreparedProfileCloseState: ProfileRuntimeStateOwner['closeRuntimeState']['finalizationRuntimeState']['finalizePreparedProfileCloseState'];
};

export const useProfileOwnerActionSurfaceRuntime = ({
  queryState,
  selectionState,
  runtimeState,
  actionExecutionPorts,
  refreshSelectionExecutionPorts,
  hydrateRestaurantProfileById,
  getRestaurantProfileRequestSeq,
  setRestaurantProfileRequestSeq,
  cancelActiveHydrationIntent,
  resetRestaurantProfileFocusSession,
  getProfileTransitionState,
  finalizePreparedProfileCloseState,
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
  const clearMapHighlightedRestaurantId = React.useCallback(() => {
    actionExecutionPorts.setMapHighlightedRestaurantId(null);
  }, [actionExecutionPorts.setMapHighlightedRestaurantId]);
  const clearRestaurantProfileForSearchDismiss = React.useCallback(() => {
    const nextRequestSeq = getRestaurantProfileRequestSeq() + 1;
    cancelActiveHydrationIntent('profile_hydration_cancelled_on_overlay_dismiss', {
      nextRequestSeq,
      nextRestaurantId: null,
    });
    setRestaurantProfileRequestSeq(nextRequestSeq);
    actionExecutionPorts.setMapHighlightedRestaurantId(null);
    finalizePreparedProfileCloseState();
  }, [
    actionExecutionPorts.setMapHighlightedRestaurantId,
    cancelActiveHydrationIntent,
    finalizePreparedProfileCloseState,
    getRestaurantProfileRequestSeq,
    setRestaurantProfileRequestSeq,
  ]);
  const prepareRestaurantProfileForTerminalSearchDismiss = React.useCallback(() => {
    const savedCamera = getProfileTransitionState().savedCamera;
    if (savedCamera) {
      actionExecutionPorts.focusPreparedProfileCamera(savedCamera);
    }
  }, [actionExecutionPorts, getProfileTransitionState]);

  return React.useMemo(
    () => ({
      clearMapHighlightedRestaurantId,
      clearRestaurantProfileForSearchDismiss,
      prepareRestaurantProfileForTerminalSearchDismiss,
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
      clearRestaurantProfileForSearchDismiss,
      clearMapHighlightedRestaurantId,
      hydrateRestaurantProfileById,
      presentationActions,
      prepareRestaurantProfileForTerminalSearchDismiss,
      resetRestaurantProfileFocusSession,
      runtimeActions,
    ]
  );
};
