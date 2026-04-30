import React from 'react';

import { AUTOCOMPLETE_MIN_CHARS } from '../../constants/search';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchOverlayStoreRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootResultsPresentationControlPort } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';

type UseSearchRootForegroundInputFocusRuntimeArgs = {
  resolvedSubmittedQuery: string;
  captureSearchSessionQuery: () => void;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootDataPlaneRuntime: Pick<SearchRootDataPlaneRuntime, 'requestStatusRuntime' | 'runtimeFlags'>;
  rootOverlayStoreRuntime: Pick<SearchOverlayStoreRuntime, 'dismissTransientOverlays'>;
  resultsPresentationOwner: SearchRootResultsPresentationControlPort;
  autocompleteRuntime: ReturnType<typeof useSearchAutocompleteRuntime>;
};

type SearchRootForegroundInputFocusRuntime = {
  focusSearchInput: () => void;
  handleSearchPressIn: () => void;
};

export const useSearchRootForegroundInputFocusRuntime = ({
  resolvedSubmittedQuery,
  captureSearchSessionQuery,
  rootPrimitivesRuntime,
  rootDataPlaneRuntime,
  rootOverlayStoreRuntime,
  resultsPresentationOwner,
  autocompleteRuntime,
}: UseSearchRootForegroundInputFocusRuntimeArgs): SearchRootForegroundInputFocusRuntime => {
  const focusSearchInput = React.useCallback(() => {
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent({
      kind: 'focus_editing',
    });
    rootPrimitivesRuntime.searchState.isSearchEditingRef.current = true;
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    rootOverlayStoreRuntime.dismissTransientOverlays();
    autocompleteRuntime.allowAutocompleteResults();
    rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed(false);
    rootPrimitivesRuntime.searchState.setIsSearchFocused(true);
    rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive(true);

    const submittedQueryTrimmed = resolvedSubmittedQuery.trim();
    const shouldSeedEditingFromSubmittedQuery =
      resultsPresentationOwner.shellModel.backdropTarget === 'results' &&
      rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive &&
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
        rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete();
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
    rootOverlayStoreRuntime,
    rootDataPlaneRuntime.requestStatusRuntime,
    rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
  ]);

  const handleSearchPressIn = React.useCallback(() => {
    resultsPresentationOwner.presentationActions.requestSearchPresentationIntent({
      kind: 'focus_editing',
    });
    rootPrimitivesRuntime.searchState.isSearchEditingRef.current = true;
    rootPrimitivesRuntime.searchState.allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    rootOverlayStoreRuntime.dismissTransientOverlays();
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
    rootOverlayStoreRuntime,
  ]);

  return React.useMemo(
    () => ({
      focusSearchInput,
      handleSearchPressIn,
    }),
    [focusSearchInput, handleSearchPressIn]
  );
};
