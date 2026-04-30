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
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
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
  resultsPresentationOwner: Pick<ResultsPresentationOwner, 'resultsSheetExecutionModel'>;
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
  resultsPresentationOwner,
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
      trimmedQuery: rootPrimitivesRuntime.searchState.query.trim(),
      restaurantOnlyId: rootPrimitivesRuntime.searchState.restaurantOnlyId,
      isProfileAutoOpenSuppressed:
        rootPrimitivesRuntime.searchState.isSuggestionPanelActive ||
        rootPrimitivesRuntime.searchState.isSearchFocused,
      getPendingRestaurantSelection: () =>
        rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef.current,
      clearPendingRestaurantSelection: () => {
        rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef.current = null;
      },
      getRestaurantOnlySearchId: () =>
        rootPrimitivesRuntime.searchState.restaurantOnlySearchRef.current,
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
        resultsHydrationKey: rootDataPlaneRuntime.hydrationRuntimeState.resultsHydrationKey,
        hydratedResultsKey: rootDataPlaneRuntime.hydrationRuntimeState.hydratedResultsKey,
        hydrationOperationId: rootDataPlaneRuntime.runtimeFlags.hydrationOperationId,
        phaseBMaterializerRef: sessionCoreLane.phaseBMaterializerRef,
        clearSearchAfterProfileDismiss:
          clearRestoreAuthorityRuntime.clearOwner.clearSearchAfterProfileDismiss,
      },
      resultsExecutionArgs: {
        resultsSheetExecutionModel: resultsPresentationOwner.resultsSheetExecutionModel,
      },
    },
  });

  useSearchRootProfileBridgePublicationRuntime({
    profileBridgeAuthorityRuntime,
    profileOwner,
  });

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
