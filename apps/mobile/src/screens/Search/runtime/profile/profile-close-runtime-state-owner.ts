import React from 'react';

import { useProfileCloseFinalizationRuntimeState } from './profile-close-finalization-runtime-state';
import { useProfileClosePolicyRuntimeState } from './profile-close-policy-runtime-state';
import type { ProfileControllerState } from './profile-runtime-state-record';
import type { ProfileCloseRuntimeState } from './profile-runtime-state-contract';

type UseProfileCloseRuntimeStateOwnerArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  clearRestaurantPanelSnapshot: () => void;
  clearMapHighlightedRestaurantId: () => void;
  resetRestaurantFocusSession: () => void;
};

export const useProfileCloseRuntimeStateOwner = ({
  profileControllerStateRef,
  clearRestaurantPanelSnapshot,
  clearMapHighlightedRestaurantId,
  resetRestaurantFocusSession,
}: UseProfileCloseRuntimeStateOwnerArgs): ProfileCloseRuntimeState => {
  const closePolicyRuntimeState = useProfileClosePolicyRuntimeState({
    profileControllerStateRef,
  });
  const closeFinalizationRuntimeState = useProfileCloseFinalizationRuntimeState({
    profileControllerStateRef,
    clearRestaurantPanelSnapshot,
    clearMapHighlightedRestaurantId,
    resetRestaurantFocusSession,
  });

  return React.useMemo(
    () => ({
      policyRuntimeState: closePolicyRuntimeState,
      finalizationRuntimeState: closeFinalizationRuntimeState,
    }),
    [closeFinalizationRuntimeState, closePolicyRuntimeState]
  );
};
