import type React from 'react';

import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerCloseStateRuntime } from './use-results-presentation-owner-close-state-runtime';
import type { ResultsPresentationOwnerStateSessionRuntime } from './use-results-presentation-owner-state-session-runtime';

export type ResultsPresentationOwnerStateTransitionRuntime = {
  closeTransitionRuntime: ReturnType<typeof useResultsPresentationOwnerCloseStateRuntime>;
};

export const useResultsPresentationOwnerStateTransitionRuntime = <Suggestion>({
  searchRuntimeBus,
  clearSearchState,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
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
  armSearchCloseRestore: (options?: ArmSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
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
  const closeTransitionRuntime = useResultsPresentationOwnerCloseStateRuntime({
    searchRuntimeBus,
    clearSearchState,
    armSearchCloseRestore,
    commitSearchCloseRestore,
    cancelSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
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
    bridgeStateRuntime: sessionRuntime.bridgeStateRuntime,
    shellStateRuntime: sessionRuntime.shellStateRuntime,
    routeSceneVisibilityPolicyRuntime,
  });

  return {
    closeTransitionRuntime,
  };
};
