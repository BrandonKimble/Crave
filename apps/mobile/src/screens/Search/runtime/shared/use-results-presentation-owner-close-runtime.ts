import type React from 'react';

import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationCloseTransitionBridgeRuntime } from './use-results-presentation-close-transition-bridge-runtime';
import { useResultsPresentationCloseTransitionRuntime } from './use-results-presentation-close-transition-runtime';
import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';

type UseResultsPresentationOwnerCloseRuntimeArgs<Suggestion> = {
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
  shellLocalState: Parameters<
    typeof useResultsPresentationCloseTransitionRuntime
  >[0]['shellLocalState'];
  resultsRuntimeOwner: Pick<ResultsPresentationRuntimeOwner, 'cancelToggleInteraction'>;
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export const useResultsPresentationOwnerCloseRuntime = <Suggestion>({
  markSearchSheetCloseMapExitSettledRef,
  ...args
}: UseResultsPresentationOwnerCloseRuntimeArgs<Suggestion>) => {
  const closeTransitionRuntime = useResultsPresentationCloseTransitionRuntime(args);

  useResultsPresentationCloseTransitionBridgeRuntime({
    markSearchSheetCloseMapExitSettledRef,
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
  });

  return closeTransitionRuntime;
};
