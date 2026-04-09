import React from 'react';

import { useActiveSearchRestaurantRouteRestaurantId } from '../../../../overlays/searchRestaurantRouteController';
import {
  createProfilePresentationModelRuntime,
  type ProfilePresentationCameraLayoutModel,
  type ProfilePresentationModelRuntime,
} from './profile-presentation-model-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

type UseProfileOwnerPresentationViewRuntimeArgs = {
  cameraTransitionPorts: ProfilePresentationCameraLayoutModel;
  runtimeStateOwner: Pick<ProfileRuntimeStateOwner, 'shellRuntimeState' | 'transitionRuntimeState'>;
  getLastVisibleSheetSnap: () => 'expanded' | 'middle' | 'collapsed' | null;
  getLastCameraState: () => { center: [number, number]; zoom: number } | null;
};

export type ProfileOwnerPresentationViewRuntime = {
  currentMapZoom: number | null;
  presentationModelRuntime: ProfilePresentationModelRuntime;
};

export const useProfileOwnerPresentationViewRuntime = ({
  cameraTransitionPorts,
  runtimeStateOwner,
  getLastVisibleSheetSnap,
  getLastCameraState,
}: UseProfileOwnerPresentationViewRuntimeArgs): ProfileOwnerPresentationViewRuntime => {
  const mapHighlightedRestaurantId = useActiveSearchRestaurantRouteRestaurantId();
  const preparedSnapshot = runtimeStateOwner.transitionRuntimeState.getPreparedProfileSnapshot();

  const profileShellState = React.useMemo(
    () => ({
      transitionStatus: runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
      restaurantPanelSnapshot:
        runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      mapCameraPadding: runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
    }),
    [
      runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
      runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
    ]
  );

  const presentationModelRuntime = React.useMemo<ProfilePresentationModelRuntime>(
    () =>
      createProfilePresentationModelRuntime({
        profileShellState,
        mapHighlightedRestaurantId,
        preparedSnapshot,
        cameraLayoutModel: cameraTransitionPorts,
        getCurrentLastCameraState: getLastCameraState,
        getLastVisibleSheetSnap,
      }),
    [
      cameraTransitionPorts,
      getLastCameraState,
      getLastVisibleSheetSnap,
      mapHighlightedRestaurantId,
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
