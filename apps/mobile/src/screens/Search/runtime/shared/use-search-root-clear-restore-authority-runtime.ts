import React from 'react';

import { useSearchClearOwner } from '../../hooks/use-search-clear-owner';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootMutationCancelAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRequestExecutionAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootClearRestoreAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
};

export const useSearchRootClearRestoreAuthorityRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  requestExecutionAuthorityRuntime,
  mutationCancelAuthorityRuntime,
  profileBridgeAuthorityRuntime,
  resultsScrollAuthorityRuntime,
}: UseSearchRootClearRestoreAuthorityRuntimeArgs): SearchRootClearRestoreAuthorityRuntime => {
  const {
    rootPrimitivesRuntime,
    sessionPrimitivesLane,
    rootDataPlaneRuntime,
    rootSuggestionRuntime,
  } = stateFoundationLane;
  const {
    routeOverlaySessionActions,
    rootResultsSheetRuntimeLane,
    appRouteResultsSheetRuntimeOwner,
  } = rootOverlayFoundationRuntime;

  const clearOwner = useSearchClearOwner({
    isClearingSearchRef: rootPrimitivesRuntime.searchState.isClearingSearchRef,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
    submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    armSearchCloseRestore: routeOverlaySessionActions.armSearchCloseRestore,
    commitSearchCloseRestore: routeOverlaySessionActions.commitSearchCloseRestore,
    flushPendingSearchOriginRestore: routeOverlaySessionActions.flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore: routeOverlaySessionActions.requestDefaultPostSearchRestore,
    cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
    resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    resetFilters: rootDataPlaneRuntime.filterStateRuntime.resetFilters,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    resetShortcutCoverageState: sessionPrimitivesLane.primitives.resetShortcutCoverageState,
    resetMapMoveFlag: rootResultsSheetRuntimeLane.resetMapMoveFlag,
    setError: rootPrimitivesRuntime.searchState.setError,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setIsSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.setIsSearchSessionActive,
    setSearchMode: rootDataPlaneRuntime.runtimeFlags.setSearchMode,
    resetSheetToHidden: appRouteResultsSheetRuntimeOwner.resetResultsSheetToHidden,
    lastAutoOpenKeyRef: requestExecutionAuthorityRuntime.lastAutoOpenKeyRef,
    resetFocusedMapState: rootPrimitivesRuntime.searchState.resetFocusedMapState,
    setRestaurantOnlyIntent: rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
    searchSessionQueryRef: rootPrimitivesRuntime.searchState.searchSessionQueryRef,
    setSearchTransitionVariant: rootSuggestionRuntime.setSearchTransitionVariant,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    profilePresentationActiveRef:
      profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef,
    clearRestaurantProfileForSearchDismissRef:
      profileBridgeAuthorityRuntime.profileBridge.clearRestaurantProfileForSearchDismissRef,
    resetRestaurantProfileFocusSessionRef:
      profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef,
    handleCancelPendingMutationWork:
      mutationCancelAuthorityRuntime.mutationCancelPort.cancelPendingMutationWork,
    cancelToggleInteraction: () => {
      profileBridgeAuthorityRuntime.profileBridge.cancelToggleInteractionRef.current();
    },
    scrollResultsToTop: resultsScrollAuthorityRuntime.resultsScrollPort.scrollResultsToTop,
    cancelActiveSearchRequest:
      requestExecutionAuthorityRuntime.searchRequestRuntimeOwner.cancelActiveSearchRequest,
  });

  return React.useMemo(
    () => ({
      clearOwner,
    }),
    [clearOwner]
  );
};
