import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type SearchRuntimeBus } from './search-runtime-bus';
import { type ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import { type ResultsPresentationOwner } from './results-presentation-owner-contract';
import { useResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationShellModelRuntime } from './use-results-presentation-shell-model-runtime';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
export type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
export type {
  ResultsInteractionModel,
  ResultsPresentationOwner,
  ResultsSheetExecutionModel,
} from './results-presentation-owner-contract';
export type {
  MarkerEnterSettledPayload,
  ResultsPresentationRuntimeOwner,
} from './results-presentation-runtime-owner-contract';
export type {
  SearchHeaderVisualModel,
  SearchResultsShellModel,
} from './results-presentation-shell-contract';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { useResultsPresentationOwnerCloseTransitionActionsRuntime } from './use-results-presentation-owner-close-transition-actions-runtime';
import { useResultsPresentationOwnerCloseSearchCleanupRuntime } from './use-results-presentation-owner-close-search-cleanup-runtime';
import { useResultsPresentationOwnerCloseTransitionLifecycleRuntime } from './use-results-presentation-owner-close-transition-lifecycle-runtime';
import { useResultsPresentationOwnerInteractionModelRuntime } from './use-results-presentation-owner-interaction-model-runtime';
import { useResultsPresentationOwnerPresentationActionsRuntime } from './use-results-presentation-owner-presentation-actions-runtime';
import { useResultsPresentationOwnerSheetExecutionModelRuntime } from './use-results-presentation-owner-sheet-execution-model-runtime';
import { useResultsPresentationRuntimeMachineOwner } from './use-results-presentation-runtime-machine-owner';
import { useResultsPresentationToggleRuntime } from './use-results-presentation-toggle-runtime';

export type UseResultsPresentationOwnerArgs<Suggestion> = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  clearSearchState: SearchClearOwner['clearSearchState'];
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<
    ResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  >;
  armSearchCloseRestore: (options?: ArmSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  handleCloseResultsUiReset: () => void;
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
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
};

export const useResultsPresentationOwner = <Suggestion>({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  clearTypedQuery,
  clearSearchState,
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  hasResults,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  resultsSheetRuntime,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  handleCloseResultsUiReset,
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
  searchRuntimeBus,
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
}: UseResultsPresentationOwnerArgs<Suggestion>): ResultsPresentationOwner => {
  const markSearchSheetCloseMapExitSettledRef = React.useRef<(requestKey: string) => void>(
    () => {}
  );
  const setMarkSearchSheetCloseMapExitSettled = React.useCallback(
    (handler: (requestKey: string) => void) => {
      markSearchSheetCloseMapExitSettledRef.current = handler;
    },
    []
  );
  const notifyIntentCompleteRef = React.useRef<((intentId: string) => void) | null>(null);

  const { handleToggleInteractionLifecycle, ...resultsRuntimeMachineOwner } =
    useResultsPresentationRuntimeMachineOwner({
      searchRuntimeBus,
      log,
      runOneHandoffCoordinatorRef,
      emitRuntimeMechanismEvent,
      markSearchSheetCloseMapExitSettledRef,
      notifyIntentCompleteRef,
    });

  const resultsToggleRuntime = useResultsPresentationToggleRuntime({
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
  });

  const resultsRuntimeOwner = React.useMemo(
    () => ({
      ...resultsRuntimeMachineOwner,
      ...resultsToggleRuntime,
    }),
    [resultsRuntimeMachineOwner, resultsToggleRuntime]
  );

  const shellLocalState = useResultsPresentationShellLocalState({
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    isSearchLoading,
    isSuggestionPanelActive,
  });

  const shellModel = useResultsPresentationShellModelRuntime({
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    sheetY: resultsSheetRuntime.sheetTranslateY,
    resultsSnapY: resultsSheetRuntime.snapPoints.middle,
    collapsedY: resultsSheetRuntime.snapPoints.collapsed,
    backdropTarget: shellLocalState.backdropTarget,
    inputMode: shellLocalState.inputMode,
    displayQueryOverride: shellLocalState.displayQueryOverride,
    searchCloseTransitionState: shellLocalState.searchCloseTransitionState,
    holdPersistentPollLane: shellLocalState.holdPersistentPollLane,
  });

  const {
    setPendingCloseIntentId,
    matchesPendingCloseIntentId,
    beginCloseTransition,
    cancelSearchSheetCloseTransition,
    getActiveCloseIntentId,
    commitArmedSearchCloseRestore,
    finalizeCloseTransition,
  } = useResultsPresentationOwnerCloseTransitionLifecycleRuntime({
    clearSearchState,
    armSearchCloseRestore,
    commitSearchCloseRestore,
    cancelSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
    shellLocalState,
  });

  const closeTransitionActions = useResultsPresentationOwnerCloseTransitionActionsRuntime({
    shellLocalState,
    cancelSearchSheetCloseTransition,
    getActiveCloseIntentId,
    commitArmedSearchCloseRestore,
    finalizeCloseTransition,
  });
  const resultsSheetExecutionModel = useResultsPresentationOwnerSheetExecutionModelRuntime({
    resultsSheetRuntime,
  });
  const interactionModel = useResultsPresentationOwnerInteractionModelRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    resultsRuntimeOwner,
  });
  const { cancelCloseSearchCleanup, scheduleCloseSearchCleanup } =
    useResultsPresentationOwnerCloseSearchCleanupRuntime({
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
      setPendingCloseIntentId,
      matchesPendingCloseIntentId,
      resultsRuntimeOwner,
    });

  const presentationActions = useResultsPresentationOwnerPresentationActionsRuntime({
    clearTypedQuery,
    submittedQuery,
    isSearchSessionActive,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    handleCloseResultsUiReset,
    resultsSheetRuntime,
    shellLocalState,
    resultsRuntimeOwner,
    scheduleCloseSearchCleanup,
    cancelCloseSearchCleanup,
    setPendingCloseIntentId,
    matchesPendingCloseIntentId,
    beginCloseTransition,
    cancelSearchSheetCloseTransition,
  });

  React.useEffect(() => {
    setMarkSearchSheetCloseMapExitSettled(
      closeTransitionActions.markSearchSheetCloseMapExitSettled
    );
  }, [
    closeTransitionActions.markSearchSheetCloseMapExitSettled,
    setMarkSearchSheetCloseMapExitSettled,
  ]);

  return React.useMemo(
    () => ({
      preparedResultsSnapshotKey: resultsRuntimeOwner.preparedResultsSnapshotKey,
      pendingTogglePresentationIntentId: resultsRuntimeOwner.pendingTogglePresentationIntentId,
      scheduleToggleCommit: resultsRuntimeOwner.scheduleToggleCommit,
      cancelToggleInteraction: resultsRuntimeOwner.cancelToggleInteraction,
      handlePageOneResultsCommitted: resultsRuntimeOwner.handlePageOneResultsCommitted,
      cancelPresentationIntent: resultsRuntimeOwner.cancelPresentationIntent,
      handlePresentationIntentAbort: resultsRuntimeOwner.handlePresentationIntentAbort,
      handleExecutionBatchMountedHidden: resultsRuntimeOwner.handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted: resultsRuntimeOwner.handleMarkerEnterStarted,
      handleMarkerEnterSettled: resultsRuntimeOwner.handleMarkerEnterSettled,
      handleMarkerExitStarted: resultsRuntimeOwner.handleMarkerExitStarted,
      handleMarkerExitSettled: resultsRuntimeOwner.handleMarkerExitSettled,
      shellModel,
      presentationActions,
      closeTransitionActions,
      interactionModel,
      resultsSheetExecutionModel,
    }),
    [
      closeTransitionActions,
      interactionModel,
      presentationActions,
      resultsRuntimeOwner,
      resultsSheetExecutionModel,
      shellModel,
    ]
  );
};
