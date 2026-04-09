import React from 'react';

import { useProfileAutoOpenRuntimeState } from './profile-auto-open-runtime-state';
import { useProfileCloseRuntimeStateOwner } from './profile-close-runtime-state-owner';
import { useProfileControllerShellRuntimeStateOwner } from './profile-controller-shell-runtime-state-owner';
import { useProfileFocusRuntimeState } from './profile-focus-runtime-state';
import { useProfileHydrationRuntimeStateOwner } from './profile-hydration-runtime-state-owner';
import type { ProfileOwnerNativeExecutionArgs } from './profile-owner-runtime-contract';
import type { ProfileSearchContext } from './profile-owner-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import { useProfileTransitionRuntimeState } from './profile-transition-runtime-state';

type UseProfileOwnerRuntimeStateOwnerArgs = {
  searchRuntimeBus: ProfileSearchContext['searchRuntimeBus'];
  emitRuntimeMechanismEvent: ProfileOwnerNativeExecutionArgs['emitRuntimeMechanismEvent'];
};

export const useProfileOwnerRuntimeStateOwner = ({
  searchRuntimeBus,
  emitRuntimeMechanismEvent,
}: UseProfileOwnerRuntimeStateOwnerArgs): ProfileRuntimeStateOwner => {
  const {
    profileControllerStateRef,
    shellRuntimeState,
    setProfileTransitionStatus,
    publishRestaurantPanelSnapshot,
  } = useProfileControllerShellRuntimeStateOwner({
    searchRuntimeBus,
  });

  const hydrationRuntime = useProfileHydrationRuntimeStateOwner({
    profileControllerStateRef,
    publishRestaurantPanelSnapshot,
    emitRuntimeMechanismEvent,
  });
  const focusRuntime = useProfileFocusRuntimeState({
    profileControllerStateRef,
  });
  const autoOpenRuntime = useProfileAutoOpenRuntimeState({
    profileControllerStateRef,
  });
  const transitionRuntimeState = useProfileTransitionRuntimeState({
    profileControllerStateRef,
    setProfileTransitionStatus,
  });
  const closeRuntimeState = useProfileCloseRuntimeStateOwner({
    profileControllerStateRef,
    clearRestaurantPanelSnapshot: () => publishRestaurantPanelSnapshot(null),
    resetRestaurantFocusSession: focusRuntime.resetRestaurantProfileFocusSession,
  });

  return React.useMemo(
    () => ({
      shellRuntimeState,
      transitionRuntimeState,
      closeRuntimeState,
      hydrationRuntime,
      focusRuntime,
      autoOpenRuntime,
    }),
    [
      autoOpenRuntime,
      closeRuntimeState,
      focusRuntime,
      hydrationRuntime,
      shellRuntimeState,
      transitionRuntimeState,
    ]
  );
};
