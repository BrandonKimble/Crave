import React from 'react';

import type {
  RestaurantPanelSnapshot,
  RestaurantProfileSeed,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import {} from '../../../../navigation/runtime/app-route-profile-transition-state-mutations';
import type { ProfileHydrationRequestRuntime } from './profile-hydration-request-runtime';
import { createSeededRestaurantPanelSnapshot } from './profile-panel-hydration-snapshot-runtime';

export type ProfilePanelSeedRuntime = {
  seedRestaurantProfile: (
    restaurant: RestaurantProfileSeed,
    queryLabel: string,
    options?: { selectedLocationId?: string | null }
  ) => void;
};

type UseProfilePanelSeedRuntimeArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  setRestaurantPanelSnapshot: (
    update:
      | RestaurantPanelSnapshot
      | null
      | ((prev: RestaurantPanelSnapshot | null) => RestaurantPanelSnapshot | null)
  ) => void;
  hydrationRequestRuntime: Pick<ProfileHydrationRequestRuntime, 'getCachedRestaurantProfile'>;
};

export const useProfilePanelSeedRuntime = ({
  profileControllerStateRef,
  setRestaurantPanelSnapshot,
  hydrationRequestRuntime,
}: UseProfilePanelSeedRuntimeArgs): ProfilePanelSeedRuntime => {
  const { getCachedRestaurantProfile } = hydrationRequestRuntime;

  const seedRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantProfileSeed,
      queryLabel: string,
      options?: { selectedLocationId?: string | null }
    ) => {
      const restaurantId = restaurant.restaurantId;
      const cachedProfile = getCachedRestaurantProfile(restaurantId);
      profileControllerStateRef.current.runtime.transition;

      setRestaurantPanelSnapshot((prev) =>
        createSeededRestaurantPanelSnapshot({
          currentSnapshot: prev,
          restaurant,
          queryLabel,
          cachedProfile,
          selectedLocationId: options?.selectedLocationId ?? null,
        })
      );
    },
    [getCachedRestaurantProfile, profileControllerStateRef, setRestaurantPanelSnapshot]
  );

  return React.useMemo<ProfilePanelSeedRuntime>(
    () => ({
      seedRestaurantProfile,
    }),
    [seedRestaurantProfile]
  );
};
