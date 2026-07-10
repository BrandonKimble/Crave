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
  // L3 cutover slice 3: the pop-commit handler owns the CLEAR-dismiss arm (the machine's
  // close finalization used to run it; every close is pop-shaped now).
  getProfileDismissBehavior: ProfileRuntimeStateOwner['closeRuntimeState']['policyRuntimeState']['getProfileDismissBehavior'];
  getProfileShouldClearSearchOnDismiss: ProfileRuntimeStateOwner['closeRuntimeState']['policyRuntimeState']['getProfileShouldClearSearchOnDismiss'];
  clearSearchAfterProfileDismiss: () => void;
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
  getProfileDismissBehavior,
  getProfileShouldClearSearchOnDismiss,
  clearSearchAfterProfileDismiss,
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

  // S-C.5 slices B+C — POP-OWNED teardown (plans/s-c5-restaurant-stack-fact.md): the
  // restaurant entry leaving the route stack IS the close signal for a profile presentation
  // the machine did not close itself. The machine-initiated close (back button) pops the
  // entry through its own transaction — whose route intent already carries the camera
  // restore and whose settle callback runs finalization — and is detected via the LIVE
  // transition state and skipped. TWO HALVES, mirroring the machine's own close shape:
  //  - handleRestaurantEntryPopped (at the pop COMMIT): saved-camera restore + hydration
  //    cancel + highlight clear + focus-session reset. Returns true when it ran, so the
  //    pop-teardown writer arms the deferred half.
  //  - finalizeRestaurantEntryPopTeardown (at presentation SETTLE — PF outgoing cleared):
  //    finalizePreparedProfileCloseState, which nulls the restaurant panel snapshot. It
  //    must NOT run at commit: the outgoing leg renders the snapshot LIVE during a
  //    preserveOutgoingUntilSettle dismissal slide, and nulling it mid-slide blanks the
  //    descending sheet.
  const handleRestaurantEntryPopped = React.useCallback((): boolean => {
    const transition = getProfileTransitionState();
    if (transition.status === 'idle') {
      return false;
    }
    const isMachineCloseInFlight =
      transition.status === 'closing' ||
      transition.preparedSnapshot?.kind === 'profile_close' ||
      transition.completionState.dismiss.requestToken != null;
    if (isMachineCloseInFlight) {
      return false;
    }
    prepareRestaurantProfileForTerminalSearchDismiss();
    // L3 slice 3: an autocomplete/auto-open-sourced profile dismisses with 'clear' —
    // the search session ends with it (the machine's close finalization used to do this;
    // the behavior record resets at the settle-half finalize).
    if (getProfileDismissBehavior() === 'clear' && getProfileShouldClearSearchOnDismiss()) {
      clearSearchAfterProfileDismiss();
    }
    const nextRequestSeq = getRestaurantProfileRequestSeq() + 1;
    cancelActiveHydrationIntent('profile_hydration_cancelled_on_overlay_dismiss', {
      nextRequestSeq,
      nextRestaurantId: null,
    });
    setRestaurantProfileRequestSeq(nextRequestSeq);
    actionExecutionPorts.setMapHighlightedRestaurantId(null);
    resetRestaurantProfileFocusSession();
    return true;
  }, [
    actionExecutionPorts,
    cancelActiveHydrationIntent,
    clearSearchAfterProfileDismiss,
    getProfileDismissBehavior,
    getProfileShouldClearSearchOnDismiss,
    getProfileTransitionState,
    getRestaurantProfileRequestSeq,
    prepareRestaurantProfileForTerminalSearchDismiss,
    resetRestaurantProfileFocusSession,
    setRestaurantProfileRequestSeq,
  ]);

  const finalizeRestaurantEntryPopTeardown = React.useCallback(() => {
    const transition = getProfileTransitionState();
    // A NEW open superseded the pop before the settle — never clear the fresh snapshot.
    if (transition.status === 'opening' || transition.status === 'closing') {
      return;
    }
    finalizePreparedProfileCloseState();
  }, [finalizePreparedProfileCloseState, getProfileTransitionState]);

  return React.useMemo(
    () => ({
      clearMapHighlightedRestaurantId,
      clearRestaurantProfileForSearchDismiss,
      prepareRestaurantProfileForTerminalSearchDismiss,
      handleRestaurantEntryPopped,
      finalizeRestaurantEntryPopTeardown,
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
      handleRestaurantEntryPopped,
      finalizeRestaurantEntryPopTeardown,
      finalizeRestaurantEntryPopTeardown,
      hydrateRestaurantProfileById,
      presentationActions,
      prepareRestaurantProfileForTerminalSearchDismiss,
      resetRestaurantProfileFocusSession,
      runtimeActions,
    ]
  );
};
