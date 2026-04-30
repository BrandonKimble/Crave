import type React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import { useResultsPresentationOwnerPresentationActionsRuntime } from './use-results-presentation-owner-presentation-actions-runtime';
import { useResultsPresentationOwnerValueRuntime } from './use-results-presentation-owner-value-runtime';
import type { ResultsPresentationOwnerStateRuntime } from './use-results-presentation-owner-state-runtime';

type UseResultsPresentationOwnerPublicationRuntimeArgs = {
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  submittedQuery: string;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  handleCloseResultsUiReset: () => void;
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
    | 'sheetState'
    | 'snapPoints'
  >;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  ownerStateRuntime: ResultsPresentationOwnerStateRuntime;
};

export const useResultsPresentationOwnerPublicationRuntime = ({
  clearTypedQuery,
  submittedQuery,
  isSearchSessionActive,
  hasResults,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  handleCloseResultsUiReset,
  resultsSheetRuntime,
  routeSceneVisibilityPolicyRuntime,
  ownerStateRuntime,
}: UseResultsPresentationOwnerPublicationRuntimeArgs): ResultsPresentationOwner => {
  const {
    bridgeStateRuntime,
    shellStateRuntime,
    closeTransitionRuntime,
    resultsSheetExecutionModel,
  } = ownerStateRuntime;
  const { resultsRuntimeOwner, interactionModel } = bridgeStateRuntime;
  const { shellLocalState, shellModel } = shellStateRuntime;

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
    scheduleCloseSearchCleanup: closeTransitionRuntime.scheduleCloseSearchCleanup,
    cancelCloseSearchCleanup: closeTransitionRuntime.cancelCloseSearchCleanup,
    setPendingCloseIntentId: closeTransitionRuntime.setPendingCloseIntentId,
    matchesPendingCloseIntentId: closeTransitionRuntime.matchesPendingCloseIntentId,
    beginCloseTransition: closeTransitionRuntime.beginCloseTransition,
    markSearchSheetCloseSheetSettled:
      closeTransitionRuntime.closeTransitionActions.markSearchSheetCloseSheetSettled,
    cancelSearchSheetCloseTransition:
      closeTransitionRuntime.closeTransitionActions.cancelSearchSheetCloseTransition,
    routeSceneVisibilityPolicyRuntime,
  });

  return useResultsPresentationOwnerValueRuntime({
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
    closeTransitionActions: closeTransitionRuntime.closeTransitionActions,
    interactionModel,
    resultsSheetExecutionModel,
  });
};
