import React from 'react';

import { searchService } from '../../../../services/search';
import type { RestaurantProfile } from '../../../../types';
import { logger } from '../../../../utils';
import type { HydratedRestaurantProfile } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  deleteRestaurantProfileRequestByIdOnRecord,
  getRestaurantProfileCacheEntryFromRecord,
  getRestaurantProfileRequestByIdFromRecord,
  setRestaurantProfileCacheEntryOnRecord,
  setRestaurantProfileRequestByIdOnRecord,
} from './profile-mutable-state-record';

export type ProfileHydrationRequestRuntime = {
  getCachedRestaurantProfile: (placeId: string) => HydratedRestaurantProfile | undefined;
  loadRestaurantProfileData: (placeId: string) => Promise<HydratedRestaurantProfile>;
};

type UseProfileHydrationRequestRuntimeArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileHydrationRequestRuntime = ({
  profileControllerStateRef,
}: UseProfileHydrationRequestRuntimeArgs): ProfileHydrationRequestRuntime => {
  const getCachedRestaurantProfile = React.useCallback(
    (placeId: string) =>
      getRestaurantProfileCacheEntryFromRecord(profileControllerStateRef.current, placeId),
    [profileControllerStateRef]
  );

  const loadRestaurantProfileData = React.useCallback(
    (placeId: string): Promise<HydratedRestaurantProfile> => {
      const cached = getRestaurantProfileCacheEntryFromRecord(
        profileControllerStateRef.current,
        placeId
      );
      if (cached) {
        return Promise.resolve(cached);
      }
      const inFlight = getRestaurantProfileRequestByIdFromRecord(
        profileControllerStateRef.current,
        placeId
      );
      if (inFlight) {
        return inFlight;
      }
      const request = searchService
        .restaurantProfile(placeId)
        .then((profile) => {
          const payload = profile as RestaurantProfile | null;
          const place = payload?.place;
          if (!place || place.placeId !== placeId) {
            throw new Error('place profile payload mismatch');
          }
          const dishes = Array.isArray(payload?.dishes) ? payload.dishes : [];
          const normalized: HydratedRestaurantProfile = {
            restaurant: place,
            dishes,
          };
          setRestaurantProfileCacheEntryOnRecord(
            profileControllerStateRef.current,
            placeId,
            normalized
          );
          return normalized;
        })
        .catch((err) => {
          logger.warn('Restaurant profile fetch failed', {
            message: err instanceof Error ? err.message : 'unknown error',
            placeId,
          });
          throw err;
        })
        .finally(() => {
          deleteRestaurantProfileRequestByIdOnRecord(profileControllerStateRef.current, placeId);
        });
      setRestaurantProfileRequestByIdOnRecord(profileControllerStateRef.current, placeId, request);
      return request;
    },
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileHydrationRequestRuntime>(
    () => ({
      getCachedRestaurantProfile,
      loadRestaurantProfileData,
    }),
    [getCachedRestaurantProfile, loadRestaurantProfileData]
  );
};
