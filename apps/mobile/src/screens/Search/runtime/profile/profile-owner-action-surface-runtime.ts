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
    // L3 slice 4: the machine-yield guard is DELETED — with the machine gone, the pop
    // writer is the sole close owner (dissolution trace §2c/§3).
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
    // L3 slice 4: the machine-era status guard is DELETED — the pop-teardown WRITER
    // already disarms this settle half when a restaurant entry re-appears before the
    // settle (S-C.5 re-open-before-settle rule), so a superseding open can never reach
    // this clear.
    finalizePreparedProfileCloseState();
  }, [finalizePreparedProfileCloseState, getProfileTransitionState]);

  return React.useMemo(
    () => ({
      clearMapHighlightedRestaurantId,
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
      clearMapHighlightedRestaurantId,
      handleRestaurantEntryPopped,
      finalizeRestaurantEntryPopTeardown,
      hydrateRestaurantProfileById,
      presentationActions,
      prepareRestaurantProfileForTerminalSearchDismiss,
      resetRestaurantProfileFocusSession,
      runtimeActions,
    ]
  );
};
