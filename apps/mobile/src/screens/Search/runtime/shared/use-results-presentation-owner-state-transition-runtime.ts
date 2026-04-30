import type React from 'react';

import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerCloseStateRuntime } from './use-results-presentation-owner-close-state-runtime';
import { useResultsPresentationOwnerSheetExecutionStateRuntime } from './use-results-presentation-owner-sheet-execution-state-runtime';
import type { ResultsPresentationOwnerStateSessionRuntime } from './use-results-presentation-owner-state-session-runtime';

export type ResultsPresentationOwnerStateTransitionRuntime = {
  closeTransitionRuntime: ReturnType<typeof useResultsPresentationOwnerCloseStateRuntime>;
  resultsSheetExecutionModel: ReturnType<
    typeof useResultsPresentationOwnerSheetExecutionStateRuntime
  >;
};

export const useResultsPresentationOwnerStateTransitionRuntime = <Suggestion>({
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
  resultsSheetRuntime,
  sessionRuntime,
  routeSceneVisibilityPolicyRuntime,
}: {
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
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  >;
  sessionRuntime: ResultsPresentationOwnerStateSessionRuntime;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
}): ResultsPresentationOwnerStateTransitionRuntime => {
  const closeTransitionRuntime = useResultsPresentationOwnerCloseStateRuntime({
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

  const resultsSheetExecutionModel = useResultsPresentationOwnerSheetExecutionStateRuntime({
    resultsSheetRuntime,
  });

  return {
    closeTransitionRuntime,
    resultsSheetExecutionModel,
  };
};
