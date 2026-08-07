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
import { useResultsPresentationOwnerStateSessionRuntime } from './use-results-presentation-owner-state-session-runtime';
import { publishResultsPresentationCloseTransitionBridgeRuntime } from './publish-results-presentation-close-transition-bridge-runtime';
import { useResultsPresentationCloseTransitionRuntime } from './use-results-presentation-close-transition-runtime';
import { useResultsPresentationOwnerPresentationActionsRuntime } from './use-results-presentation-owner-presentation-actions-runtime';
import { useResultsPresentationOwnerValueRuntime } from './use-results-presentation-owner-value-runtime';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
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
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
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
  routeSceneSwitchAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  routeSceneVisibilityPolicyRuntime,
  onSearchSheetContentLaneChanged,
}: UseResultsPresentationOwnerArgs): ResultsPresentationOwner => {
  const sessionRuntime = useResultsPresentationOwnerStateSessionRuntime({
    setActiveTab,
    setActiveTabPreference,
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    isSearchLoading,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    resultsSheetRuntime,
    searchRuntimeBus,
    resultsPresentationAuthority,
    routeSceneSwitchAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
    onSearchSheetContentLaneChanged,
  });

  // S-C.5 item 2 (wrapper collapse): the pure re-lister owner-close-state-runtime is
  // deleted — its only move was picking these two fields off the session runtimes.
  // Leg 4: the dead close-search-cleanup runtime's arg fan (bus, request/autocomplete
  // cancels, input setters, inputRef) is gone with it — the close chain needs exactly
  // these three inputs.
  const closeTransitionRuntime = useResultsPresentationCloseTransitionRuntime({
    clearSearchState,
    shellLocalState: sessionRuntime.shellStateRuntime.shellLocalState,
    routeSceneVisibilityPolicyRuntime,
  });

  publishResultsPresentationCloseTransitionBridgeRuntime({
    markSearchSheetCloseMapExitSettledRef:
      sessionRuntime.bridgeStateRuntime.markSearchSheetCloseMapExitSettledRef,
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
  });

  const { bridgeStateRuntime, shellStateRuntime } = sessionRuntime;
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

  return useResultsPresentationOwnerValueRuntime({
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
