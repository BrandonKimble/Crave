import React from 'react';

import { searchService } from '../../../../services/search';
import { logger } from '../../../../utils';
import type { ProfileAnalyticsModel } from '../profile/profile-owner-runtime-contract';
import type { SearchRootRecentActivityAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

export const useSearchRootProfileAnalyticsRuntime = ({
  stateFoundationLane,
  isSignedIn,
  recentActivityAuthorityRuntime,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  isSignedIn: boolean;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
}): ProfileAnalyticsModel => {
  const { sessionPrimitivesLane } = stateFoundationLane;

  const recordRestaurantView = React.useCallback<ProfileAnalyticsModel['recordRestaurantView']>(
    async (
      restaurantId: string,
      source: 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete' | 'dish_card'
    ) => {
      if (!isSignedIn || source === 'autocomplete' || source === 'dish_card') {
        return;
      }

      try {
        await searchService.recordRestaurantView({
          restaurantId,
          searchRequestId:
            sessionPrimitivesLane.primitives.lastSearchRequestIdRef.current ?? undefined,
          source,
        });
      } catch (err) {
        logger.warn('Unable to record restaurant view', {
          message: err instanceof Error ? err.message : 'unknown error',
          restaurantId,
          source,
        });
      }
    },
    [isSignedIn, sessionPrimitivesLane.primitives.lastSearchRequestIdRef]
  );

  return React.useMemo<ProfileAnalyticsModel>(
    () => ({
      deferRecentlyViewedTrack:
        recentActivityAuthorityRuntime.recentActivityRuntime.deferRecentlyViewedTrack,
      recordRestaurantView,
    }),
    [
      recentActivityAuthorityRuntime.recentActivityRuntime.deferRecentlyViewedTrack,
      recordRestaurantView,
    ]
  );
};
