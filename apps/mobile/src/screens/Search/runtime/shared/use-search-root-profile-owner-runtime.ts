import React from 'react';

import {
  createSearchRootProfileOwnerRuntimeValue,
  type SearchRootProfileOwnerRuntimeValue,
} from '../controller/search-root-profile-owner-runtime';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import { useSearchRootProfileBridgePublicationRuntime } from './use-search-root-profile-bridge-publication-runtime';
import { useRestaurantEntryPopTeardownWriterRuntime } from '../profile/use-restaurant-entry-pop-teardown-writer-runtime';
import { useProfileOwner } from '../profile/profile-owner-runtime';
import { useSearchRootProfilePresentationRuntime } from './use-search-root-profile-presentation-runtime';
import { useSearchRootProfileSelectionRuntime } from './use-search-root-profile-selection-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootProfileOwnerRuntimeArgs = {
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

export const useSearchRootProfileOwnerRuntime = ({
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
}: UseSearchRootProfileOwnerRuntimeArgs): SearchRootProfileOwnerRuntimeValue => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;
  const { selectionModelForProfileOwner, restaurantSelectionModel, analyticsModel } =
    useSearchRootProfileSelectionRuntime({
      sessionCoreLane,
      stateFoundationLane,
      isSignedIn,
      userLocation,
      userLocationRef,
      recentActivityAuthorityRuntime,
    });
  const {
    pendingMarkerOpenAnimationFrameRef,
    cameraTransitionPorts,
    nativeExecutionArgs,
    suggestionInteractionRuntime,
  } = useSearchRootProfilePresentationRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    insets,
  });

  const profileOwner = useProfileOwner({
    routeSceneRuntime: rootOverlayFoundationRuntime.routeSceneRuntime,
    searchContext: {
      searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
      resultsPresentationSurfaceAuthority: sessionCoreLane.resultsPresentationSurfaceAuthority,
      getCurrentViewportBounds: () => sessionCoreLane.viewportBoundsService.getBounds(),
      trimmedQuery: rootPrimitivesRuntime.searchState.query.trim(),
      isProfileAutoOpenSuppressed:
        rootPrimitivesRuntime.searchState.isSuggestionPanelActive ||
        rootPrimitivesRuntime.searchState.isSearchFocused,
      getPendingRestaurantSelection: () =>
        rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef.current,
      clearPendingRestaurantSelection: () => {
        rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef.current = null;
      },
    },
    cameraTransitionPorts,
    selectionModel: selectionModelForProfileOwner,
    analyticsModel,
    nativeExecutionArgs,
    appExecutionArgs: {
      foregroundExecutionArgs: {
        ensureInitialCameraReady: sessionCoreLane.mapBootstrapRuntime.ensureInitialCameraReady,
        dismissSearchInteractionUi: suggestionInteractionRuntime.dismissSearchInteractionUi,
      },
      closeExecutionArgs: {
        pendingMarkerOpenAnimationFrameRef,
        hydrationOperationId: rootDataPlaneRuntime.runtimeFlags.hydrationOperationId,
        phaseBMaterializerRef: sessionCoreLane.phaseBMaterializerRef,
        clearSearchAfterProfileDismiss:
          clearRestoreAuthorityRuntime.clearOwner.clearSearchAfterProfileDismiss,
      },
      resultsExecutionArgs: {},
    },
  });

  useSearchRootProfileBridgePublicationRuntime({
    profileBridgeAuthorityRuntime,
    profileOwner,
  });

  useRestaurantEntryPopTeardownWriterRuntime({ profileOwner });

  return React.useMemo(
    () =>
      createSearchRootProfileOwnerRuntimeValue({
        profileOwner,
        restaurantSelectionModel,
        pendingMarkerOpenAnimationFrameRef,
        suggestionInteractionRuntime,
      }),
    [
      pendingMarkerOpenAnimationFrameRef,
      profileOwner,
      restaurantSelectionModel,
      suggestionInteractionRuntime,
    ]
  );
};
