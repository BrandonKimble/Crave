import React from 'react';

import { createResultsPresentationCloseTransitionRuntimeValue } from '../controller/results-presentation-close-transition-runtime';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationCloseSearchCleanupRuntime } from './use-results-presentation-close-search-cleanup-runtime';
import { useResultsPresentationCloseTransitionStateRuntime } from './use-results-presentation-close-transition-state-runtime';

type UseResultsPresentationCloseTransitionRuntimeArgs<Suggestion> = {
  searchRuntimeBus: SearchRuntimeBus;
  clearSearchState: SearchClearOwner['clearSearchState'];
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
  shellLocalState: ResultsPresentationShellLocalState;
  resultsRuntimeOwner: Pick<ResultsPresentationRuntimeOwner, 'cancelToggleInteraction'>;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationCloseTransitionRuntime = ReturnType<
  typeof createResultsPresentationCloseTransitionRuntimeValue
>;

export const useResultsPresentationCloseTransitionRuntime = <Suggestion>({
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
  shellLocalState,
  resultsRuntimeOwner,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationCloseTransitionRuntimeArgs<Suggestion>): ResultsPresentationCloseTransitionRuntime => {
  const closeTransitionStateRuntime = useResultsPresentationCloseTransitionStateRuntime({
    clearSearchState,
    shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });

  const closeSearchCleanupRuntime = useResultsPresentationCloseSearchCleanupRuntime({
    searchRuntimeBus,
    cancelActiveSearchRequest,
    cancelAutocomplete,
    handleCancelPendingMutationWork,
    resetSubmitTransitionHold,
    resultsRuntimeOwner,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    setQuery,
    setError,
    setSuggestions,
    inputRef,
    setPendingCloseIntentId: closeTransitionStateRuntime.setPendingCloseIntentId,
    matchesPendingCloseIntentId: closeTransitionStateRuntime.matchesPendingCloseIntentId,
  });

  return React.useMemo(
    () =>
      createResultsPresentationCloseTransitionRuntimeValue({
        closeTransitionActions: closeTransitionStateRuntime.closeTransitionActions,
        beginCloseTransition: closeTransitionStateRuntime.beginCloseTransition,
        scheduleCloseSearchCleanup: closeSearchCleanupRuntime.scheduleCloseSearchCleanup,
        cancelCloseSearchCleanup: closeSearchCleanupRuntime.cancelCloseSearchCleanup,
        setPendingCloseIntentId: closeTransitionStateRuntime.setPendingCloseIntentId,
        matchesPendingCloseIntentId: closeTransitionStateRuntime.matchesPendingCloseIntentId,
      }),
    [
      closeSearchCleanupRuntime.cancelCloseSearchCleanup,
      closeSearchCleanupRuntime.scheduleCloseSearchCleanup,
      closeTransitionStateRuntime.beginCloseTransition,
      closeTransitionStateRuntime.closeTransitionActions,
      closeTransitionStateRuntime.matchesPendingCloseIntentId,
      closeTransitionStateRuntime.setPendingCloseIntentId,
    ]
  );
};
