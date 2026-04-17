import React from 'react';

import { AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';
import { useSearchClearOwner } from '../../hooks/use-search-clear-owner';
import { useSearchRequestRuntimeOwner } from '../../hooks/use-search-request-runtime-owner';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import { useResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';
import { useSearchRecentActivityRuntime } from './use-search-recent-activity-runtime';

type UseSearchRootRequestLaneRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootSuggestionRuntime: Pick<
    SearchRootSuggestionRuntime,
    | 'isSuggestionPanelVisible'
    | 'isSuggestionScreenActive'
    | 'resetSubmitTransitionHold'
    | 'beginSuggestionCloseHold'
    | 'setSearchTransitionVariant'
  >;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  handleSearchSessionShadowTransition: NonNullable<
    Parameters<typeof useSearchRequestRuntimeOwner>[0]['onSearchSessionShadowTransition']
  >;
  handleCancelPendingMutationWork: () => void;
  profileBridgeRefs: SearchRootRequestLaneRuntime['requestPresentationFlowRuntime']['profileBridgeRefs'];
  rootUiBridge: SearchRootRequestLaneRuntime['requestPresentationFlowRuntime']['rootUiBridge'];
  cancelToggleInteractionRef: React.MutableRefObject<() => void>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  logPresentationDiag: (label: string, data?: Record<string, unknown>) => void;
};

export const useSearchRootRequestLaneRuntime = ({
  rootPrimitivesRuntime,
  rootSessionRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  handleSearchSessionShadowTransition,
  handleCancelPendingMutationWork,
  profileBridgeRefs,
  rootUiBridge,
  cancelToggleInteractionRef,
  lastAutoOpenKeyRef,
  logPresentationDiag,
}: UseSearchRootRequestLaneRuntimeArgs): SearchRootRequestLaneRuntime => {
  const resetResultsListScrollProgressRef = React.useRef<() => void>(() => {});

  const searchRequestRuntimeOwner = useSearchRequestRuntimeOwner({
    cancelSearch: rootSessionRuntime.requestStatusRuntime.cancelSearch,
    onSearchRequestLoadingChange: rootSessionRuntime.runtimeFlags.setSearchRequestLoading,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    runtimeSessionController: rootSessionRuntime.runtimeOwner.searchSessionController,
    onRuntimeMechanismEvent: rootScaffoldRuntime.instrumentationRuntime
      .emitRuntimeMechanismEvent as Parameters<
      typeof useSearchRequestRuntimeOwner
    >[0]['onRuntimeMechanismEvent'],
    onSearchSessionShadowTransition: handleSearchSessionShadowTransition,
  });

  const clearOwner = useSearchClearOwner({
    isClearingSearchRef: rootPrimitivesRuntime.searchState.isClearingSearchRef,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    armSearchCloseRestore: rootScaffoldRuntime.overlaySessionRuntime.armSearchCloseRestore,
    commitSearchCloseRestore: rootScaffoldRuntime.overlaySessionRuntime.commitSearchCloseRestore,
    flushPendingSearchOriginRestore:
      rootScaffoldRuntime.overlaySessionRuntime.flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore:
      rootScaffoldRuntime.overlaySessionRuntime.requestDefaultPostSearchRestore,
    cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
    resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    resetFilters: rootSessionRuntime.filterStateRuntime.resetFilters,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    resetShortcutCoverageState: rootSessionRuntime.primitives.resetShortcutCoverageState,
    resetMapMoveFlag: rootScaffoldRuntime.resultsSheetRuntimeLane.resetMapMoveFlag,
    setError: rootPrimitivesRuntime.searchState.setError,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setIsSearchSessionActive: rootSessionRuntime.runtimeFlags.setIsSearchSessionActive,
    setSearchMode: rootSessionRuntime.runtimeFlags.setSearchMode,
    resetSheetToHidden: rootScaffoldRuntime.resultsSheetRuntimeOwner.resetResultsSheetToHidden,
    lastAutoOpenKeyRef,
    resetFocusedMapState: rootPrimitivesRuntime.searchState.resetFocusedMapState,
    setRestaurantOnlyIntent: rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
    searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    setSearchTransitionVariant: rootSuggestionRuntime.setSearchTransitionVariant,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    profilePresentationActiveRef: profileBridgeRefs.profilePresentationActiveRef,
    closeRestaurantProfileRef: profileBridgeRefs.closeRestaurantProfileRef,
    resetRestaurantProfileFocusSessionRef: profileBridgeRefs.resetRestaurantProfileFocusSessionRef,
    handleCancelPendingMutationWork,
    cancelToggleInteraction: () => {
      cancelToggleInteractionRef.current();
    },
    scrollResultsToTop: rootUiBridge.scrollResultsToTop,
    cancelActiveSearchRequest: searchRequestRuntimeOwner.cancelActiveSearchRequest,
  });

  const resultsPresentationOwner = useResultsPresentationOwner({
    activeTab: rootPrimitivesRuntime.searchState.activeTab,
    setActiveTab: rootPrimitivesRuntime.searchState.setActiveTab,
    setActiveTabPreference: rootPrimitivesRuntime.searchState.setActiveTabPreference,
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    hasActiveSearchContent:
      rootSessionRuntime.runtimeFlags.isSearchSessionActive ||
      rootSessionRuntime.runtimeFlags.isSearchLoading ||
      rootSessionRuntime.resultsArrivalState.hasResults ||
      rootSessionRuntime.resultsArrivalState.submittedQuery.length > 0,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    shouldRenderSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions:
      !rootPrimitivesRuntime.searchState.shouldDisableSearchShortcutsRef.current,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    isClearingSearchRef: rootPrimitivesRuntime.searchState.isClearingSearchRef,
    armSearchCloseRestore: rootScaffoldRuntime.overlaySessionRuntime.armSearchCloseRestore,
    commitSearchCloseRestore: rootScaffoldRuntime.overlaySessionRuntime.commitSearchCloseRestore,
    cancelSearchCloseRestore: rootScaffoldRuntime.overlaySessionRuntime.cancelSearchCloseRestore,
    flushPendingSearchOriginRestore:
      rootScaffoldRuntime.overlaySessionRuntime.flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore:
      rootScaffoldRuntime.overlaySessionRuntime.requestDefaultPostSearchRestore,
    handleCloseResultsUiReset: rootSessionRuntime.overlayCommandRuntime.handleCloseResultsUiReset,
    cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
    resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    setError: rootPrimitivesRuntime.searchState.setError,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    log: logPresentationDiag,
    runOneHandoffCoordinatorRef: rootSessionRuntime.runtimeOwner.runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent: rootScaffoldRuntime.instrumentationRuntime
      .emitRuntimeMechanismEvent as Parameters<
      typeof useResultsPresentationOwner
    >[0]['emitRuntimeMechanismEvent'],
    resultsSheetRuntime: rootScaffoldRuntime.resultsSheetRuntimeOwner,
    handleCancelPendingMutationWork,
    clearTypedQuery: clearOwner.clearTypedQuery,
    clearSearchState: clearOwner.clearSearchState,
    cancelActiveSearchRequest: searchRequestRuntimeOwner.cancelActiveSearchRequest,
  });
  cancelToggleInteractionRef.current = resultsPresentationOwner.cancelToggleInteraction;

  const autocompleteRuntime = useSearchAutocompleteRuntime({
    query: rootPrimitivesRuntime.searchState.query,
    isSuggestionScreenActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    runAutocomplete: rootSessionRuntime.requestStatusRuntime.runAutocomplete,
    cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
  });
  const recentActivityRuntime = useSearchRecentActivityRuntime({
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    searchHistoryRuntime: {
      updateLocalRecentSearches: rootSessionRuntime.historyRuntime.updateLocalRecentSearches,
      trackRecentlyViewedRestaurant:
        rootSessionRuntime.historyRuntime.trackRecentlyViewedRestaurant,
    },
  });

  const resolvedSubmittedQuery =
    typeof rootSessionRuntime.resultsArrivalState.submittedQuery === 'string'
      ? rootSessionRuntime.resultsArrivalState.submittedQuery
      : '';

  const captureSearchSessionQuery = React.useCallback(() => {
    if (
      !rootSessionRuntime.runtimeFlags.isSearchSessionActive ||
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive
    ) {
      return;
    }
    rootPrimitivesRuntime.searchState.searchSessionQueryRef.current =
      rootSessionRuntime.resultsArrivalState.submittedQuery ||
      rootPrimitivesRuntime.searchState.query;
  }, [
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.query,
    rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    rootSessionRuntime.resultsArrivalState.submittedQuery,
    rootSessionRuntime.runtimeFlags.isSearchSessionActive,
  ]);

  React.useEffect(() => {
    if (rootSessionRuntime.runtimeFlags.searchMode !== 'shortcut') {
      return;
    }
    if (resultsPresentationOwner.shellModel.backdropTarget === 'default') {
      return;
    }
    if (
      rootPrimitivesRuntime.searchState.isSearchFocused ||
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive
    ) {
      return;
    }
    const nextQuery = resolvedSubmittedQuery.trim();
    if (!nextQuery || nextQuery === rootPrimitivesRuntime.searchState.query) {
      return;
    }
    rootPrimitivesRuntime.searchState.setQuery(nextQuery);
  }, [
    resolvedSubmittedQuery,
    resultsPresentationOwner.shellModel.backdropTarget,
    rootPrimitivesRuntime.searchState.isSearchFocused,
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.query,
    rootPrimitivesRuntime.searchState.setQuery,
    rootSessionRuntime.runtimeFlags.searchMode,
  ]);

  const focusSearchInput = React.useCallback(() => {
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent({
      kind: 'focus_editing',
    });
    rootPrimitivesRuntime.searchState.isSearchEditingRef.current = true;
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays();
    autocompleteRuntime.allowAutocompleteResults();
    rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed(false);
    rootPrimitivesRuntime.searchState.setIsSearchFocused(true);
    rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive(true);

    const submittedQueryTrimmed = resolvedSubmittedQuery.trim();
    const shouldSeedEditingFromSubmittedQuery =
      resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
      rootSessionRuntime.runtimeFlags.isSearchSessionActive &&
      submittedQueryTrimmed.length > 0 &&
      rootPrimitivesRuntime.searchState.query.trim().length === 0;
    const nextQueryValue = shouldSeedEditingFromSubmittedQuery
      ? submittedQueryTrimmed
      : resultsPresentationOwner.shellModel.backdropTarget === 'default'
        ? ''
        : rootPrimitivesRuntime.searchState.query;
    if (nextQueryValue !== rootPrimitivesRuntime.searchState.query) {
      rootPrimitivesRuntime.searchState.setQuery(nextQueryValue);
    }

    const trimmed = nextQueryValue.trim();
    if (trimmed.length >= AUTOCOMPLETE_MIN_CHARS) {
      const usedCache = autocompleteRuntime.showCachedSuggestionsIfFresh(trimmed);
      if (!usedCache) {
        rootSessionRuntime.requestStatusRuntime.cancelAutocomplete();
      }
    }
    rootPrimitivesRuntime.searchState.inputRef.current?.focus();
  }, [
    autocompleteRuntime,
    captureSearchSessionQuery,
    resolvedSubmittedQuery,
    resultsPresentationOwner.presentationActions,
    resultsPresentationOwner.shellModel.backdropTarget,
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    rootPrimitivesRuntime.searchState.inputRef,
    rootPrimitivesRuntime.searchState.isSearchEditingRef,
    rootPrimitivesRuntime.searchState.query,
    rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    rootPrimitivesRuntime.searchState.setIsSearchFocused,
    rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.setQuery,
    rootScaffoldRuntime.overlaySessionRuntime,
    rootSessionRuntime.requestStatusRuntime,
    rootSessionRuntime.runtimeFlags.isSearchSessionActive,
  ]);

  const handleSearchPressIn = React.useCallback(() => {
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent({
      kind: 'focus_editing',
    });
    rootPrimitivesRuntime.searchState.isSearchEditingRef.current = true;
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    rootScaffoldRuntime.overlaySessionRuntime.dismissTransientOverlays();
    autocompleteRuntime.allowAutocompleteResults();
    rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed(false);
    rootPrimitivesRuntime.searchState.setIsSearchFocused(true);
    rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive(true);
    if (
      resultsPresentationOwner.shellModel.backdropTarget === 'default' &&
      rootPrimitivesRuntime.searchState.query.length > 0
    ) {
      rootPrimitivesRuntime.searchState.setQuery('');
    }
  }, [
    autocompleteRuntime,
    captureSearchSessionQuery,
    resultsPresentationOwner.presentationActions,
    resultsPresentationOwner.shellModel.backdropTarget,
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    rootPrimitivesRuntime.searchState.isSearchEditingRef,
    rootPrimitivesRuntime.searchState.query.length,
    rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    rootPrimitivesRuntime.searchState.setIsSearchFocused,
    rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    rootPrimitivesRuntime.searchState.setQuery,
    rootScaffoldRuntime.overlaySessionRuntime,
  ]);

  const handleQueryChange = React.useCallback(
    (value: string) => {
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed(false);
      rootPrimitivesRuntime.searchState.setQuery(value);
    },
    [
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      rootPrimitivesRuntime.searchState.setQuery,
    ]
  );

  React.useEffect(() => {
    rootPrimitivesRuntime.searchState.setShouldDisableSearchShortcuts(false);
  }, [rootPrimitivesRuntime.searchState.setShouldDisableSearchShortcuts]);

  return {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: {
        searchRequestRuntimeOwner,
        clearOwner,
        resultsPresentationOwner,
      },
      autocompleteRuntime,
      recentActivityRuntime,
      foregroundInputRuntime: {
        captureSearchSessionQuery,
        focusSearchInput,
        handleSearchPressIn,
        handleQueryChange,
      },
      profileBridgeRefs,
      rootUiBridge,
    },
    resetResultsListScrollProgressRef,
  };
};
