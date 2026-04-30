import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';
import type {
  ProfileAnalyticsModel,
  ProfileSelectionModel,
} from '../profile/profile-owner-runtime-contract';
import type { SearchRootRecentActivityAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootRestaurantSelectionModel } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchRootProfileAnalyticsRuntime } from './search-root-profile-analytics-runtime';
import { useSearchRootProfileSelectionModelRuntime } from './search-root-profile-selection-model-runtime';

type UseSearchRootProfileSelectionRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  isSignedIn: boolean;
  userLocation: SearchRootEnvironment['userLocation'];
  userLocationRef: SearchRootEnvironment['userLocationRef'];
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
};

type SearchRootProfileSelectionRuntime = {
  selectionModelForProfileOwner: ProfileSelectionModel;
  restaurantSelectionModel: Pick<
    SearchRootRestaurantSelectionModel,
    | 'resolveRestaurantMapLocations'
    | 'resolveRestaurantLocationSelectionAnchor'
    | 'pickPreferredRestaurantMapLocation'
  >;
  analyticsModel: ProfileAnalyticsModel;
};

export const useSearchRootProfileSelectionRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  isSignedIn,
  userLocation,
  userLocationRef,
  recentActivityAuthorityRuntime,
}: UseSearchRootProfileSelectionRuntimeArgs): SearchRootProfileSelectionRuntime => {
  const { selectionModelForProfileOwner, restaurantSelectionModel } =
    useSearchRootProfileSelectionModelRuntime({
      sessionCoreLane,
      userLocation,
      userLocationRef,
    });
  const analyticsModel = useSearchRootProfileAnalyticsRuntime({
    stateFoundationLane,
    isSignedIn,
    recentActivityAuthorityRuntime,
  });

  return React.useMemo(
    () => ({
      selectionModelForProfileOwner,
      restaurantSelectionModel,
      analyticsModel,
    }),
    [analyticsModel, restaurantSelectionModel, selectionModelForProfileOwner]
  );
};
