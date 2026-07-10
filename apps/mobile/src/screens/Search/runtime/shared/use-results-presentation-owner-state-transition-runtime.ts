import type React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerCloseRuntime } from './use-results-presentation-owner-close-runtime';
import type { ResultsPresentationOwnerStateSessionRuntime } from './use-results-presentation-owner-state-session-runtime';

export type ResultsPresentationOwnerStateTransitionRuntime = {
  closeTransitionRuntime: ReturnType<typeof useResultsPresentationOwnerCloseRuntime>;
};

export const useResultsPresentationOwnerStateTransitionRuntime = <Suggestion>({
  searchRuntimeBus,
  clearSearchState,
  cancelActiveSearchRequest,
  cancelAutocomplete,
  handleCancelPendingMutationWork,
  resetSubmitTransitionHold,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setQuery,
  setError,
  setSuggestions,
  inputRef,
  sessionRuntime,
  routeSceneVisibilityPolicyRuntime,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  clearSearchState: () => void;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  handleCancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  inputRef: React.RefObject<{ blur?: () => void } | null>;
  sessionRuntime: ResultsPresentationOwnerStateSessionRuntime;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
}): ResultsPresentationOwnerStateTransitionRuntime => {
  // S-C.5 item 2 (wrapper collapse): the pure re-lister owner-close-state-runtime is
  // deleted — its only move was picking these two fields off the session runtimes.
  const closeTransitionRuntime = useResultsPresentationOwnerCloseRuntime({
    searchRuntimeBus,
    clearSearchState,
    cancelActiveSearchRequest,
    cancelAutocomplete,
    handleCancelPendingMutationWork,
    resetSubmitTransitionHold,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    setQuery,
    setError,
    setSuggestions,
    inputRef,
    shellLocalState: sessionRuntime.shellStateRuntime.shellLocalState,
    resultsRuntimeOwner: sessionRuntime.bridgeStateRuntime.resultsRuntimeOwner,
    markSearchSheetCloseMapExitSettledRef:
      sessionRuntime.bridgeStateRuntime.markSearchSheetCloseMapExitSettledRef,
    routeSceneVisibilityPolicyRuntime,
  });

  return {
    closeTransitionRuntime,
  };
};
