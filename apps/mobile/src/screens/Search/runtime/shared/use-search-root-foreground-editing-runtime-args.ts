import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootForegroundInputRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEditingRuntimeArgs } from './search-foreground-interaction-runtime-contract';

type UseSearchRootForegroundEditingRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
  profileOwner: ProfileOwner;
};

/**
 * Assembles the flat argument object the foreground-editing interaction runtime consumes.
 *
 * This hook owns NOTHING — no state, no lifetime, no subscription. It is one memo over a
 * set of already-stable values, and that is the whole of it. It was previously spread
 * across seven files (`*-state-args`, `*-action-args`, and the four leaves
 * `*-clear-args` / `*-autocomplete-args` / `*-presentation-args` / `*-search-ui-args`),
 * each of which had exactly one consumer and re-memoized a slice of this same object
 * before spreading it into the next level up. Six intermediate memos cannot make the
 * seventh recompute less often — the dependency set is identical either way — so the
 * tree bought nothing but hook count. Collapsed per F1012; the equivalence and
 * hook-sequence contract is pinned in use-search-root-foreground-editing-runtime-args.spec.ts.
 *
 * The grouping the files encoded survives as the section comments below, which is where
 * that information was actually useful.
 */
export const useSearchRootForegroundEditingRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  resultsPresentationOwner,
  foregroundInputRuntime,
  profileOwner,
}: UseSearchRootForegroundEditingRuntimeArgsArgs): SearchForegroundEditingRuntimeArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const { rootOverlayStoreRuntime, routeOverlayCommandActions } = rootOverlayFoundationRuntime;
  const { autocompleteRuntime } = autocompleteAuthorityRuntime;
  const { clearOwner } = clearRestoreAuthorityRuntime;
  const { searchState } = rootPrimitivesRuntime;
  const { presentationActions } = resultsPresentationOwner;

  return React.useMemo(
    () => ({
      // state
      query: searchState.query,
      submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
      isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
      isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      isSuggestionPanelActive: searchState.isSuggestionPanelActive,
      isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
      shouldTreatSearchAsResults:
        resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
        rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      profilePresentationActive: profileOwner.profileViewState.presentation.isPresentationActive,
      searchSessionQueryRef: searchState.searchSessionQueryRef,
      isSearchEditingRef: searchState.isSearchEditingRef,
      allowSearchBlurExitRef: searchState.allowSearchBlurExitRef,
      ignoreNextSearchBlurRef: searchState.ignoreNextSearchBlurRef,
      inputRef: searchState.inputRef,

      // clear / restore
      clearOwner: {
        clearTypedQuery: clearOwner.clearTypedQuery,
        clearSearchState: clearOwner.clearSearchState,
      },
      captureSearchSessionQuery: foregroundInputRuntime.captureSearchSessionQuery,

      // autocomplete
      allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
      suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
      cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      setIsAutocompleteSuppressed: searchState.setIsAutocompleteSuppressed,

      // presentation
      dismissTransientOverlays: rootOverlayStoreRuntime.dismissTransientOverlays,
      beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
      requestSearchPresentationIntent: presentationActions.requestSearchPresentationIntent,
      beginCloseSearch: presentationActions.beginCloseSearch,
      restoreDockedScene: routeOverlayCommandActions.restoreDockedScene,

      // search UI
      setIsSearchFocused: searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: searchState.setIsSuggestionPanelActive,
      setSuggestions: searchState.setSuggestions,
      setQuery: searchState.setQuery,
    }),
    [
      autocompleteRuntime.allowAutocompleteResults,
      autocompleteRuntime.suppressAutocompleteResults,
      clearOwner.clearSearchState,
      clearOwner.clearTypedQuery,
      foregroundInputRuntime.captureSearchSessionQuery,
      presentationActions.beginCloseSearch,
      presentationActions.requestSearchPresentationIntent,
      profileOwner.profileViewState.presentation.isPresentationActive,
      resultsPresentationOwner.shellModel.backdropTarget,
      rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
      rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
      rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      rootOverlayStoreRuntime.dismissTransientOverlays,
      rootSuggestionRuntime.beginSuggestionCloseHold,
      rootSuggestionRuntime.isSuggestionPanelVisible,
      routeOverlayCommandActions.restoreDockedScene,
      searchState.allowSearchBlurExitRef,
      searchState.ignoreNextSearchBlurRef,
      searchState.inputRef,
      searchState.isSearchEditingRef,
      searchState.isSuggestionPanelActive,
      searchState.query,
      searchState.searchSessionQueryRef,
      searchState.setIsAutocompleteSuppressed,
      searchState.setIsSearchFocused,
      searchState.setIsSuggestionPanelActive,
      searchState.setQuery,
      searchState.setSuggestions,
    ]
  );
};
