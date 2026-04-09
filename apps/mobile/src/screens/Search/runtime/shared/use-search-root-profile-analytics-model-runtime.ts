import React from 'react';

import { searchService } from '../../../../services/search';
import { logger } from '../../../../utils';
import type {
  SearchRootProfileOwnerArgs,
  UseSearchRootProfileActionRuntimeArgs,
} from './use-search-root-profile-action-runtime-contract';

type UseSearchRootProfileAnalyticsModelRuntimeArgs = Pick<
  UseSearchRootProfileActionRuntimeArgs,
  'isSignedIn' | 'rootSessionRuntime' | 'requestLaneRuntime'
>;

export const useSearchRootProfileAnalyticsModelRuntime = ({
  isSignedIn,
  rootSessionRuntime,
  requestLaneRuntime,
}: UseSearchRootProfileAnalyticsModelRuntimeArgs): SearchRootProfileOwnerArgs['analyticsModel'] => {
  const {
    primitives: { lastSearchRequestIdRef },
  } = rootSessionRuntime;
  const {
    requestPresentationFlowRuntime: {
      recentActivityRuntime: { deferRecentlyViewedTrack },
    },
  } = requestLaneRuntime;

  const recordRestaurantView = React.useCallback(
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
          searchRequestId: lastSearchRequestIdRef.current ?? undefined,
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
    [isSignedIn, lastSearchRequestIdRef]
  );

  return {
    deferRecentlyViewedTrack,
    recordRestaurantView,
  };
};
