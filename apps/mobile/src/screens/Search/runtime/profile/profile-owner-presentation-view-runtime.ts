import React from 'react';

import {
  createProfilePresentationModelRuntime,
  type ProfilePresentationCameraLayoutModel,
  type ProfilePresentationModelRuntime,
} from './profile-presentation-model-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerPresentationViewRuntimeArgs = {
  cameraTransitionPorts: ProfilePresentationCameraLayoutModel;
  runtimeStateOwner: Pick<ProfileRuntimeStateOwner, 'shellRuntimeState' | 'transitionRuntimeState'>;
  getLastCameraState: () => { center: [number, number]; zoom: number } | null;
};

export type ProfileOwnerPresentationViewRuntime = {
  currentMapZoom: number | null;
  presentationModelRuntime: ProfilePresentationModelRuntime;
};

export const useProfileOwnerPresentationViewRuntime = ({
  cameraTransitionPorts,
  runtimeStateOwner,
  getLastCameraState,
}: UseProfileOwnerPresentationViewRuntimeArgs): ProfileOwnerPresentationViewRuntime => {
  const preparedSnapshot = runtimeStateOwner.transitionRuntimeState.getPreparedProfileSnapshot();

  const profileShellState = React.useMemo(
    () => ({
      transitionStatus: runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
      restaurantPanelSnapshot:
        runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      mapCameraPadding: runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
      mapHighlightedRestaurantId:
        runtimeStateOwner.shellRuntimeState.profileShellState.mapHighlightedRestaurantId,
    }),
    [
      runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
      runtimeStateOwner.shellRuntimeState.profileShellState.mapHighlightedRestaurantId,
      runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
    ]
  );

  const presentationModelRuntime = React.useMemo<ProfilePresentationModelRuntime>(
    () =>
      createProfilePresentationModelRuntime({
        profileShellState,
        preparedSnapshot,
        cameraLayoutModel: cameraTransitionPorts,
        getCurrentLastCameraState: getLastCameraState,
      }),
    [
      cameraTransitionPorts,
      getLastCameraState,
      preparedSnapshot,
      profileShellState,
    ]
  );

  const currentMapZoom =
    typeof cameraTransitionPorts.mapZoom === 'number' ? cameraTransitionPorts.mapZoom : null;

  return React.useMemo(
    () => ({
      currentMapZoom,
      presentationModelRuntime,
    }),
    [currentMapZoom, presentationModelRuntime]
  );
};
