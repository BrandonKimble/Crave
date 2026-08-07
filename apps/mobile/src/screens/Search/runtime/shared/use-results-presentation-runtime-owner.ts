import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import { type SearchRuntimeBus } from './search-runtime-bus';
import { type ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import { useResultsPresentationOwnerBridgeRuntime } from './use-results-presentation-owner-bridge-runtime';
import { useResultsPresentationShellRuntime } from './use-results-presentation-shell-runtime';
import { publishResultsPresentationCloseTransitionBridgeRuntime } from './publish-results-presentation-close-transition-bridge-runtime';
import { useResultsPresentationCloseTransitionStateRuntime } from './use-results-presentation-close-transition-state-runtime';
import { useResultsPresentationOwnerPresentationActionsRuntime } from './use-results-presentation-owner-presentation-actions-runtime';
import { createResultsPresentationOwnerValue } from '../controller/results-presentation-owner-runtime';
export type {
  ResultsInteractionModel,
  ResultsPresentationOwner,
} from './results-presentation-owner-contract';
export type {
  MarkerEnterSettledPayload,
  ResultsPresentationRuntimeOwner,
} from './results-presentation-runtime-owner-contract';
export type {
  SearchHeaderVisualModel,
  SearchResultsShellModel,
} from './results-presentation-shell-contract';

export type UseResultsPresentationOwnerArgs = {
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
    AppRouteSharedSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'prepareSharedSheetForSearchPresentation'
    | 'sharedSheetRuntimeModel'
    | 'shouldRenderMountedSharedSheetRef'
    | 'markSharedSheetHidden'
    | 'sheetState'
  >;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
};

export const useResultsPresentationOwner = ({
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
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  routeSceneVisibilityPolicyRuntime,
  onSearchSheetContentLaneChanged,
}: UseResultsPresentationOwnerArgs): ResultsPresentationOwner => {
  // F5300: the three-file `*-owner-state-session-runtime` / `*-owner-bridge-state-runtime` /
  // `*-owner-shell-state-runtime` layer between here and these two hooks transformed nothing —
  // it forwarded 20 arguments unchanged and re-declared their types a fourth time. A hook that
  // neither subscribes nor memoizes buys no render isolation (D70), so it is inlined here.
  const bridgeStateRuntime = useResultsPresentationOwnerBridgeRuntime({
    setActiveTab,
    setActiveTabPreference,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
  });

  const shellStateRuntime = useResultsPresentationShellRuntime({
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    isSearchLoading,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    searchRuntimeBus,
    resultsPresentationAuthority,
    onSearchSheetContentLaneChanged,
    resultsSheetRuntime,
  });

  // S-C.5 item 2 (wrapper collapse): the pure re-lister owner-close-state-runtime is
  // deleted — its only move was picking these two fields off the session runtimes.
  // Leg 4: the dead close-search-cleanup runtime's arg fan (bus, request/autocomplete
  // cancels, input setters, inputRef) is gone with it — the close chain needs exactly
  // these three inputs.
  const closeTransitionRuntime = useResultsPresentationCloseTransitionStateRuntime({
    clearSearchState,
    shellLocalState: shellStateRuntime.shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });

  publishResultsPresentationCloseTransitionBridgeRuntime({
    markSearchSheetCloseMapExitSettledRef: bridgeStateRuntime.markSearchSheetCloseMapExitSettledRef,
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
  });

  const { resultsRuntimeOwner, interactionModel } = bridgeStateRuntime;
  const { shellLocalState, shellModel } = shellStateRuntime;

  const presentationActions = useResultsPresentationOwnerPresentationActionsRuntime({
    clearTypedQuery,
    clearSearchState,
    submittedQuery,
    isSearchSessionActive,
    hasResults,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    resultsSheetRuntime,
    shellLocalState,
    resultsRuntimeOwner,
    resultsPresentationAuthority,
    setPendingCloseIntentId: closeTransitionRuntime.setPendingCloseIntentId,
    matchesPendingCloseIntentId: closeTransitionRuntime.matchesPendingCloseIntentId,
    beginCloseTransition: closeTransitionRuntime.beginCloseTransition,
    cancelSearchSheetCloseTransition:
      closeTransitionRuntime.closeTransitionActions.cancelSearchSheetCloseTransition,
    routeSceneVisibilityPolicyRuntime,
  });

  // F4802: this used to go through `useResultsPresentationOwnerValueRuntime`, a use-*
  // wrapper whose entire body was a `React.useMemo` around this call — with the rest
  // element `...resultsRuntimeOwner` in its dep array. A rest element allocates a fresh
  // object on every call, so the dep could never be stable and the memo recomputed
  // unconditionally: a memo that cannot hit, returning a new identity every render. With
  // the memo gone the wrapper called no hook at all (search-runtime-hook-names would have
  // failed it), so it is deleted rather than renamed — one of F1610's five re-lists of
  // the same 20 field names goes with it.
  return createResultsPresentationOwnerValue({
    searchSurfaceResultsTransactionKey: resultsRuntimeOwner.searchSurfaceResultsTransactionKey,
    pendingTogglePresentationIntentId: resultsRuntimeOwner.pendingTogglePresentationIntentId,
    scheduleToggleCommit: resultsRuntimeOwner.scheduleToggleCommit,
    cancelToggleInteraction: resultsRuntimeOwner.cancelToggleInteraction,
    beginSearchThisAreaPresentationPending:
      resultsRuntimeOwner.beginSearchThisAreaPresentationPending,
    beginVariantRerunPresentationPending: resultsRuntimeOwner.beginVariantRerunPresentationPending,
    stageSearchSurfaceResultsTransaction: resultsRuntimeOwner.stageSearchSurfaceResultsTransaction,
    clearStagedSearchSurfaceResultsTransaction:
      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction,
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
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
    interactionModel,
  });
};
