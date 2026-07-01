import React from 'react';

import type { RestaurantPanelSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import { clearActiveHydrationIntentForRequestSeqOnRecord } from './profile-mutable-state-record';
import type { ProfileHydrationIntentRuntime } from './profile-hydration-intent-runtime';
import type { ProfileHydrationRequestRuntime } from './profile-hydration-request-runtime';
import {
  applyHydratedRestaurantProfileToPanelSnapshot,
  clearRestaurantPanelSnapshotHydrating,
  markRestaurantPanelSnapshotHydrating,
} from './profile-panel-hydration-snapshot-runtime';
import type { HydratedRestaurantProfile } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { publishMapMarkerSource } from '../shared/search-mounted-results-data-store';
import { focusSeededMarkerCamera } from './profile-seeded-camera-focus-handler';

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

// When a profile is hydrated, its restaurant carries geometry (latitude/longitude). Publish it as
// the seeded map marker source so the map shows a pin for the profile even when no committed search
// results exist (e.g. opened from an autocomplete suggestion). The seed is cleared on profile
// dismiss via the highlight-clear funnel in profile-shell-state-publisher.
const publishHydratedRestaurantMarkerSource = ({
  restaurantId,
  hydratedProfile,
}: {
  restaurantId: string;
  hydratedProfile: HydratedRestaurantProfile;
}): void => {
  const hydratedRestaurant = hydratedProfile.restaurant;
  if (
    hydratedRestaurant.restaurantId !== restaurantId ||
    typeof hydratedRestaurant.latitude !== 'number' ||
    typeof hydratedRestaurant.longitude !== 'number'
  ) {
    return;
  }
  // The marker catalog drops any restaurant without a numeric rank (rank is a search-ranking
  // concept). A hydrated profile restaurant has none, so give the lone seeded pin rank 1.
  const seededRestaurant =
    typeof hydratedRestaurant.rank === 'number'
      ? hydratedRestaurant
      : { ...hydratedRestaurant, rank: 1 };
  publishMapMarkerSource([seededRestaurant]);
  // Center the map on the restaurant once its geometry lands. Idempotent for opens that already
  // focused (results/map-pin); only the no-coordinate fast-path (autocomplete/comment) actually moves.
  focusSeededMarkerCamera(seededRestaurant);
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
        publishHydratedRestaurantMarkerSource({
          restaurantId,
          hydratedProfile: cachedProfile,
        });
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
          publishHydratedRestaurantMarkerSource({
            restaurantId,
            hydratedProfile: loadedProfile,
          });
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
