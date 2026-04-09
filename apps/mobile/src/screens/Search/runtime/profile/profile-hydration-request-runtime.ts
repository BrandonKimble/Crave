import React from 'react';

import { searchService } from '../../../../services/search';
import type { RestaurantProfile } from '../../../../types';
import { logger } from '../../../../utils';
import type { HydratedRestaurantProfile } from './profile-transition-state-contract';
import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  deleteRestaurantProfileRequestByIdOnRecord,
  getRestaurantProfileCacheEntryFromRecord,
  getRestaurantProfileRequestByIdFromRecord,
  setRestaurantProfileCacheEntryOnRecord,
  setRestaurantProfileRequestByIdOnRecord,
} from './profile-mutable-state-record';

export type ProfileHydrationRequestRuntime = {
  getCachedRestaurantProfile: (restaurantId: string) => HydratedRestaurantProfile | undefined;
  loadRestaurantProfileData: (restaurantId: string) => Promise<HydratedRestaurantProfile>;
};

type UseProfileHydrationRequestRuntimeArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileHydrationRequestRuntime = ({
  profileControllerStateRef,
}: UseProfileHydrationRequestRuntimeArgs): ProfileHydrationRequestRuntime => {
  const getCachedRestaurantProfile = React.useCallback(
    (restaurantId: string) =>
      getRestaurantProfileCacheEntryFromRecord(profileControllerStateRef.current, restaurantId),
    [profileControllerStateRef]
  );

  const loadRestaurantProfileData = React.useCallback(
    (restaurantId: string): Promise<HydratedRestaurantProfile> => {
      const cached = getRestaurantProfileCacheEntryFromRecord(
        profileControllerStateRef.current,
        restaurantId
      );
      if (cached) {
        return Promise.resolve(cached);
      }
      const inFlight = getRestaurantProfileRequestByIdFromRecord(
        profileControllerStateRef.current,
        restaurantId
      );
      if (inFlight) {
        return inFlight;
      }
      const request = searchService
        .restaurantProfile(restaurantId)
        .then((profile) => {
          const payload = profile as RestaurantProfile | null;
          const restaurant = payload?.restaurant;
          if (!restaurant || restaurant.restaurantId !== restaurantId) {
            throw new Error('restaurant profile payload mismatch');
          }
          const dishes = Array.isArray(payload?.dishes) ? payload.dishes : [];
          const normalized: HydratedRestaurantProfile = {
            restaurant,
            dishes,
          };
          setRestaurantProfileCacheEntryOnRecord(
            profileControllerStateRef.current,
            restaurantId,
            normalized
          );
          return normalized;
        })
        .catch((err) => {
          logger.warn('Restaurant profile fetch failed', {
            message: err instanceof Error ? err.message : 'unknown error',
            restaurantId,
          });
          throw err;
        })
        .finally(() => {
          deleteRestaurantProfileRequestByIdOnRecord(
            profileControllerStateRef.current,
            restaurantId
          );
        });
      setRestaurantProfileRequestByIdOnRecord(
        profileControllerStateRef.current,
        restaurantId,
        request
      );
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
