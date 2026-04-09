import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type SearchRuntimeBus } from './search-runtime-bus';
import { type ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import { type ResultsPresentationOwner } from './results-presentation-owner-contract';
import {
  createPreparedResultsEnterSnapshot,
  createPreparedResultsExitSnapshot,
  resolvePreparedResultsEnterCoverState,
} from './prepared-presentation-transaction';
import { useResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import { useResultsPresentationShellModelRuntime } from './use-results-presentation-shell-model-runtime';
import { resolvePreparedResultsEnterMutationKind } from './results-presentation-shell-prepared-intent';
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
import { useResultsPresentationOwnerCloseSearchCleanupRuntime } from './use-results-presentation-owner-close-search-cleanup-runtime';
import { useResultsPresentationOwnerCloseTransitionActionsRuntime } from './use-results-presentation-owner-close-transition-actions-runtime';
import { useResultsPresentationOwnerCloseTransitionLifecycleRuntime } from './use-results-presentation-owner-close-transition-lifecycle-runtime';
import { useResultsPresentationRuntimeMachineOwner } from './use-results-presentation-runtime-machine-owner';
import { useResultsPresentationToggleRuntime } from './use-results-presentation-toggle-runtime';
import { useResultsPreparedEnterSnapshotExecutionRuntime } from './use-results-prepared-enter-snapshot-execution-runtime';
import { useResultsPreparedExitSnapshotExecutionRuntime } from './use-results-prepared-exit-snapshot-execution-runtime';
import { useResultsPreparedSnapshotShellApplicationRuntime } from './use-results-prepared-snapshot-shell-application-runtime';

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

  const preparedResultsExitTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsExitTransactionId = React.useCallback((): string => {
    preparedResultsExitTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsExitTransactionSeqRef.current}`;
  }, []);

  const executePreparedExitSnapshot = useResultsPreparedExitSnapshotExecutionRuntime({
    resultsRuntimeOwner,
    animateSheetTo: resultsSheetRuntime.animateSheetTo,
    setDisplayQueryOverride: shellLocalState.setDisplayQueryOverride,
    beginCloseTransition,
  });

  const requestClosePresentationIntent = React.useCallback(
    () =>
      executePreparedExitSnapshot(
        createPreparedResultsExitSnapshot(nextPreparedResultsExitTransactionId())
      ),
    [executePreparedExitSnapshot, nextPreparedResultsExitTransactionId]
  );

  const { scheduleCloseSearchCleanup, cancelCloseSearchCleanup } =
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
      resultsRuntimeOwner,
      setPendingCloseIntentId,
      matchesPendingCloseIntentId,
    });

  const cancelCloseSearch = React.useCallback(
    (intentId?: string) => {
      if (intentId != null && !matchesPendingCloseIntentId(intentId)) {
        return;
      }
      setPendingCloseIntentId(null);
      cancelCloseSearchCleanup();
      isClearingSearchRef.current = false;
      resultsRuntimeOwner.clearStagedPreparedResultsSnapshot(intentId);
      cancelSearchSheetCloseTransition(intentId);
      resultsRuntimeOwner.cancelPresentationIntent(intentId);
    },
    [
      cancelCloseSearchCleanup,
      cancelSearchSheetCloseTransition,
      isClearingSearchRef,
      matchesPendingCloseIntentId,
      resultsRuntimeOwner,
      setPendingCloseIntentId,
    ]
  );

  const beginCloseSearch = React.useCallback(() => {
    const hasSearchToClose = isSearchSessionActive || hasResults || submittedQuery.length > 0;
    if (!hasSearchToClose) {
      clearTypedQuery();
      return;
    }

    ignoreNextSearchBlurRef.current = true;
    resultsRuntimeOwner.clearStagedPreparedResultsSnapshot();
    const closeIntentId = requestClosePresentationIntent() ?? '';
    isClearingSearchRef.current = true;
    handleCloseResultsUiReset();
    scheduleCloseSearchCleanup(closeIntentId);
  }, [
    clearTypedQuery,
    handleCloseResultsUiReset,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    isSearchSessionActive,
    requestClosePresentationIntent,
    resultsRuntimeOwner,
    scheduleCloseSearchCleanup,
    submittedQuery.length,
  ]);

  const handleCloseResults = React.useCallback(() => {
    beginCloseSearch();
  }, [beginCloseSearch]);

  const requestResultsSheetSnap = React.useCallback(
    (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden', requestToken: number | null) => {
      resultsSheetRuntime.resultsSheetRuntimeModel.snapController.requestSnap(
        snap,
        undefined,
        requestToken
      );
    },
    [resultsSheetRuntime]
  );

  const hideResultsSheet = React.useCallback(
    (requestToken: number | null) => {
      if (!resultsSheetRuntime.shouldRenderResultsSheetRef.current) {
        resultsSheetRuntime.resetResultsSheetToHidden();
        return;
      }
      resultsSheetRuntime.resultsSheetRuntimeModel.snapController.requestSnap(
        'hidden',
        undefined,
        requestToken
      );
    },
    [resultsSheetRuntime]
  );

  const resultsSheetExecutionModel = React.useMemo(
    () => ({
      requestResultsSheetSnap,
      hideResultsSheet,
    }),
    [hideResultsSheet, requestResultsSheetSnap]
  );

  const preparedResultsTransactionSeqRef = React.useRef(0);
  const nextPreparedResultsTransactionId = React.useCallback((): string => {
    preparedResultsTransactionSeqRef.current += 1;
    return `prepared-results-transaction:${preparedResultsTransactionSeqRef.current}`;
  }, []);

  const requestEditingPresentationIntent = React.useCallback(
    (intent: Extract<SearchPresentationIntent, { kind: 'focus_editing' | 'exit_editing' }>) => {
      shellLocalState.setInputMode(intent.kind === 'focus_editing' ? 'editing' : 'idle');
      return null;
    },
    [shellLocalState]
  );

  const applyPreparedSnapshotShell = useResultsPreparedSnapshotShellApplicationRuntime({
    cancelSearchSheetCloseTransition,
    setBackdropTarget: shellLocalState.setBackdropTarget,
    setInputMode: shellLocalState.setInputMode,
  });

  const executePreparedEnterSnapshot = useResultsPreparedEnterSnapshotExecutionRuntime({
    resultsRuntimeOwner,
    animateSheetTo: resultsSheetRuntime.animateSheetTo,
    prepareShortcutSheetTransition: resultsSheetRuntime.prepareShortcutSheetTransition,
    setDisplayQueryOverride: shellLocalState.setDisplayQueryOverride,
  });

  const requestEnterPresentationIntent = React.useCallback(
    (
      intent: Exclude<
        SearchPresentationIntent,
        { kind: 'focus_editing' | 'exit_editing' | 'close' }
      >
    ) => {
      const shouldPrepareShortcutSheetTransition =
        intent.preserveSheetState !== true && intent.transitionFromDockedPolls === true;
      const preserveSheetState = intent.preserveSheetState === true;
      const snapshot = createPreparedResultsEnterSnapshot(
        intent.transactionId ?? nextPreparedResultsTransactionId(),
        resolvePreparedResultsEnterMutationKind(intent.kind),
        resolvePreparedResultsEnterCoverState(preserveSheetState)
      );

      applyPreparedSnapshotShell(snapshot);
      return executePreparedEnterSnapshot({
        snapshot,
        displayQueryOverride: intent.query,
        preserveSheetState,
        shouldPrepareShortcutSheetTransition,
      });
    },
    [applyPreparedSnapshotShell, executePreparedEnterSnapshot, nextPreparedResultsTransactionId]
  );

  const requestSearchPresentationIntent = React.useCallback(
    (intent: SearchPresentationIntent) => {
      switch (intent.kind) {
        case 'focus_editing':
        case 'exit_editing':
          return requestEditingPresentationIntent(intent);
        case 'close':
          return requestClosePresentationIntent();
        default:
          return requestEnterPresentationIntent(intent);
      }
    },
    [
      requestClosePresentationIntent,
      requestEditingPresentationIntent,
      requestEnterPresentationIntent,
    ]
  );

  const activeTabRef = React.useRef(activeTab);
  const isSearchSessionActiveRef = React.useRef(isSearchSessionActive);
  activeTabRef.current = activeTab;
  isSearchSessionActiveRef.current = isSearchSessionActive;

  const commitTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      if (activeTabRef.current === next) {
        searchRuntimeBus.publish({
          pendingTabSwitchTab: null,
        });
        setActiveTabPreference(next);
        return;
      }
      setActiveTab(next);
      searchRuntimeBus.publish({
        activeTab: next,
        pendingTabSwitchTab: null,
      });
      setActiveTabPreference(next);
    },
    [searchRuntimeBus, setActiveTab, setActiveTabPreference]
  );

  const scheduleTabToggleCommit = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      if (!isSearchSessionActiveRef.current) {
        commitTabChange(next);
        return;
      }
      searchRuntimeBus.publish({
        pendingTabSwitchTab: next,
      });
      resultsRuntimeOwner.scheduleToggleCommit(
        ({ intentId }) => {
          const shouldSwitchTab = activeTabRef.current !== next;
          if (shouldSwitchTab) {
            commitTabChange(next);
          } else {
            searchRuntimeBus.publish({
              pendingTabSwitchTab: null,
            });
          }
          const shouldAwaitVisualSync = shouldSwitchTab && isSearchSessionActiveRef.current;
          if (!shouldAwaitVisualSync) {
            return {
              awaitVisualSync: false,
            };
          }
          resultsRuntimeOwner.clearStagedPreparedResultsSnapshot();
          resultsRuntimeOwner.commitPreparedResultsSnapshot(
            createPreparedResultsEnterSnapshot(intentId, 'initial_search', 'interaction_loading')
          );
          return {
            awaitVisualSync: true,
          };
        },
        { kind: 'tab_switch' }
      );
    },
    [commitTabChange, resultsRuntimeOwner, searchRuntimeBus]
  );

  const interactionModel = React.useMemo(
    () => ({
      scheduleTabToggleCommit,
      notifyToggleInteractionFrostReady: resultsRuntimeOwner.notifyFrostReady,
    }),
    [resultsRuntimeOwner.notifyFrostReady, scheduleTabToggleCommit]
  );

  const presentationActions = React.useMemo(
    () => ({
      requestSearchPresentationIntent,
      beginCloseSearch,
      handleCloseResults,
      cancelCloseSearch,
    }),
    [beginCloseSearch, cancelCloseSearch, handleCloseResults, requestSearchPresentationIntent]
  );

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
