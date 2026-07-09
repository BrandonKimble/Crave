import type React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerPresentationActionsRuntime } from './use-results-presentation-owner-presentation-actions-runtime';
import { useResultsPresentationOwnerValueRuntime } from './use-results-presentation-owner-value-runtime';
import type { ResultsPresentationOwnerStateRuntime } from './use-results-presentation-owner-state-runtime';

type UseResultsPresentationOwnerPublicationRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  clearSearchState: SearchClearOwner['clearSearchState'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  prepareRestaurantProfileForTerminalSearchDismissRef: React.MutableRefObject<() => void>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<
    AppRouteSharedSheetRuntimeOwner,
    | 'prepareSharedSheetForSearchPresentation'
    | 'sharedSheetRuntimeModel'
    | 'shouldRenderMountedSharedSheetRef'
    | 'markSharedSheetHidden'
    | 'sheetState'
    | 'snapPoints'
  >;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  ownerStateRuntime: ResultsPresentationOwnerStateRuntime;
};

export const useResultsPresentationOwnerPublicationRuntime = ({
  clearTypedQuery,
  clearSearchState,
  submittedQuery,
  isSearchSessionActive,
  hasResults,
  profilePresentationActiveRef,
  prepareRestaurantProfileForTerminalSearchDismissRef,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  resultsSheetRuntime,
  routeSceneVisibilityPolicyRuntime,
  resultsPresentationAuthority,
  ownerStateRuntime,
}: UseResultsPresentationOwnerPublicationRuntimeArgs): ResultsPresentationOwner => {
  const { bridgeStateRuntime, shellStateRuntime, closeTransitionRuntime } = ownerStateRuntime;
  const { resultsRuntimeOwner, interactionModel } = bridgeStateRuntime;
  const { shellLocalState, shellModel } = shellStateRuntime;

  const presentationActions = useResultsPresentationOwnerPresentationActionsRuntime({
    clearTypedQuery,
    clearSearchState,
    submittedQuery,
    isSearchSessionActive,
    hasResults,
    profilePresentationActiveRef,
    prepareRestaurantProfileForTerminalSearchDismissRef,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    resultsSheetRuntime,
    shellLocalState,
    resultsRuntimeOwner,
    resultsPresentationAuthority,
    cancelCloseSearchCleanup: closeTransitionRuntime.cancelCloseSearchCleanup,
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
