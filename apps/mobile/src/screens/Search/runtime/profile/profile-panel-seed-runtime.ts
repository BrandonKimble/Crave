import React from 'react';

import type { RestaurantResult } from '../../../../types';
import type { RestaurantPanelSnapshot } from './profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import { resetPreparedProfileDismissHandling } from './profile-transition-state-mutations';
import type { ProfileHydrationRequestRuntime } from './profile-hydration-request-runtime';
import { createSeededRestaurantPanelSnapshot } from './profile-panel-hydration-snapshot-runtime';

export type ProfilePanelSeedRuntime = {
  seedRestaurantProfile: (restaurant: RestaurantResult, queryLabel: string) => void;
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
    (restaurant: RestaurantResult, queryLabel: string) => {
      const restaurantId = restaurant.restaurantId;
      const cachedProfile = getCachedRestaurantProfile(restaurantId, restaurant.marketKey ?? null);

      resetPreparedProfileDismissHandling(profileControllerStateRef.current.runtime.transition);

      setRestaurantPanelSnapshot((prev) =>
        createSeededRestaurantPanelSnapshot({
          currentSnapshot: prev,
          restaurant,
          queryLabel,
          cachedProfile,
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
