import React from 'react';

import {
  createProfilePresentationModelRuntime,
  type ProfilePresentationCameraLayoutModel,
  type ProfilePresentationModelRuntime,
} from './profile-presentation-model-runtime';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePresentationFrame } from '../../../../navigation/runtime/use-presentation-frame';
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
  // RT-2 (red-team 2026-07-10): isTransitionAnimating re-feeds from the PF in-flight fact —
  // the L3 deletion left it on transitionStatus, which nothing writes 'opening'/'closing'
  // anymore, so the panel-content freeze (shouldFreezeRestaurantPanelContent) was dead and
  // hydration could hard-swap the panel mid-slide. The PF is the ONE presentation authority:
  // a switch is animating for the profile when an in-flight frame involves 'restaurant'.
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const presentationFrame = usePresentationFrame(routeSceneRuntime.routeSceneSwitchRuntime);
  const isRestaurantSwitchInFlight =
    presentationFrame.outgoingSceneKey != null &&
    (presentationFrame.presentedSceneKey === 'restaurant' ||
      presentationFrame.outgoingSceneKey === 'restaurant');

  const profileShellState = React.useMemo(
    () => ({
      transitionStatus: runtimeStateOwner.shellRuntimeState.profileShellState.transitionStatus,
      hasRestaurantRouteEntry,
      isRestaurantSwitchInFlight,
      restaurantPanelSnapshot:
        runtimeStateOwner.shellRuntimeState.profileShellState.restaurantPanelSnapshot,
      mapCameraPadding: runtimeStateOwner.shellRuntimeState.profileShellState.mapCameraPadding,
      mapHighlightedRestaurantId:
        runtimeStateOwner.shellRuntimeState.profileShellState.mapHighlightedRestaurantId,
    }),
    [
      hasRestaurantRouteEntry,
      isRestaurantSwitchInFlight,
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
