import React from 'react';

import type { SearchRootPresentationStateRuntime } from './search-root-action-runtime-contract';
import { useSearchResultsSheetInteractionRuntime } from './use-search-results-sheet-interaction-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import { useSearchRuntimePublicationRuntime } from './use-search-runtime-publication-runtime';
import type { SearchRootSessionActionOwnerRuntime } from './use-search-root-session-action-owner-runtime';

type UseSearchRootResultsPublicationOwnerRuntimeArgs = {
  sessionActionOwnerRuntime: Pick<
    SearchRootSessionActionOwnerRuntime,
    'sessionActionRuntime' | 'closeTransitionActions' | 'preparedResultsSnapshotKey'
  >;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  resetResultsListScrollProgressRef: Parameters<
    typeof useSearchResultsSheetInteractionRuntime
  >[0]['resetResultsListScrollProgressRef'];
};

export type SearchRootResultsPublicationOwnerRuntime = {
  resultsSheetInteractionModel: ReturnType<typeof useSearchResultsSheetInteractionRuntime>;
  presentationState: SearchRootPresentationStateRuntime;
};

export const useSearchRootResultsPublicationOwnerRuntime = ({
  sessionActionOwnerRuntime,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  resetResultsListScrollProgressRef,
}: UseSearchRootResultsPublicationOwnerRuntimeArgs): SearchRootResultsPublicationOwnerRuntime => {
  const { sessionActionRuntime, closeTransitionActions, preparedResultsSnapshotKey } =
    sessionActionOwnerRuntime;

  const resultsSheetInteractionModel = useSearchResultsSheetInteractionRuntime({
    loadMoreArgs: {
      searchMode: rootSessionRuntime.runtimeFlags.searchMode,
      isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
      isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
      canLoadMore: rootSessionRuntime.resultsArrivalState.canLoadMore,
      currentPage: rootSessionRuntime.resultsArrivalState.currentPage,
      shouldLogSearchStateChanges:
        rootScaffoldRuntime.instrumentationRuntime.shouldLogSearchStateChanges,
      loadMoreResults: sessionActionRuntime.submitRuntimeResult.loadMoreResults,
    },
    interactionStateArgs: {
      anySheetDraggingRef: rootSessionRuntime.primitives.anySheetDraggingRef,
      searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
      mapMotionPressureController:
        rootScaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController,
      cancelPendingMapMovementUpdates:
        rootScaffoldRuntime.resultsSheetRuntimeLane.cancelPendingMapMovementUpdates,
      flushDeferredMapMovementState:
        rootScaffoldRuntime.resultsSheetRuntimeLane.flushDeferredMapMovementState,
      resultsMomentum: rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsMomentum,
    },
    snapArgs: {
      handleSheetSnapChange: rootScaffoldRuntime.resultsSheetRuntimeOwner.handleSheetSnapChange,
      markSearchSheetCloseSheetSettled: closeTransitionActions.markSearchSheetCloseSheetSettled,
    },
    resetResultsListScrollProgressRef,
  });

  const presentationState = React.useMemo<SearchRootPresentationStateRuntime>(() => {
    const isSuggestionPanelActive = rootPrimitivesRuntime.searchState.isSuggestionPanelActive;
    const shouldSuspendResultsSheet =
      sessionActionRuntime.profileOwner.profileViewState.presentation.isOverlayVisible;
    const shouldFreezeRestaurantPanelContent =
      sessionActionRuntime.profileOwner.profileViewState.presentation.isTransitionAnimating;
    const shouldDimResultsSheet =
      (isSuggestionPanelActive || rootSuggestionRuntime.isSuggestionPanelVisible) &&
      (rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible ||
        rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState !== 'hidden');
    const shouldDisableResultsSheetInteraction =
      shouldSuspendResultsSheet ||
      (isSuggestionPanelActive &&
        (rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible ||
          rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState !== 'hidden'));
    const shouldSuppressRestaurantOverlay =
      sessionActionRuntime.profileOwner.profileViewState.presentation.isOverlayVisible &&
      isSuggestionPanelActive;

    return {
      shouldSuspendResultsSheet,
      shouldFreezeRestaurantPanelContent,
      shouldDimResultsSheet,
      shouldDisableResultsSheetInteraction,
      notifyCloseCollapsedBoundaryReached: () =>
        closeTransitionActions.markSearchSheetCloseCollapsedReached('collapsed'),
      shouldSuppressRestaurantOverlay,
      shouldEnableRestaurantOverlayInteraction: !shouldSuppressRestaurantOverlay,
    };
  }, [
    closeTransitionActions,
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible,
    rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState,
    rootSuggestionRuntime.isSuggestionPanelVisible,
    sessionActionRuntime.profileOwner.profileViewState.presentation.isOverlayVisible,
    sessionActionRuntime.profileOwner.profileViewState.presentation.isTransitionAnimating,
  ]);

  useSearchRuntimePublicationRuntime({
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    hydrationOperationId: rootSessionRuntime.runtimeFlags.hydrationOperationId,
    preparedResultsSnapshotKey,
    hasSystemStatusBanner: rootSessionRuntime.requestStatusRuntime.hasSystemStatusBanner,
    profilePreparedSnapshotKey:
      sessionActionRuntime.profileOwner.profileViewState.presentation.preparedSnapshotKey,
    rankButtonLabelText: sessionActionRuntime.filterModalRuntime.rankButtonLabelText,
    rankButtonIsActive: sessionActionRuntime.filterModalRuntime.rankButtonIsActive,
    priceButtonLabelText: sessionActionRuntime.filterModalRuntime.priceButtonLabelText,
    priceButtonIsActive: sessionActionRuntime.filterModalRuntime.priceButtonIsActive,
    openNow: sessionActionRuntime.filterModalRuntime.openNow,
    votesFilterActive: sessionActionRuntime.filterModalRuntime.votesFilterActive,
    isRankSelectorVisible: sessionActionRuntime.filterModalRuntime.isRankSelectorVisible,
    isPriceSelectorVisible: sessionActionRuntime.filterModalRuntime.isPriceSelectorVisible,
    shouldRetrySearchOnReconnect:
      sessionActionRuntime.foregroundInteractionRuntime.shouldRetrySearchOnReconnect,
  });

  return React.useMemo(
    () => ({
      resultsSheetInteractionModel,
      presentationState,
    }),
    [presentationState, resultsSheetInteractionModel]
  );
};
