import React from 'react';

import type { CreateProfileActionRuntimeArgs } from './profile-action-runtime-port-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import type { ProfilePresentationModelRuntime } from './profile-presentation-model-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerRuntimeStateRuntimeArgs = {
  searchContext: ProfileSearchContext;
  currentMapZoom: number | null;
  presentationModelRuntime: Pick<
    ProfilePresentationModelRuntime,
    'resolveProfileCameraPadding' | 'getProfileTransitionSnapshotCapture'
  >;
  nativeExecutionModel: Pick<ProfileNativeExecutionModel, 'transitionExecutionModel'>;
  runtimeStateOwner: Pick<
    ProfileRuntimeStateOwner,
    | 'shellRuntimeState'
    | 'transitionRuntimeState'
    | 'closeRuntimeState'
    | 'focusRuntime'
    | 'autoOpenRuntime'
  >;
};

export const useProfileOwnerRuntimeStateRuntime = ({
  searchContext,
  currentMapZoom,
  presentationModelRuntime,
  nativeExecutionModel,
  runtimeStateOwner,
}: UseProfileOwnerRuntimeStateRuntimeArgs): CreateProfileActionRuntimeArgs['runtimeState'] => {
  const {
    shellRuntimeState: { profileShellState },
    transitionRuntimeState: { getProfileTransitionStatus },
    closeRuntimeState: {
      policyRuntimeState: { getProfileMultiLocationZoomBaseline },
    },
    focusRuntime: { getRestaurantFocusSession },
    autoOpenRuntime: { getLastAutoOpenKey },
  } = runtimeStateOwner;

  return React.useMemo(
    () => ({
      getProfileTransitionStatus,
      getCurrentPanelRestaurantId: () =>
        profileShellState.restaurantPanelSnapshot?.restaurant.restaurantId ?? null,
      hasPanelSnapshot: () => profileShellState.restaurantPanelSnapshot != null,
      getCurrentLastCameraState: nativeExecutionModel.transitionExecutionModel.getLastCameraState,
      getCurrentMapZoom: () => (typeof currentMapZoom === 'number' ? currentMapZoom : null),
      getProfileMultiLocationZoomBaseline,
      getRestaurantFocusSession,
      getRestaurantOnlySearchId: searchContext.getRestaurantOnlySearchId,
      getPendingSelection: searchContext.getPendingRestaurantSelection,
      getActiveOpenRestaurantId: () =>
        profileShellState.transitionStatus === 'opening' ||
        profileShellState.transitionStatus === 'open'
          ? profileShellState.restaurantPanelSnapshot?.restaurant.restaurantId ?? null
          : null,
      getLastAutoOpenKey,
      resolveProfileCameraPadding: presentationModelRuntime.resolveProfileCameraPadding,
      getProfileTransitionSnapshotCapture:
        presentationModelRuntime.getProfileTransitionSnapshotCapture,
    }),
    [
      currentMapZoom,
      getLastAutoOpenKey,
      getProfileMultiLocationZoomBaseline,
      getProfileTransitionStatus,
      getRestaurantFocusSession,
      nativeExecutionModel.transitionExecutionModel.getLastCameraState,
      presentationModelRuntime,
      profileShellState.restaurantPanelSnapshot,
      profileShellState.transitionStatus,
      searchContext.getPendingRestaurantSelection,
      searchContext.getRestaurantOnlySearchId,
    ]
  );
};
