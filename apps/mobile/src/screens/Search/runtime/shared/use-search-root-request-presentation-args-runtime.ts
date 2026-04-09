import { logger } from '../../../../utils';
import { useSearchRequestPresentationFlowRuntime } from './use-search-request-presentation-flow-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

type UseSearchRootRequestPresentationArgsRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
};

export type SearchRootRequestPresentationArgsRuntime = Parameters<
  typeof useSearchRequestPresentationFlowRuntime
>[0]['requestPresentationArgs'];

export const useSearchRootRequestPresentationArgsRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
}: UseSearchRootRequestPresentationArgsRuntimeArgs): SearchRootRequestPresentationArgsRuntime => {
  const {
    runtimeOwner: { searchRuntimeBus, overlayRuntimeController, runOneHandoffCoordinatorRef },
    resultsArrivalState: { hasResults, submittedQuery },
    runtimeFlags: {
      isSearchSessionActive,
      isSearchLoading,
      setSearchMode,
      setIsSearchSessionActive,
      setSearchRequestLoading,
    },
    overlayCommandRuntime: { handleCloseResultsUiReset },
    filterStateRuntime: { resetFilters },
    requestStatusRuntime: { cancelAutocomplete, cancelSearch },
  } = rootSessionRuntime;
  const {
    searchState: {
      setRestaurantOnlyIntent,
      resetFocusedMapState,
      searchSessionQueryRef,
      isClearingSearchRef,
      setError,
      query,
      setQuery,
      setSuggestions,
      setShowSuggestions,
      setIsSearchFocused,
      isSuggestionPanelActive,
      setIsSuggestionPanelActive,
      activeTab,
      setActiveTab,
      setActiveTabPreference,
      inputRef,
      ignoreNextSearchBlurRef,
    },
  } = rootPrimitivesRuntime;
  const { resetSubmitTransitionHold, setSearchTransitionVariant } = rootSuggestionRuntime;
  const {
    overlaySessionRuntime: {
      armSearchCloseRestore,
      commitSearchCloseRestore,
      cancelSearchCloseRestore,
      flushPendingSearchOriginRestore,
      requestDefaultPostSearchRestore,
      shouldRenderSearchOverlay,
    },
    resultsSheetRuntimeLane: { resetMapMoveFlag },
    resultsSheetRuntimeOwner,
    instrumentationRuntime: { emitRuntimeMechanismEvent },
  } = rootScaffoldRuntime;

  return {
    requestRuntimeArgs: {
      cancelSearch,
      onSearchRequestLoadingChange: setSearchRequestLoading,
      searchRuntimeBus,
      runtimeSessionController: rootSessionRuntime.runtimeOwner.searchSessionController,
    },
    clearOwnerArgs: {
      isClearingSearchRef,
      isSearchSessionActive,
      hasResults,
      submittedQuery,
      armSearchCloseRestore,
      commitSearchCloseRestore,
      flushPendingSearchOriginRestore,
      requestDefaultPostSearchRestore,
      cancelAutocomplete,
      resetSubmitTransitionHold,
      resetFilters,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      setShowSuggestions,
      setQuery,
      searchRuntimeBus,
      resetShortcutCoverageState: rootSessionRuntime.primitives.resetShortcutCoverageState,
      resetMapMoveFlag,
      setError,
      setSuggestions,
      setIsSearchSessionActive,
      setSearchMode,
      resetSheetToHidden: resultsSheetRuntimeOwner.resetResultsSheetToHidden,
      lastAutoOpenKeyRef: overlayRuntimeController.lastAutoOpenKeyRef,
      resetFocusedMapState,
      setRestaurantOnlyIntent,
      searchSessionQueryRef,
      setSearchTransitionVariant,
      inputRef,
    },
    resultsPresentationArgs: {
      activeTab,
      setActiveTab,
      setActiveTabPreference,
      query,
      submittedQuery,
      hasActiveSearchContent:
        isSearchSessionActive || isSearchLoading || hasResults || submittedQuery.length > 0,
      isSearchSessionActive,
      hasResults,
      isSearchLoading,
      isSuggestionPanelActive,
      shouldRenderSearchOverlay,
      shouldEnableShortcutInteractions:
        !rootPrimitivesRuntime.searchState.shouldDisableSearchShortcutsRef.current,
      ignoreNextSearchBlurRef,
      isClearingSearchRef,
      armSearchCloseRestore,
      commitSearchCloseRestore,
      cancelSearchCloseRestore,
      flushPendingSearchOriginRestore,
      requestDefaultPostSearchRestore,
      handleCloseResultsUiReset,
      cancelAutocomplete,
      resetSubmitTransitionHold,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      setShowSuggestions,
      setQuery,
      setError,
      setSuggestions,
      inputRef,
      searchRuntimeBus,
      log: (label, data) => {
        logger.debug('[PRESENTATION-DIAG] controller', {
          label,
          ...(data ?? {}),
        });
      },
      runOneHandoffCoordinatorRef,
      emitRuntimeMechanismEvent,
      resultsSheetRuntime: resultsSheetRuntimeOwner,
    },
  };
};
