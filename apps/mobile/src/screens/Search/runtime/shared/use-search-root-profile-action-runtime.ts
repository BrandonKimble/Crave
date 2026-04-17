import React from 'react';

import { searchService } from '../../../../services/search';
import type { SearchRootProfileEnvironment } from './search-root-environment-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootProfileActionRuntime } from './use-search-root-action-lanes-runtime-contract';
import type { SearchMapProfileCommandPort } from './search-map-protocol-contract';
import { SCREEN_HEIGHT, USA_FALLBACK_CENTER, USA_FALLBACK_ZOOM } from '../../constants/search';
import {
  pickClosestLocationToCenter as pickClosestRestaurantLocationToCenter,
  pickPreferredRestaurantMapLocation as pickPreferredRestaurantLocation,
  resolveRestaurantLocationSelectionAnchor as resolveRestaurantLocationAnchor,
  resolveRestaurantMapLocations as resolveRestaurantLocations,
} from '../map/restaurant-location-selection';
import { useSuggestionInteractionController } from '../../hooks/use-suggestion-interaction-controller';
import { useProfileOwner } from '../profile/profile-owner-runtime';
import type {
  ProfileAnalyticsModel,
  ProfileOwnerNativeExecutionArgs,
  ProfileSelectionModel,
} from '../profile/profile-owner-runtime-contract';
import type { ProfilePresentationCameraLayoutModel } from '../profile/profile-presentation-model-runtime';
import { logger } from '../../../../utils';

const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;
const PROFILE_CAMERA_ANIMATION_MS = 800;
const PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA = 0.55;
const PROFILE_MULTI_LOCATION_MIN_ZOOM = 3.5;
const RESTAURANT_FOCUS_CENTER_EPSILON = 1e-5;
const RESTAURANT_FOCUS_ZOOM_EPSILON = 0.01;

type UseSearchRootProfileActionRuntimeArgs = {
  environment: SearchRootProfileEnvironment;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionRuntime: Pick<
    SearchRootSessionRuntime,
    'runtimeOwner' | 'primitives' | 'hydrationRuntimeState' | 'runtimeFlags' | 'mapBootstrapRuntime'
  >;
  rootSuggestionRuntime: Pick<
    SearchRootSuggestionRuntime,
    'beginSuggestionCloseHold' | 'resetSearchHeaderFocusProgress' | 'searchBarFrame'
  >;
  rootScaffoldRuntime: Pick<
    SearchRootScaffoldRuntime,
    'resultsSheetRuntimeOwner' | 'overlaySessionRuntime' | 'instrumentationRuntime'
  >;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  profileBridgeRefs: SearchRootRequestLaneRuntime['requestPresentationFlowRuntime']['profileBridgeRefs'];
};

export const useSearchRootProfileActionRuntime = ({
  environment,
  rootPrimitivesRuntime,
  rootSessionRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  profileBridgeRefs,
}: UseSearchRootProfileActionRuntimeArgs): SearchRootProfileActionRuntime => {
  const { insets, isSignedIn, userLocation, userLocationRef } = environment;
  const {
    requestPresentationFlowRuntime: {
      recentActivityRuntime,
      requestPresentationRuntime: { clearOwner, resultsPresentationOwner },
    },
  } = requestLaneRuntime;
  const {
    runtimeOwner: { viewportBoundsService },
  } = rootSessionRuntime;

  const resolveRestaurantMapLocations = React.useCallback(
    (restaurant: Parameters<typeof resolveRestaurantLocations>[0]) =>
      resolveRestaurantLocations(restaurant),
    []
  );
  const resolveRestaurantLocationSelectionAnchor = React.useCallback(
    () =>
      resolveRestaurantLocationAnchor({
        viewportBoundsService,
        userLocation,
        latestUserLocation: userLocationRef.current,
      }),
    [userLocation, userLocationRef, viewportBoundsService]
  );
  const pickClosestLocationToCenter = React.useCallback(
    (
      locations: ReturnType<typeof resolveRestaurantLocations>,
      center: Parameters<typeof pickClosestRestaurantLocationToCenter>[1]
    ) => pickClosestRestaurantLocationToCenter(locations, center),
    []
  );
  const pickPreferredRestaurantMapLocation = React.useCallback(
    (
      restaurant: Parameters<typeof pickPreferredRestaurantLocation>[0],
      anchor: Parameters<typeof pickPreferredRestaurantLocation>[1]
    ) => pickPreferredRestaurantLocation(restaurant, anchor),
    []
  );

  const selectionModel = React.useMemo(
    () => ({
      resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor,
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
    }),
    [
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
      resolveRestaurantLocationSelectionAnchor,
      resolveRestaurantMapLocations,
    ]
  );

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
            rootSessionRuntime.primitives.lastSearchRequestIdRef.current ?? undefined,
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
    [isSignedIn, rootSessionRuntime.primitives.lastSearchRequestIdRef]
  );

  const analyticsModel = React.useMemo<ProfileAnalyticsModel>(
    () => ({
      deferRecentlyViewedTrack: recentActivityRuntime.deferRecentlyViewedTrack,
      recordRestaurantView,
    }),
    [recentActivityRuntime.deferRecentlyViewedTrack, recordRestaurantView]
  );

  const pendingMarkerOpenAnimationFrameRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
      if (pendingFrame != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    };
  }, []);

  const cameraTransitionPorts = React.useMemo<ProfilePresentationCameraLayoutModel>(
    () => ({
      resultsScrollOffset: rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
      sheetTranslateY: rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
      snapPoints: [
        rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.expanded,
        rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.middle,
        rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.collapsed,
      ],
      sheetState: rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState,
      mapCenter: rootPrimitivesRuntime.mapState.mapCenter,
      mapZoom: rootPrimitivesRuntime.mapState.mapZoom,
      searchBarTop: rootScaffoldRuntime.overlaySessionRuntime.searchBarTop,
      searchBarHeight: rootSuggestionRuntime.searchBarFrame?.height ?? 0,
      insetsTop: insets.top,
      navBarTop: rootScaffoldRuntime.overlaySessionRuntime.navBarTopForSnaps,
      screenHeight: SCREEN_HEIGHT,
      profilePinTargetCenterRatio: PROFILE_PIN_TARGET_CENTER_RATIO,
      profilePinMinVisibleHeight: PROFILE_PIN_MIN_VISIBLE_HEIGHT,
      fallbackCenter: USA_FALLBACK_CENTER,
      fallbackZoom: USA_FALLBACK_ZOOM,
    }),
    [
      insets.top,
      rootPrimitivesRuntime.mapState.mapCenter,
      rootPrimitivesRuntime.mapState.mapZoom,
      rootScaffoldRuntime.overlaySessionRuntime.navBarTopForSnaps,
      rootScaffoldRuntime.overlaySessionRuntime.searchBarTop,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetTranslateY,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.collapsed,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.expanded,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.snapPoints.middle,
      rootSuggestionRuntime.searchBarFrame?.height,
    ]
  );

  const selectionModelForProfileOwner = React.useMemo<ProfileSelectionModel>(
    () => ({
      ...selectionModel,
      profileMultiLocationZoomOutDelta: PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA,
      profileMultiLocationMinZoom: PROFILE_MULTI_LOCATION_MIN_ZOOM,
      restaurantFocusCenterEpsilon: RESTAURANT_FOCUS_CENTER_EPSILON,
      restaurantFocusZoomEpsilon: RESTAURANT_FOCUS_ZOOM_EPSILON,
    }),
    [selectionModel]
  );

  const nativeExecutionArgs = React.useMemo<ProfileOwnerNativeExecutionArgs>(
    () => ({
      emitRuntimeMechanismEvent:
        rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
      cameraIntentArbiter: rootSessionRuntime.runtimeOwner.cameraIntentArbiter,
      profileCameraAnimationMs: PROFILE_CAMERA_ANIMATION_MS,
      lastVisibleSheetStateRef: rootSessionRuntime.primitives.lastVisibleSheetStateRef,
      lastCameraStateRef: rootSessionRuntime.primitives.lastCameraStateRef,
      setIsFollowingUser: rootPrimitivesRuntime.mapState.setIsFollowingUser,
      suppressMapMoved: rootPrimitivesRuntime.mapState.suppressMapMoved,
      commitCameraViewport: rootSessionRuntime.primitives.commitCameraViewport,
    }),
    [
      rootPrimitivesRuntime.mapState.setIsFollowingUser,
      rootPrimitivesRuntime.mapState.suppressMapMoved,
      rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
      rootSessionRuntime.primitives.commitCameraViewport,
      rootSessionRuntime.primitives.lastCameraStateRef,
      rootSessionRuntime.primitives.lastVisibleSheetStateRef,
      rootSessionRuntime.runtimeOwner.cameraIntentArbiter,
    ]
  );

  const suggestionInteractionRuntime = useSuggestionInteractionController({
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
    resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    shouldLogPerf: rootScaffoldRuntime.instrumentationRuntime.shouldLogSearchStateChanges,
  });

  const profileOwner = useProfileOwner({
    searchContext: {
      searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
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
        ensureInitialCameraReady: rootSessionRuntime.mapBootstrapRuntime.ensureInitialCameraReady,
        dismissSearchInteractionUi: suggestionInteractionRuntime.dismissSearchInteractionUi,
      },
      closeExecutionArgs: {
        pendingMarkerOpenAnimationFrameRef,
        resultsHydrationKey: rootSessionRuntime.hydrationRuntimeState.resultsHydrationKey,
        hydratedResultsKey: rootSessionRuntime.hydrationRuntimeState.hydratedResultsKey,
        hydrationOperationId: rootSessionRuntime.runtimeFlags.hydrationOperationId,
        phaseBMaterializerRef: rootSessionRuntime.runtimeOwner.phaseBMaterializerRef,
        clearSearchAfterProfileDismiss: clearOwner.clearSearchAfterProfileDismiss,
      },
      resultsExecutionArgs: {
        resultsSheetExecutionModel: resultsPresentationOwner.resultsSheetExecutionModel,
      },
    },
  });

  const { profileViewState, profileActions } = profileOwner;
  const profileActionsRef = React.useRef(profileActions);
  profileActionsRef.current = profileActions;
  profileBridgeRefs.profilePresentationActiveRef.current =
    profileViewState.presentation.isPresentationActive;
  profileBridgeRefs.closeRestaurantProfileRef.current = profileActions.closeRestaurantProfile;
  profileBridgeRefs.resetRestaurantProfileFocusSessionRef.current =
    profileActions.resetRestaurantProfileFocusSession;
  const mapProfileCommandPortRef = React.useRef<SearchMapProfileCommandPort | null>(null);

  if (!mapProfileCommandPortRef.current) {
    mapProfileCommandPortRef.current = {
      openProfileFromMarker: ({ restaurantId, restaurantName, restaurant, pressedCoordinate }) => {
        if (pendingMarkerOpenAnimationFrameRef.current != null) {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
          }
          pendingMarkerOpenAnimationFrameRef.current = null;
        }

        if (restaurant) {
          profileActionsRef.current.openRestaurantProfile(restaurant, {
            pressedCoordinate,
            forceMiddleSnap: true,
            source: 'results_sheet',
          });
          return;
        }

        if (!restaurantName) {
          return;
        }

        profileActionsRef.current.openRestaurantProfilePreview(restaurantId, restaurantName, {
          pressedCoordinate: pressedCoordinate ?? null,
          forceMiddleSnap: true,
        });
      },
    };
  }

  const mapViewState = React.useMemo(
    () => ({
      highlightedRestaurantId: profileViewState.highlightedRestaurantId,
      mapCameraPadding: profileViewState.mapCameraPadding,
    }),
    [profileViewState.highlightedRestaurantId, profileViewState.mapCameraPadding]
  );

  return React.useMemo(
    () => ({
      suggestionInteractionRuntime,
      profileOwner,
      stableOpenRestaurantProfileFromResults:
        profileOwner.profileActions.openRestaurantProfileFromResults,
      pendingMarkerOpenAnimationFrameRef,
      mapProfileCommandPort: mapProfileCommandPortRef.current!,
      mapViewState,
      restaurantSelectionModel: {
        resolveRestaurantMapLocations: selectionModel.resolveRestaurantMapLocations,
        resolveRestaurantLocationSelectionAnchor:
          selectionModel.resolveRestaurantLocationSelectionAnchor,
        pickPreferredRestaurantMapLocation: selectionModel.pickPreferredRestaurantMapLocation,
      },
    }),
    [
      mapViewState,
      pendingMarkerOpenAnimationFrameRef,
      profileOwner,
      selectionModel,
      suggestionInteractionRuntime,
    ]
  );
};
