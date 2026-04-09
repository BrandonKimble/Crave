import React from 'react';

import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';
import type { SearchSessionActionRuntime } from './search-session-action-runtime-contract';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';
import type { UseSearchRootRuntimeArgs } from './use-search-root-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import { useSearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime';
import type { UseSearchForegroundInteractionRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';
import { useSearchRootFilterSurfaceRuntime } from './use-search-root-filter-surface-runtime';
import { useSearchRootSessionProfileSurfaceRuntime } from './use-search-root-session-profile-surface-runtime';
import { useSearchRootSubmitOwnerSurfaceRuntime } from './use-search-root-submit-owner-surface-runtime';
import { useSearchRootSubmitPresentationRuntime } from './use-search-root-submit-presentation-runtime';

type UseSearchRootSessionActionOwnerRuntimeArgs = Pick<
  UseSearchRootRuntimeArgs,
  | 'insets'
  | 'isSignedIn'
  | 'userLocation'
  | 'userLocationRef'
  | 'navigation'
  | 'routeSearchIntent'
  | 'activeMainIntent'
  | 'consumeActiveMainIntent'
> & {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export type SearchRootSessionActionOwnerRuntime = {
  sessionActionRuntime: SearchSessionActionRuntime;
  closeTransitionActions: ResultsCloseTransitionActions;
  preparedResultsSnapshotKey: string | null;
  pendingMarkerOpenAnimationFrameRef: SearchRootProfileActionRuntime['pendingMarkerOpenAnimationFrameRef'];
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
};

export const useSearchRootSessionActionOwnerRuntime = ({
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  navigation,
  routeSearchIntent,
  activeMainIntent,
  consumeActiveMainIntent,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootSessionActionOwnerRuntimeArgs): SearchRootSessionActionOwnerRuntime => {
  const profileSurfaceRuntime = useSearchRootSessionProfileSurfaceRuntime({
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });
  const { pendingMarkerOpenAnimationFrameRef, restaurantSelectionModel } = profileSurfaceRuntime;

  const submitPresentationRuntime = useSearchRootSubmitPresentationRuntime({
    rootSessionRuntime,
    rootPrimitivesRuntime,
    requestLaneRuntime,
  });
  const { closeTransitionActions, preparedResultsSnapshotKey, scheduleToggleCommit } =
    submitPresentationRuntime;

  const { submitRuntimeResult } = useSearchRootSubmitOwnerSurfaceRuntime({
    profileOwnerRuntime: profileSurfaceRuntime,
    submitPresentationRuntime,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });

  const { filterModalRuntime } = useSearchRootFilterSurfaceRuntime({
    submitRuntime: {
      submitRuntimeResult,
      scheduleToggleCommit,
    },
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootScaffoldRuntime,
  });

  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner, clearOwner },
      foregroundInputRuntime,
      rootUiBridge,
      recentActivityRuntime,
    },
  } = requestLaneRuntime;

  const foregroundInteractionArgs = React.useMemo<UseSearchForegroundInteractionRuntimeArgs>(
    () => ({
      navigation,
      routeSearchIntent,
      activeMainIntent,
      consumeActiveMainIntent,
      userLocation,
      submitRuntime: {
        submitSearch: submitRuntimeResult.submitSearch,
        runRestaurantEntitySearch: submitRuntimeResult.runRestaurantEntitySearch,
        submitViewportShortcut: submitRuntimeResult.submitViewportShortcut,
        rerunActiveSearch: submitRuntimeResult.rerunActiveSearch,
      },
      clearOwner: {
        clearTypedQuery: clearOwner.clearTypedQuery,
        clearSearchState: clearOwner.clearSearchState,
      },
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
      searchMode: rootSessionRuntime.runtimeFlags.searchMode,
      activeTab: rootPrimitivesRuntime.searchState.activeTab,
      hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
      isOffline: rootSessionRuntime.requestStatusRuntime.isOffline,
      isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
      isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
      isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
      isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
      shouldTreatSearchAsResults:
        resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
        rootSessionRuntime.runtimeFlags.isSearchSessionActive,
      shouldShowDockedPolls: rootScaffoldRuntime.overlaySessionRuntime.shouldShowDockedPolls,
      showPollsOverlay: rootScaffoldRuntime.overlaySessionRuntime.showPollsOverlay,
      rootOverlay: rootScaffoldRuntime.overlaySessionRuntime.rootOverlay,
      profilePresentationActive:
        profileSurfaceRuntime.profileOwner.profileViewState.presentation.isPresentationActive,
      overlayRuntimeController: rootSessionRuntime.runtimeOwner.overlayRuntimeController,
      openRestaurantProfilePreview:
        profileSurfaceRuntime.profileOwner.profileActions.openRestaurantProfilePreview,
      closeRestaurantProfile:
        profileSurfaceRuntime.profileOwner.profileActions.closeRestaurantProfile,
      captureSearchSessionOrigin:
        rootScaffoldRuntime.overlaySessionRuntime.captureSearchSessionOrigin,
      captureSearchSessionQuery: foregroundInputRuntime.captureSearchSessionQuery,
      ensureSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.ensureSearchOverlay,
      restoreDockedPolls: rootSessionRuntime.overlayCommandRuntime.restoreDockedPolls,
      dismissTransientOverlays: rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays,
      suppressAutocompleteResults:
        rootSessionRuntime.requestStatusRuntime.autocompleteRuntime.suppressAutocompleteResults,
      allowAutocompleteResults:
        rootSessionRuntime.requestStatusRuntime.autocompleteRuntime.allowAutocompleteResults,
      cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
      dismissSearchKeyboard:
        profileSurfaceRuntime.suggestionInteractionRuntime.dismissSearchKeyboard,
      beginSubmitTransition: rootSuggestionRuntime.beginSubmitTransition,
      beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
      beginSuggestionCloseHoldRef: rootPrimitivesRuntime.searchState.beginSuggestionCloseHoldRef,
      requestSearchPresentationIntent:
        resultsPresentationOwner.presentationActions.requestSearchPresentationIntent,
      resetFocusedMapState: rootPrimitivesRuntime.searchState.resetFocusedMapState,
      resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
      resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
      beginCloseSearch: resultsPresentationOwner.presentationActions.beginCloseSearch,
      setOverlaySwitchInFlight:
        rootSessionRuntime.overlayCommandRuntime.commandActions.setOverlaySwitchInFlight,
      setTabOverlaySnapRequest:
        rootSessionRuntime.overlayCommandRuntime.commandActions.setTabOverlaySnapRequest,
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
      setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
      setQuery: rootPrimitivesRuntime.searchState.setQuery,
      setRestaurantOnlyIntent: rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
      setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      setIsSuggestionLayoutWarm: rootSuggestionRuntime.setIsSuggestionLayoutWarm,
      setSearchTransitionVariant: rootSuggestionRuntime.setSearchTransitionVariant,
      registerPendingMutationWorkCancel: rootUiBridge.registerPendingMutationWorkCancel,
      cancelToggleInteraction: filterModalRuntime.cancelToggleInteraction,
      toggleOpenNowHarnessRef: rootScaffoldRuntime.instrumentationRuntime.toggleOpenNowHarnessRef,
      toggleOpenNow: filterModalRuntime.toggleOpenNow,
      isSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.isSearchOverlay,
      isSearchFocused: rootPrimitivesRuntime.searchState.isSearchFocused,
      isSuggestionScreenActive: rootSuggestionRuntime.isSuggestionScreenActive,
      pendingRestaurantSelectionRef:
        rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef,
      restaurantOnlySearchRef: rootPrimitivesRuntime.searchState.restaurantOnlySearchRef,
      restaurantResults: rootSessionRuntime.resultsArrivalState.restaurantResults,
      searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
      allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      inputRef: rootPrimitivesRuntime.searchState.inputRef,
      deferRecentSearchUpsert: recentActivityRuntime.deferRecentSearchUpsert,
      setRestaurantOnlyId: rootPrimitivesRuntime.searchState.setRestaurantOnlyId,
      saveSheetVisible:
        rootSessionRuntime.overlayCommandRuntime.commandState.saveSheetState.visible,
      handleCloseSaveSheet: rootSessionRuntime.overlayCommandRuntime.handleCloseSaveSheet,
    }),
    [
      activeMainIntent,
      clearOwner.clearSearchState,
      clearOwner.clearTypedQuery,
      consumeActiveMainIntent,
      filterModalRuntime.cancelToggleInteraction,
      filterModalRuntime.toggleOpenNow,
      foregroundInputRuntime.captureSearchSessionQuery,
      navigation,
      profileSurfaceRuntime.profileOwner.profileActions,
      profileSurfaceRuntime.profileOwner.profileViewState.presentation.isPresentationActive,
      profileSurfaceRuntime.suggestionInteractionRuntime.dismissSearchKeyboard,
      recentActivityRuntime.deferRecentSearchUpsert,
      resultsPresentationOwner.presentationActions,
      resultsPresentationOwner.shellModel.backdropTarget,
      rootPrimitivesRuntime.searchState,
      rootScaffoldRuntime.instrumentationRuntime.toggleOpenNowHarnessRef,
      rootScaffoldRuntime.overlaySessionRuntime,
      rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
      rootSessionRuntime.overlayCommandRuntime.commandActions,
      rootSessionRuntime.overlayCommandRuntime.commandState.saveSheetState.visible,
      rootSessionRuntime.overlayCommandRuntime.handleCloseSaveSheet,
      rootSessionRuntime.overlayCommandRuntime.restoreDockedPolls,
      rootSessionRuntime.requestStatusRuntime.autocompleteRuntime,
      rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
      rootSessionRuntime.requestStatusRuntime.isOffline,
      rootSessionRuntime.resultsArrivalState.hasResults,
      rootSessionRuntime.resultsArrivalState.isLoadingMore,
      rootSessionRuntime.resultsArrivalState.restaurantResults,
      rootSessionRuntime.resultsArrivalState.submittedQuery,
      rootSessionRuntime.runtimeFlags.isSearchLoading,
      rootSessionRuntime.runtimeFlags.isSearchSessionActive,
      rootSessionRuntime.runtimeFlags.searchMode,
      rootSessionRuntime.runtimeOwner.overlayRuntimeController,
      rootSuggestionRuntime.beginSubmitTransition,
      rootSuggestionRuntime.beginSuggestionCloseHold,
      rootSuggestionRuntime.isSuggestionPanelVisible,
      rootSuggestionRuntime.isSuggestionScreenActive,
      rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      rootSuggestionRuntime.resetSubmitTransitionHold,
      rootSuggestionRuntime.setIsSuggestionLayoutWarm,
      rootSuggestionRuntime.setSearchTransitionVariant,
      routeSearchIntent,
      rootUiBridge.registerPendingMutationWorkCancel,
      submitRuntimeResult.rerunActiveSearch,
      submitRuntimeResult.runRestaurantEntitySearch,
      submitRuntimeResult.submitSearch,
      submitRuntimeResult.submitViewportShortcut,
      userLocation,
    ]
  );

  const foregroundInteractionRuntime = useSearchForegroundInteractionRuntime({
    ...foregroundInteractionArgs,
  });

  const sessionActionRuntime = React.useMemo<SearchSessionActionRuntime>(
    () => ({
      suggestionInteractionRuntime: profileSurfaceRuntime.suggestionInteractionRuntime,
      profileOwner: profileSurfaceRuntime.profileOwner,
      stableOpenRestaurantProfileFromResults:
        profileSurfaceRuntime.stableOpenRestaurantProfileFromResults,
      submitRuntimeResult,
      filterModalRuntime,
      foregroundInteractionRuntime,
    }),
    [
      filterModalRuntime,
      foregroundInteractionRuntime,
      profileSurfaceRuntime.profileOwner,
      profileSurfaceRuntime.stableOpenRestaurantProfileFromResults,
      profileSurfaceRuntime.suggestionInteractionRuntime,
      submitRuntimeResult,
    ]
  );

  return {
    sessionActionRuntime,
    closeTransitionActions,
    preparedResultsSnapshotKey,
    pendingMarkerOpenAnimationFrameRef,
    restaurantSelectionModel,
  };
};
