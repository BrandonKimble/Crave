import React from 'react';

import { useProfileCloseFinalizationRuntimeState } from './profile-close-finalization-runtime-state';
import { useProfileCloseForegroundRuntimeState } from './profile-close-foreground-runtime-state';
import { useProfileClosePolicyRuntimeState } from './profile-close-policy-runtime-state';
import type { ProfileControllerState } from './profile-runtime-state-record';
import type { ProfileCloseRuntimeState } from './profile-runtime-state-contract';

type UseProfileCloseRuntimeStateOwnerArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  clearRestaurantPanelSnapshot: () => void;
  resetRestaurantFocusSession: () => void;
};

export const useProfileCloseRuntimeStateOwner = ({
  profileControllerStateRef,
  clearRestaurantPanelSnapshot,
  resetRestaurantFocusSession,
}: UseProfileCloseRuntimeStateOwnerArgs): ProfileCloseRuntimeState => {
  const closePolicyRuntimeState = useProfileClosePolicyRuntimeState({
    profileControllerStateRef,
  });
  const closeForegroundRuntimeState = useProfileCloseForegroundRuntimeState({
    profileControllerStateRef,
  });
  const closeFinalizationRuntimeState = useProfileCloseFinalizationRuntimeState({
    profileControllerStateRef,
    clearRestaurantPanelSnapshot,
    resetRestaurantFocusSession,
  });

  return React.useMemo(
    () => ({
      policyRuntimeState: closePolicyRuntimeState,
      foregroundRuntimeState: closeForegroundRuntimeState,
      finalizationRuntimeState: closeFinalizationRuntimeState,
    }),
    [closeFinalizationRuntimeState, closeForegroundRuntimeState, closePolicyRuntimeState]
  );
};
