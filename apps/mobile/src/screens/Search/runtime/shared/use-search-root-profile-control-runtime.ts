import React from 'react';

import {
  createSearchRootProfileControlRuntimeValue,
  type SearchRootProfileControlRuntimeValue,
} from '../controller/search-root-profile-control-runtime';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import {
  useSearchRootMapProfileControlLane,
  useSearchRootProfilePresentationControlLane,
  useSearchRootSuggestionInteractionControlLane,
} from './use-search-root-profile-control-lanes';
import { useSearchRootProfileMapCommandRuntime } from './use-search-root-profile-map-command-runtime';
import { useSearchRootProfileOwnerRuntime } from './use-search-root-profile-owner-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

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
  const getCurrentResultsSheetSnap = React.useCallback(
    () => rootOverlayFoundationRuntime.appRouteSharedSheetRuntimeOwner.sheetState,
    [rootOverlayFoundationRuntime.appRouteSharedSheetRuntimeOwner]
  );
  const profileMapCommandRuntime = useSearchRootProfileMapCommandRuntime({
    profileOwner: profileOwnerRuntime.profileOwner,
    pendingMarkerOpenAnimationFrameRef: profileOwnerRuntime.pendingMarkerOpenAnimationFrameRef,
    getCurrentResultsSheetSnap,
  });

  const suggestionInteractionControlLane = useSearchRootSuggestionInteractionControlLane(
    profileOwnerRuntime.suggestionInteractionRuntime
  );
  const profilePresentationControlLane = useSearchRootProfilePresentationControlLane({
    profileOwner: profileOwnerRuntime.profileOwner,
    pendingMarkerOpenAnimationFrameRef: profileOwnerRuntime.pendingMarkerOpenAnimationFrameRef,
  });
  const mapProfileControlLane = useSearchRootMapProfileControlLane({
    mapProfileCommandPort: profileMapCommandRuntime.mapProfileCommandPort,
    mapViewState: profileMapCommandRuntime.mapViewState,
    restaurantSelectionModel: profileOwnerRuntime.restaurantSelectionModel,
  });

  return React.useMemo(
    () =>
      createSearchRootProfileControlRuntimeValue({
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
