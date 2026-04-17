import React from 'react';

import type { RestaurantPanelSnapshot } from './profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import { clearActiveHydrationIntentForRequestSeqOnRecord } from './profile-mutable-state-record';
import type { ProfileHydrationIntentRuntime } from './profile-hydration-intent-runtime';
import type { ProfileHydrationRequestRuntime } from './profile-hydration-request-runtime';
import {
  applyHydratedRestaurantProfileToPanelSnapshot,
  clearRestaurantPanelSnapshotHydrating,
  markRestaurantPanelSnapshotHydrating,
} from './profile-panel-hydration-snapshot-runtime';

export type ProfilePanelHydrationRuntime = {
  hydrateRestaurantProfileById: (restaurantId: string, marketKey?: string | null) => void;
};

type UseProfilePanelHydrationRuntimeArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  setRestaurantPanelSnapshot: (
    update:
      | RestaurantPanelSnapshot
      | null
      | ((prev: RestaurantPanelSnapshot | null) => RestaurantPanelSnapshot | null)
  ) => void;
  hydrationIntentRuntime: Pick<
    ProfileHydrationIntentRuntime,
    'beginRestaurantProfileHydrationIntent' | 'isRestaurantProfileRequestCurrent'
  >;
  hydrationRequestRuntime: ProfileHydrationRequestRuntime;
};

export const useProfilePanelHydrationRuntime = ({
  profileControllerStateRef,
  setRestaurantPanelSnapshot,
  hydrationIntentRuntime,
  hydrationRequestRuntime,
}: UseProfilePanelHydrationRuntimeArgs): ProfilePanelHydrationRuntime => {
  const { beginRestaurantProfileHydrationIntent, isRestaurantProfileRequestCurrent } =
    hydrationIntentRuntime;
  const { getCachedRestaurantProfile, loadRestaurantProfileData } = hydrationRequestRuntime;

  const hydrateRestaurantProfileById = React.useCallback(
    (restaurantId: string, marketKey?: string | null) => {
      if (!restaurantId) {
        return;
      }

      const requestSeq = beginRestaurantProfileHydrationIntent(restaurantId);
      const normalizedMarketKey =
        typeof marketKey === 'string' && marketKey.trim().length
          ? marketKey.trim().toLowerCase()
          : null;
      const cachedProfile = getCachedRestaurantProfile(restaurantId, normalizedMarketKey);

      if (cachedProfile) {
        setRestaurantPanelSnapshot((prev) =>
          applyHydratedRestaurantProfileToPanelSnapshot({
            currentSnapshot: prev,
            restaurantId,
            hydratedProfile: cachedProfile,
          })
        );
        clearActiveHydrationIntentForRequestSeqOnRecord(
          profileControllerStateRef.current,
          requestSeq
        );
        return;
      }

      setRestaurantPanelSnapshot((prev) =>
        markRestaurantPanelSnapshotHydrating({
          currentSnapshot: prev,
          restaurantId,
        })
      );

      void loadRestaurantProfileData(restaurantId, normalizedMarketKey)
        .then((loadedProfile) => {
          if (!isRestaurantProfileRequestCurrent(requestSeq)) {
            return;
          }

          setRestaurantPanelSnapshot((prev) =>
            applyHydratedRestaurantProfileToPanelSnapshot({
              currentSnapshot: prev,
              restaurantId,
              hydratedProfile: loadedProfile,
            })
          );
        })
        .catch(() => {
          if (!isRestaurantProfileRequestCurrent(requestSeq)) {
            return;
          }

          setRestaurantPanelSnapshot((prev) =>
            clearRestaurantPanelSnapshotHydrating({
              currentSnapshot: prev,
              restaurantId,
            })
          );
        })
        .finally(() => {
          clearActiveHydrationIntentForRequestSeqOnRecord(
            profileControllerStateRef.current,
            requestSeq
          );
        });
    },
    [
      beginRestaurantProfileHydrationIntent,
      getCachedRestaurantProfile,
      isRestaurantProfileRequestCurrent,
      loadRestaurantProfileData,
      profileControllerStateRef,
      setRestaurantPanelSnapshot,
    ]
  );

  return React.useMemo<ProfilePanelHydrationRuntime>(
    () => ({
      hydrateRestaurantProfileById,
    }),
    [hydrateRestaurantProfileById]
  );
};
