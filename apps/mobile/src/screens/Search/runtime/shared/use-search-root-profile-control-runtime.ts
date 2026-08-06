import React from 'react';

import type { SearchRootProfileControlRuntimeValue } from '../controller/search-root-profile-control-runtime';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type {
  SearchRootMapProfileControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './search-root-control-plane-runtime-contract';
import { useSearchRootProfileMapCommandRuntime } from './use-search-root-profile-map-command-runtime';
import { useSearchRootProfileOwnerRuntime } from './use-search-root-profile-owner-runtime';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';

type UseSearchRootProfileControlRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  insets: SearchRootEnvironment['insets'];
  isSignedIn: SearchRootEnvironment['isSignedIn'];
  userLocation: SearchRootEnvironment['userLocation'];
  userLocationRef: SearchRootEnvironment['userLocationRef'];
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
};

export const useSearchRootProfileControlRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  profileBridgeAuthorityRuntime,
  recentActivityAuthorityRuntime,
  clearRestoreAuthorityRuntime,
}: UseSearchRootProfileControlRuntimeArgs): SearchRootProfileControlRuntimeValue => {
  const profileOwnerRuntime = useSearchRootProfileOwnerRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    profileBridgeAuthorityRuntime,
    recentActivityAuthorityRuntime,
    clearRestoreAuthorityRuntime,
  });
  const profileMapCommandRuntime = useSearchRootProfileMapCommandRuntime({
    profileOwner: profileOwnerRuntime.profileOwner,
    pendingMarkerOpenAnimationFrameRef: profileOwnerRuntime.pendingMarkerOpenAnimationFrameRef,
  });

  // F1012 lane-cluster collapse: each lane is the wrapper its deleted
  // `use-search-root-profile-control-lanes.ts` hook produced, memoized PER LANE so a
  // change in one source cannot invalidate a sibling lane's identity.
  const { suggestionInteractionRuntime } = profileOwnerRuntime;
  const suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane =
    React.useMemo(() => ({ suggestionInteractionRuntime }), [suggestionInteractionRuntime]);
  const { profileOwner, pendingMarkerOpenAnimationFrameRef, restaurantSelectionModel } =
    profileOwnerRuntime;
  const profilePresentationControlLane: SearchRootProfilePresentationControlLane = React.useMemo(
    () => ({
      profileOwner,
      stableOpenRestaurantProfileFromResults:
        profileOwner.profileActions.openRestaurantProfileFromResults,
      pendingMarkerOpenAnimationFrameRef,
    }),
    [profileOwner, pendingMarkerOpenAnimationFrameRef]
  );
  const { mapProfileCommandPort, mapViewState } = profileMapCommandRuntime;
  const mapProfileControlLane: SearchRootMapProfileControlLane = React.useMemo(
    () => ({
      mapProfileCommandPort,
      mapViewState,
      restaurantSelectionModel,
    }),
    [mapProfileCommandPort, mapViewState, restaurantSelectionModel]
  );

  return React.useMemo<SearchRootProfileControlRuntimeValue>(
    () => ({
      profileOwner: profileOwnerRuntime.profileOwner,
      suggestionInteractionControlLane,
      profilePresentationControlLane,
      mapProfileControlLane,
    }),
    [
      mapProfileControlLane,
      profileOwnerRuntime.profileOwner,
      profilePresentationControlLane,
      suggestionInteractionControlLane,
    ]
  );
};
