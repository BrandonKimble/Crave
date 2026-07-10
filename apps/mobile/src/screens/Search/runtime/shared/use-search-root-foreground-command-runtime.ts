import React from 'react';

import { registerSearchReconcilerViewInputs } from '../reconciler/search-reconciler-presentation-port';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type {
  SuggestionInteractionRuntime,
  SubmitRuntimeResult,
} from './use-search-root-control-plane-runtime-contract';
import { useSearchForegroundCommandRuntime } from './use-search-foreground-command-runtime';
import type { SearchForegroundCommandRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type UseSearchRootForegroundCommandRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  profileOwner: ProfileOwner;
  suggestionInteractionRuntime: SuggestionInteractionRuntime;
  submitRuntimeResult: SubmitRuntimeResult;
};

export const useSearchRootForegroundCommandRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteAuthorityRuntime,
  recentActivityAuthorityRuntime,
  profileOwner,
  suggestionInteractionRuntime,
  submitRuntimeResult,
}: UseSearchRootForegroundCommandRuntimeArgs) => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const { routeOverlaySessionSnapshotRef, rootSharedSheetRuntimeLane, routeSearchCommandActions } =
    rootOverlayFoundationRuntime;
  // S4b: the reconciler derives the docked-polls enter-transition variant as a VIEW
  // INPUT at transition time (the trigger no longer passes it).
  React.useEffect(
    () =>
      registerSearchReconcilerViewInputs({
        getDockedPollsFlag: () =>
          routeOverlaySessionSnapshotRef.current.shouldShowDockedPolls === true,
      }),
    [routeOverlaySessionSnapshotRef]
  );
  const openPollDetail = React.useCallback(
    (pollId: string) => {
      routeSearchCommandActions.openAppSearchRoutePollsHome({
        params: { pollId },
      });
    },
    [routeSearchCommandActions]
  );
  const { autocompleteRuntime } = autocompleteAuthorityRuntime;
  const { recentActivityRuntime } = recentActivityAuthorityRuntime;
  const requestStatusRuntime = rootDataPlaneRuntime.requestStatusRuntime;

  const commandRuntimeArgs = React.useMemo(
    () =>
      ({
        submitRuntime: {
          submitSearch: submitRuntimeResult.submitSearch,
          runRestaurantEntitySearch: submitRuntimeResult.runRestaurantEntitySearch,
          submitViewportShortcut: submitRuntimeResult.submitViewportShortcut,
          rerunActiveSearch: submitRuntimeResult.rerunActiveSearch,
        },
        query: rootPrimitivesRuntime.searchState.query,
        suggestions: rootPrimitivesRuntime.searchState.suggestions,
        submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
        searchMode: rootDataPlaneRuntime.runtimeFlags.searchMode,
        activeTab: rootPrimitivesRuntime.searchState.activeTab,
        hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
        isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
        isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
        isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
        isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
        shouldShowDockedPollsRef: routeOverlaySessionSnapshotRef,
        suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
        cancelAutocomplete: requestStatusRuntime.cancelAutocomplete,
        dismissSearchKeyboard: suggestionInteractionRuntime.dismissSearchKeyboard,
        beginSubmitTransition: rootSuggestionRuntime.beginSubmitTransition,
        resetFocusedMapState: rootPrimitivesRuntime.searchState.resetFocusedMapState,
        resetMapMoveFlag: rootSharedSheetRuntimeLane.resetMapMoveFlag,
        setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
        setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
        setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
        setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
        setQuery: rootPrimitivesRuntime.searchState.setQuery,
        setRestaurantOnlyIntent: rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
        pendingRestaurantSelectionRef:
          rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef,
        isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
        allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
        ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
        deferRecentSearchUpsert:
          recentActivityRuntime.deferRecentSearchUpsert as SearchForegroundCommandRuntimeArgs['deferRecentSearchUpsert'],
        openRestaurantProfilePreview: profileOwner.profileActions.openRestaurantProfilePreview,
        openPollDetail,
        isOffline: requestStatusRuntime.isOffline,
      }) satisfies SearchForegroundCommandRuntimeArgs,
    [
      autocompleteRuntime.suppressAutocompleteResults,
      openPollDetail,
      profileOwner.profileActions.openRestaurantProfilePreview,
      recentActivityRuntime.deferRecentSearchUpsert,
      requestStatusRuntime.cancelAutocomplete,
      requestStatusRuntime.isOffline,
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
      rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      rootDataPlaneRuntime.runtimeFlags.searchMode,
      routeOverlaySessionSnapshotRef,
      rootPrimitivesRuntime.searchState.activeTab,
      rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      rootPrimitivesRuntime.searchState.isSearchEditingRef,
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.pendingRestaurantSelectionRef,
      rootPrimitivesRuntime.searchState.query,
      rootPrimitivesRuntime.searchState.resetFocusedMapState,
      rootPrimitivesRuntime.searchState.setIsSearchFocused,
      rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.setQuery,
      rootPrimitivesRuntime.searchState.setRestaurantOnlyIntent,
      rootPrimitivesRuntime.searchState.setShowSuggestions,
      rootPrimitivesRuntime.searchState.setSuggestions,
      rootPrimitivesRuntime.searchState.suggestions,
      rootSharedSheetRuntimeLane.resetMapMoveFlag,
      rootSuggestionRuntime.beginSubmitTransition,
      submitRuntimeResult.rerunActiveSearch,
      submitRuntimeResult.runRestaurantEntitySearch,
      submitRuntimeResult.submitSearch,
      submitRuntimeResult.submitViewportShortcut,
      suggestionInteractionRuntime.dismissSearchKeyboard,
    ]
  );

  return useSearchForegroundCommandRuntime(commandRuntimeArgs);
};
