import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import { useSearchFilterModalOwner } from '../../hooks/use-search-filter-modal-owner';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type {
  SearchRootForegroundActionRuntime,
  SearchRootProfileActionRuntime,
} from './use-search-root-action-lanes-runtime-contract';
import { useSearchForegroundInteractionRuntime } from './use-search-foreground-interaction-runtime';
import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundEffectsRuntimeArgs,
  SearchForegroundOverlayRuntimeArgs,
  SearchForegroundRestaurantOnlyResolutionArgs,
  SearchForegroundRetryRuntimeArgs,
  SearchForegroundSubmitRuntimeArgs,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchRootForegroundActionRuntimeArgs = Pick<
  SearchRootEnvironment,
  | 'activeMainIntent'
  | 'consumeActiveMainIntent'
  | 'navigation'
  | 'routeSearchIntent'
  | 'userLocation'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootSuggestionRuntime: Pick<
    SearchRootSuggestionRuntime,
    | 'isSuggestionPanelVisible'
    | 'isSuggestionScreenActive'
    | 'beginSubmitTransition'
    | 'beginSuggestionCloseHold'
    | 'resetSearchHeaderFocusProgress'
    | 'resetSubmitTransitionHold'
    | 'setIsSuggestionLayoutWarm'
    | 'setSearchTransitionVariant'
  >;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  profileActionRuntime: SearchRootProfileActionRuntime;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
};

export const useSearchRootForegroundActionRuntime = ({
  activeMainIntent,
  consumeActiveMainIntent,
  navigation,
  routeSearchIntent,
  userLocation,
  rootPrimitivesRuntime,
  rootSessionRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  profileActionRuntime,
  lastAutoOpenKeyRef,
}: UseSearchRootForegroundActionRuntimeArgs): SearchRootForegroundActionRuntime => {
  const {
    requestPresentationFlowRuntime: {
      autocompleteRuntime,
      recentActivityRuntime,
      rootUiBridge,
      requestPresentationRuntime: {
        resultsPresentationOwner,
        clearOwner,
        searchRequestRuntimeOwner,
      },
      foregroundInputRuntime,
    },
  } = requestLaneRuntime;
  const { profileOwner } = profileActionRuntime;
  const runtimeOwner = rootSessionRuntime.runtimeOwner;
  const requestStatusRuntime = rootSessionRuntime.requestStatusRuntime;

  const requestSearchPresentationIntent =
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent;
  const cancelCloseSearch = resultsPresentationOwner.presentationActions.cancelCloseSearch;
  const {
    pendingTogglePresentationIntentId,
    handlePageOneResultsCommitted,
    handlePresentationIntentAbort,
  } = resultsPresentationOwner;

  const onPresentationIntentStart = React.useCallback<
    NonNullable<
      Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts']['onPresentationIntentStart']
    >
  >(
    (params) => {
      cancelCloseSearch();
      requestSearchPresentationIntent({
        kind: params.kind === 'shortcut_rerun' ? 'shortcut_submit' : 'manual_submit',
        transactionId: pendingTogglePresentationIntentId ?? undefined,
        query:
          params.submittedLabel ??
          (params.mode === 'shortcut'
            ? rootSessionRuntime.resultsArrivalState.submittedQuery
            : rootPrimitivesRuntime.searchState.query.trim()),
        targetTab: params.targetTab,
        preserveSheetState: params.preserveSheetState,
        transitionFromDockedPolls: params.transitionFromDockedPolls,
      });
    },
    [
      cancelCloseSearch,
      pendingTogglePresentationIntentId,
      requestSearchPresentationIntent,
      rootPrimitivesRuntime.searchState.query,
      rootSessionRuntime.resultsArrivalState.submittedQuery,
    ]
  );

  const submitReadModel = React.useMemo(
    () => ({
      query: rootPrimitivesRuntime.searchState.query,
      submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
      hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
      canLoadMore: rootSessionRuntime.resultsArrivalState.canLoadMore,
      currentPage: rootSessionRuntime.resultsArrivalState.currentPage,
      activeTab: rootPrimitivesRuntime.searchState.activeTab,
      currentResults: rootSessionRuntime.resultsArrivalState.currentResults,
      isPaginationExhausted: rootSessionRuntime.resultsArrivalState.isPaginationExhausted,
      pendingTabSwitchTab: rootSessionRuntime.resultsArrivalState.pendingTabSwitchTab,
      preferredActiveTab: rootPrimitivesRuntime.searchState.preferredActiveTab,
      hasActiveTabPreference: rootPrimitivesRuntime.searchState.hasActiveTabPreference,
      isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
      openNow: rootSessionRuntime.filterStateRuntime.openNow,
      priceLevels: rootSessionRuntime.filterStateRuntime.priceLevels,
      votes100Plus: rootSessionRuntime.filterStateRuntime.votes100Plus,
    }),
    [
      rootPrimitivesRuntime.searchState.activeTab,
      rootPrimitivesRuntime.searchState.hasActiveTabPreference,
      rootPrimitivesRuntime.searchState.preferredActiveTab,
      rootPrimitivesRuntime.searchState.query,
      rootSessionRuntime.filterStateRuntime.openNow,
      rootSessionRuntime.filterStateRuntime.priceLevels,
      rootSessionRuntime.filterStateRuntime.votes100Plus,
      rootSessionRuntime.resultsArrivalState.canLoadMore,
      rootSessionRuntime.resultsArrivalState.currentPage,
      rootSessionRuntime.resultsArrivalState.currentResults,
      rootSessionRuntime.resultsArrivalState.hasResults,
      rootSessionRuntime.resultsArrivalState.isLoadingMore,
      rootSessionRuntime.resultsArrivalState.isPaginationExhausted,
      rootSessionRuntime.resultsArrivalState.pendingTabSwitchTab,
      rootSessionRuntime.resultsArrivalState.submittedQuery,
    ]
  );

  const submitUiPorts = React.useMemo(
    () => ({
      setActiveTab: rootPrimitivesRuntime.searchState.setActiveTab,
      setError: rootPrimitivesRuntime.searchState.setError,
      resetSheetToHidden: rootScaffoldRuntime.resultsSheetRuntimeOwner.resetResultsSheetToHidden,
      scrollResultsToTop: rootUiBridge.scrollResultsToTop,
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
      resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
      loadRecentHistory: rootSessionRuntime.historyRuntime.loadRecentHistory,
      updateLocalRecentSearches: recentActivityRuntime.deferRecentSearchUpsert,
      getIsProfilePresentationActive: () =>
        profileOwner.profileViewState.presentation.isPresentationActive,
      clearMapHighlightedRestaurantId: profileOwner.profileActions.clearMapHighlightedRestaurantId,
      onPageOneResultsCommitted: handlePageOneResultsCommitted,
      onShortcutSearchCoverageSnapshot:
        rootSessionRuntime.primitives.handleShortcutSearchCoverageSnapshot,
      onPresentationIntentStart,
      onPresentationIntentAbort: handlePresentationIntentAbort,
    }),
    [
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
      onPresentationIntentStart,
      profileOwner.profileActions.clearMapHighlightedRestaurantId,
      profileOwner.profileViewState.presentation.isPresentationActive,
      recentActivityRuntime.deferRecentSearchUpsert,
      rootPrimitivesRuntime.searchState.isSearchEditingRef,
      rootPrimitivesRuntime.searchState.setActiveTab,
      rootPrimitivesRuntime.searchState.setError,
      rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
      rootScaffoldRuntime.resultsSheetRuntimeOwner.resetResultsSheetToHidden,
      rootSessionRuntime.historyRuntime.loadRecentHistory,
      rootSessionRuntime.primitives.handleShortcutSearchCoverageSnapshot,
      rootUiBridge.scrollResultsToTop,
    ]
  );

  const submitRuntimePorts = React.useMemo(
    () => ({
      runtimeWorkSchedulerRef: runtimeOwner.runtimeWorkSchedulerRef,
      searchRuntimeBus: runtimeOwner.searchRuntimeBus,
      lastSearchRequestIdRef: rootSessionRuntime.primitives.lastSearchRequestIdRef,
      lastAutoOpenKeyRef,
      runSearch: requestStatusRuntime.runSearch,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      latestBoundsRef: runtimeOwner.latestBoundsRef,
      viewportBoundsService: runtimeOwner.viewportBoundsService,
      userLocationRef: runtimeOwner.userLocationRef,
      requestRuntimeOwner: searchRequestRuntimeOwner,
    }),
    [
      lastAutoOpenKeyRef,
      requestStatusRuntime.runSearch,
      rootPrimitivesRuntime.mapState.mapRef,
      rootSessionRuntime.primitives.lastSearchRequestIdRef,
      runtimeOwner.latestBoundsRef,
      runtimeOwner.runtimeWorkSchedulerRef,
      runtimeOwner.searchRuntimeBus,
      runtimeOwner.userLocationRef,
      runtimeOwner.viewportBoundsService,
      searchRequestRuntimeOwner,
    ]
  );

  const submitOwnerArgs: Parameters<typeof useSearchSubmitOwnerValue>[0] = {
    readModel: submitReadModel,
    uiPorts: submitUiPorts,
    runtimePorts: submitRuntimePorts,
  };
  const submitRuntimeResult = useSearchSubmitOwnerValue(submitOwnerArgs);

  const scheduleToggleCommit = resultsPresentationOwner.scheduleToggleCommit;
  const filterModalOwnerArgs: Parameters<typeof useSearchFilterModalOwner>[0] = {
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    activeTab: rootPrimitivesRuntime.searchState.activeTab,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    query: rootPrimitivesRuntime.searchState.query,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    openNow: rootSessionRuntime.filterStateRuntime.openNow,
    votesFilterActive: rootSessionRuntime.filterStateRuntime.votes100Plus,
    priceLevels: rootSessionRuntime.filterStateRuntime.priceLevels,
    panelVisible: rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible,
    setVotes100Plus: rootSessionRuntime.filterStateRuntime.setVotes100Plus,
    setOpenNow: rootSessionRuntime.filterStateRuntime.setOpenNow,
    setPriceLevels: rootSessionRuntime.filterStateRuntime.setPriceLevels,
    scheduleToggleCommit,
    rerunActiveSearch: submitRuntimeResult.rerunActiveSearch,
    registerTransientDismissor:
      rootScaffoldRuntime.overlaySessionRuntime.registerTransientDismissor,
    onMechanismEvent: rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
  };
  const filterModalOwner = useSearchFilterModalOwner(filterModalOwnerArgs);

  const filterModalRuntime = React.useMemo(
    () => ({
      ...filterModalOwner,
      openNow: rootSessionRuntime.filterStateRuntime.openNow,
      priceButtonIsActive: rootSessionRuntime.filterStateRuntime.priceLevels.length > 0,
      votesFilterActive: rootSessionRuntime.filterStateRuntime.votes100Plus,
    }),
    [
      filterModalOwner,
      rootSessionRuntime.filterStateRuntime.openNow,
      rootSessionRuntime.filterStateRuntime.priceLevels.length,
      rootSessionRuntime.filterStateRuntime.votes100Plus,
    ]
  );

  const submitRuntimeArgs: SearchForegroundSubmitRuntimeArgs = {
    submitRuntime: {
      submitSearch: submitRuntimeResult.submitSearch,
      runRestaurantEntitySearch: submitRuntimeResult.runRestaurantEntitySearch,
      submitViewportShortcut: submitRuntimeResult.submitViewportShortcut,
      rerunActiveSearch: submitRuntimeResult.rerunActiveSearch,
    },
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    activeTab: rootPrimitivesRuntime.searchState.activeTab,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    shouldShowDockedPolls: rootScaffoldRuntime.overlaySessionRuntime.shouldShowDockedPolls,
    captureSearchSessionOrigin:
      rootScaffoldRuntime.overlaySessionRuntime.captureSearchSessionOrigin,
    ensureSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.ensureSearchOverlay,
    suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
    cancelAutocomplete: requestStatusRuntime.cancelAutocomplete,
    dismissSearchKeyboard: profileActionRuntime.suggestionInteractionRuntime.dismissSearchKeyboard,
    beginSubmitTransition: rootSuggestionRuntime.beginSubmitTransition,
    resetFocusedMapState: rootPrimitivesRuntime.searchState.resetFocusedMapState,
    resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    setRestaurantOnlyIntent: rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
    pendingRestaurantSelectionRef: rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef,
    isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    deferRecentSearchUpsert: recentActivityRuntime.deferRecentSearchUpsert,
    openRestaurantProfilePreview: profileOwner.profileActions.openRestaurantProfilePreview,
  };
  const retryRuntimeArgs: SearchForegroundRetryRuntimeArgs = {
    submitRuntime: submitRuntimeArgs.submitRuntime,
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    isOffline: requestStatusRuntime.isOffline,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
  };
  const editingRuntimeArgs: SearchForegroundEditingRuntimeArgs = {
    clearOwner: {
      clearTypedQuery: clearOwner.clearTypedQuery,
      clearSearchState: clearOwner.clearSearchState,
    },
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    shouldTreatSearchAsResults:
      resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
      rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    showPollsOverlay: rootScaffoldRuntime.overlaySessionRuntime.showPollsOverlay,
    profilePresentationActive: profileOwner.profileViewState.presentation.isPresentationActive,
    captureSearchSessionQuery: foregroundInputRuntime.captureSearchSessionQuery,
    dismissTransientOverlays: rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays,
    allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
    suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
    cancelAutocomplete: requestStatusRuntime.cancelAutocomplete,
    beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
    requestSearchPresentationIntent:
      resultsPresentationOwner.presentationActions.requestSearchPresentationIntent,
    beginCloseSearch: resultsPresentationOwner.presentationActions.beginCloseSearch,
    restoreDockedPolls: rootSessionRuntime.overlayCommandRuntime.restoreDockedPolls,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
  };
  const overlayRuntimeArgs: SearchForegroundOverlayRuntimeArgs = {
    navigation,
    routeSearchIntent,
    userLocation,
    rootOverlay: rootScaffoldRuntime.overlaySessionRuntime.rootOverlay,
    profilePresentationActive: profileOwner.profileViewState.presentation.isPresentationActive,
    overlayRuntimeController: rootSessionRuntime.runtimeOwner.overlayRuntimeController,
    closeRestaurantProfile: profileOwner.profileActions.closeRestaurantProfile,
    dismissTransientOverlays: rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays,
    beginSuggestionCloseHoldRef: rootPrimitivesRuntime.searchState.beginSuggestionCloseHoldRef,
    transitionController: rootSessionRuntime.overlayCommandRuntime.transitionController,
    setTabOverlaySnapRequest:
      rootSessionRuntime.overlayCommandRuntime.commandActions.setTabOverlaySnapRequest,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setIsSuggestionLayoutWarm: rootSuggestionRuntime.setIsSuggestionLayoutWarm,
    setSearchTransitionVariant: rootSuggestionRuntime.setSearchTransitionVariant,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    cancelAutocomplete: requestStatusRuntime.cancelAutocomplete,
    resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
    resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
  };
  const effectsRuntimeArgs: SearchForegroundEffectsRuntimeArgs = {
    registerPendingMutationWorkCancel:
      requestLaneRuntime.requestPresentationFlowRuntime.rootUiBridge
        .registerPendingMutationWorkCancel,
    cancelToggleInteraction: resultsPresentationOwner.cancelToggleInteraction,
    toggleOpenNowHarnessRef: rootScaffoldRuntime.instrumentationRuntime.toggleOpenNowHarnessRef,
    toggleOpenNow: filterModalRuntime.toggleOpenNow,
    selectOverlayHarnessRef: rootScaffoldRuntime.instrumentationRuntime.selectOverlayHarnessRef,
    isSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.isSearchOverlay,
    saveSheetVisible: rootSessionRuntime.overlayCommandRuntime.commandState.saveSheetState.visible,
    handleCloseSaveSheet: rootSessionRuntime.overlayCommandRuntime.handleCloseSaveSheet,
    isSearchFocused: rootPrimitivesRuntime.searchState.isSearchFocused,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    isSuggestionScreenActive: rootSuggestionRuntime.isSuggestionScreenActive,
    dismissTransientOverlays: rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
  };
  const restaurantOnlyResolutionArgs: SearchForegroundRestaurantOnlyResolutionArgs = {
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    restaurantOnlySearchRef: rootPrimitivesRuntime.searchState.restaurantOnlySearchRef,
    restaurantResults: rootSessionRuntime.resultsArrivalState.restaurantResults,
    setRestaurantOnlyId: rootPrimitivesRuntime.searchState.setRestaurantOnlyId,
  };
  const foregroundInteractionArgs: UseSearchForegroundInteractionRuntimeArgs = {
    launchIntentArgs: {
      navigation,
      activeMainIntent,
      consumeActiveMainIntent,
      currentMarketKey:
        typeof rootSessionRuntime.resultsArrivalState.currentResults?.metadata?.marketKey ===
          'string' &&
        rootSessionRuntime.resultsArrivalState.currentResults.metadata.marketKey.trim().length
          ? rootSessionRuntime.resultsArrivalState.currentResults.metadata.marketKey
              .trim()
              .toLowerCase()
          : null,
      openRestaurantProfilePreview: profileOwner.profileActions.openRestaurantProfilePreview,
    },
    submitRuntimeArgs,
    retryRuntimeArgs,
    editingRuntimeArgs,
    overlayRuntimeArgs,
    effectsRuntimeArgs,
    restaurantOnlyResolutionArgs,
  };
  const foregroundInteractionRuntime =
    useSearchForegroundInteractionRuntime(foregroundInteractionArgs);

  return React.useMemo(
    () => ({
      submitRuntimeResult,
      filterModalRuntime,
      foregroundInteractionRuntime,
    }),
    [filterModalRuntime, foregroundInteractionRuntime, submitRuntimeResult]
  );
};
