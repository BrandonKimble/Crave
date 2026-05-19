import type React from 'react';

import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ResultsPresentationOwnerBridgeStateRuntime } from './use-results-presentation-owner-bridge-state-runtime';
import type { ResultsPresentationOwnerShellStateRuntime } from './use-results-presentation-owner-shell-state-runtime';
import { useResultsPresentationOwnerCloseRuntime } from './use-results-presentation-owner-close-runtime';

type UseResultsPresentationOwnerCloseStateRuntimeArgs<Suggestion> = {
  searchRuntimeBus: SearchRuntimeBus;
  clearSearchState: () => void;
  armSearchCloseRestore: (options?: ArmSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: (options?: { mode?: 'full' | 'chrome-only' }) => void;
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
  bridgeStateRuntime: ResultsPresentationOwnerBridgeStateRuntime;
  shellStateRuntime: ResultsPresentationOwnerShellStateRuntime;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export type ResultsPresentationOwnerCloseStateRuntime = ReturnType<
  typeof useResultsPresentationOwnerCloseRuntime
>;

export const useResultsPresentationOwnerCloseStateRuntime = <Suggestion>({
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
  bridgeStateRuntime,
  shellStateRuntime,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationOwnerCloseStateRuntimeArgs<Suggestion>): ResultsPresentationOwnerCloseStateRuntime => {
  return useResultsPresentationOwnerCloseRuntime({
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
    shellLocalState: shellStateRuntime.shellLocalState,
    resultsRuntimeOwner: bridgeStateRuntime.resultsRuntimeOwner,
    markSearchSheetCloseMapExitSettledRef: bridgeStateRuntime.markSearchSheetCloseMapExitSettledRef,
    routeSceneVisibilityPolicyRuntime,
  });
};
