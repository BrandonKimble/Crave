import React from 'react';

import {
  createProfilePresentationModelRuntime,
  type ProfilePresentationCameraLayoutModel,
  type ProfilePresentationModelRuntime,
} from './profile-presentation-model-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import { useTopMostRouteEntryForScene } from '../../../../navigation/runtime/use-top-most-route-entry-for-scene';

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
  // L3 cutover slice 1: the reactive stack fact feeds the presence-shaped model facts.
  const hasRestaurantRouteEntry = useTopMostRouteEntryForScene('restaurant') != null;

  const profileShellState = React.useMemo(
    () => ({
      transitionStatus: runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
      hasRestaurantRouteEntry,
      restaurantPanelSnapshot:
        runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      mapCameraPadding: runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
      mapHighlightedRestaurantId:
        runtimeStateOwner.shellRuntimeState.profileShellState.mapHighlightedRestaurantId,
    }),
    [
      hasRestaurantRouteEntry,
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
        cameraLayoutModel: cameraTransitionPorts,
        getCurrentLastCameraState: getLastCameraState,
      }),
    [cameraTransitionPorts, getLastCameraState, profileShellState]
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
