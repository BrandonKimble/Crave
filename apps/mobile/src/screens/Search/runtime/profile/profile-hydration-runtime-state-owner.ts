import React from 'react';

import type { ProfileShellStatePublisher } from './profile-shell-state-publisher';
import type { ProfileControllerState } from './profile-runtime-state-record';
import type { ProfileHydrationRuntimeState } from './profile-runtime-state-contract';
import { useProfileHydrationIntentRuntime } from './profile-hydration-intent-runtime';
import { useProfileHydrationRequestRuntime } from './profile-hydration-request-runtime';
import { useProfilePanelHydrationRuntime } from './profile-panel-hydration-runtime';
import { useProfilePanelSeedRuntime } from './profile-panel-seed-runtime';

type UseProfileHydrationRuntimeStateOwnerArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  publishRestaurantPanelSnapshot: ProfileShellStatePublisher['setRestaurantPanelSnapshot'];
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
};

export const useProfileHydrationRuntimeStateOwner = ({
  profileControllerStateRef,
  publishRestaurantPanelSnapshot,
  emitRuntimeMechanismEvent,
}: UseProfileHydrationRuntimeStateOwnerArgs): ProfileHydrationRuntimeState => {
  const hydrationIntentRuntime = useProfileHydrationIntentRuntime({
    profileControllerStateRef,
    emitRuntimeMechanismEvent,
  });
  const hydrationRequestRuntime = useProfileHydrationRequestRuntime({
    profileControllerStateRef,
  });
  const { seedRestaurantProfile } = useProfilePanelSeedRuntime({
    profileControllerStateRef,
    setRestaurantPanelSnapshot: publishRestaurantPanelSnapshot,
    hydrationRequestRuntime,
  });
  const { hydrateRestaurantProfileById } = useProfilePanelHydrationRuntime({
    profileControllerStateRef,
    setRestaurantPanelSnapshot: publishRestaurantPanelSnapshot,
    hydrationIntentRuntime,
    hydrationRequestRuntime,
  });

  return React.useMemo(
    () => ({
      getRestaurantProfileRequestSeq: hydrationIntentRuntime.getRestaurantProfileRequestSeq,
      setRestaurantProfileRequestSeq: hydrationIntentRuntime.setRestaurantProfileRequestSeq,
      cancelActiveHydrationIntent: hydrationIntentRuntime.cancelActiveHydrationIntent,
      seedRestaurantProfile,
      hydrateRestaurantProfileById,
    }),
    [hydrateRestaurantProfileById, hydrationIntentRuntime, seedRestaurantProfile]
  );
};
