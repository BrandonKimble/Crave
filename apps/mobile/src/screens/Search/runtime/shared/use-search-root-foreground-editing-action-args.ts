import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootForegroundInputRuntime,
} from './search-root-control-ports-runtime-contract';
import type {
  SearchRootStateFoundationLane,
} from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootForegroundEditingAutocompleteArgs } from './use-search-root-foreground-editing-autocomplete-args';
import { useSearchRootForegroundEditingClearArgs } from './use-search-root-foreground-editing-clear-args';
import { useSearchRootForegroundEditingPresentationArgs } from './use-search-root-foreground-editing-presentation-args';
import { useSearchRootForegroundEditingSearchUiArgs } from './use-search-root-foreground-editing-search-ui-args';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingActionArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'clearOwner'
  | 'captureSearchSessionQuery'
  | 'dismissTransientOverlays'
  | 'allowAutocompleteResults'
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'beginSuggestionCloseHold'
  | 'requestSearchPresentationIntent'
  | 'beginCloseSearch'
  | 'restoreDockedPolls'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'setIsAutocompleteSuppressed'
>;

type UseSearchRootForegroundEditingActionArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
};

export const useSearchRootForegroundEditingActionArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  resultsPresentationOwner,
  foregroundInputRuntime,
}: UseSearchRootForegroundEditingActionArgsArgs): SearchRootForegroundEditingActionArgs => {
  const editingClearArgs = useSearchRootForegroundEditingClearArgs({
    clearRestoreAuthorityRuntime,
    foregroundInputRuntime,
  });
  const editingAutocompleteArgs = useSearchRootForegroundEditingAutocompleteArgs({
    stateFoundationLane,
    autocompleteAuthorityRuntime,
  });
  const editingPresentationArgs = useSearchRootForegroundEditingPresentationArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    resultsPresentationOwner,
  });
  const editingSearchUiArgs = useSearchRootForegroundEditingSearchUiArgs({
    stateFoundationLane,
  });

  return React.useMemo(
    () => ({
      ...editingClearArgs,
      ...editingAutocompleteArgs,
      ...editingPresentationArgs,
      ...editingSearchUiArgs,
    }),
    [
      editingAutocompleteArgs,
      editingClearArgs,
      editingPresentationArgs,
      editingSearchUiArgs,
    ]
  );
};
