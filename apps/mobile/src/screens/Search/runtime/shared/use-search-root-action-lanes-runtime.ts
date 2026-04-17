import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import {
  type SearchRootActionLanesRuntime,
  type SearchRootProfileActionRuntime,
} from './use-search-root-action-lanes-runtime-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { useSearchRootForegroundActionRuntime } from './use-search-root-foreground-action-runtime';
import { useSearchRootResultsActionRuntime } from './use-search-root-results-action-runtime';

type UseSearchRootActionLanesRuntimeArgs = Pick<
  SearchRootEnvironment,
  | 'activeMainIntent'
  | 'consumeActiveMainIntent'
  | 'navigation'
  | 'routeSearchIntent'
  | 'userLocation'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootSuggestionRuntime: Pick<
    SearchRootSuggestionRuntime,
    | 'isSuggestionPanelVisible'
    | 'isSuggestionScreenActive'
    | 'beginSubmitTransition'
    | 'beginSuggestionCloseHold'
    | 'resetSearchHeaderFocusProgress'
    | 'resetSubmitTransitionHold'
    | 'setIsSuggestionLayoutWarm'
    | 'setSearchTransitionVariant'
  >;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  profileActionRuntime: SearchRootProfileActionRuntime;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
};

export const useSearchRootActionLanesRuntime = ({
  activeMainIntent,
  consumeActiveMainIntent,
  navigation,
  routeSearchIntent,
  userLocation,
  rootPrimitivesRuntime,
  rootSessionRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  profileActionRuntime,
  lastAutoOpenKeyRef,
}: UseSearchRootActionLanesRuntimeArgs): SearchRootActionLanesRuntime => {
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: { resultsPresentationOwner },
    },
  } = requestLaneRuntime;
  const { profileOwner } = profileActionRuntime;
  const { preparedResultsSnapshotKey } = resultsPresentationOwner;

  const foregroundActionRuntime = useSearchRootForegroundActionRuntime({
    activeMainIntent,
    consumeActiveMainIntent,
    navigation,
    routeSearchIntent,
    userLocation,
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    profileActionRuntime,
    lastAutoOpenKeyRef,
  });

  const resultsActionRuntime = useSearchRootResultsActionRuntime({
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    loadMoreResults: foregroundActionRuntime.submitRuntimeResult.loadMoreResults,
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    isSearchLoading: rootSessionRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootSessionRuntime.resultsArrivalState.isLoadingMore,
    canLoadMore: rootSessionRuntime.resultsArrivalState.canLoadMore,
    currentPage: rootSessionRuntime.resultsArrivalState.currentPage,
    resultsPresentationOwner,
    profileOwner,
  });

  const filterToggleDraftRuntimeState = useSearchRuntimeBusSelector(
    rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    (state) => ({
      toggleInteraction: state.toggleInteraction,
      openNow: state.openNow,
      votesFilterActive: state.votesFilterActive,
    }),
    (left, right) =>
      left.toggleInteraction === right.toggleInteraction &&
      left.openNow === right.openNow &&
      left.votesFilterActive === right.votesFilterActive,
    ['toggleInteraction', 'openNow', 'votesFilterActive'] as const
  );

  React.useEffect(() => {
    const shouldPreserveInteractionDraft =
      filterToggleDraftRuntimeState.toggleInteraction.kind != null;
    rootSessionRuntime.runtimeOwner.searchRuntimeBus.publish({
      priceButtonLabelText: foregroundActionRuntime.filterModalRuntime.priceButtonLabelText,
      priceButtonIsActive: foregroundActionRuntime.filterModalRuntime.priceButtonIsActive,
      openNow: shouldPreserveInteractionDraft
        ? filterToggleDraftRuntimeState.openNow
        : foregroundActionRuntime.filterModalRuntime.openNow,
      votesFilterActive: shouldPreserveInteractionDraft
        ? filterToggleDraftRuntimeState.votesFilterActive
        : foregroundActionRuntime.filterModalRuntime.votesFilterActive,
      isPriceSelectorVisible: foregroundActionRuntime.filterModalRuntime.isPriceSelectorVisible,
      shouldRetrySearchOnReconnect:
        foregroundActionRuntime.foregroundInteractionRuntime.shouldRetrySearchOnReconnect,
      hasSystemStatusBanner: rootSessionRuntime.requestStatusRuntime.hasSystemStatusBanner,
    });
  }, [
    filterToggleDraftRuntimeState,
    foregroundActionRuntime.filterModalRuntime.isPriceSelectorVisible,
    foregroundActionRuntime.filterModalRuntime.openNow,
    foregroundActionRuntime.filterModalRuntime.priceButtonIsActive,
    foregroundActionRuntime.filterModalRuntime.priceButtonLabelText,
    foregroundActionRuntime.filterModalRuntime.votesFilterActive,
    foregroundActionRuntime.foregroundInteractionRuntime.shouldRetrySearchOnReconnect,
    rootSessionRuntime.requestStatusRuntime.hasSystemStatusBanner,
    rootSessionRuntime.runtimeOwner.searchRuntimeBus,
  ]);

  React.useEffect(() => {
    rootSessionRuntime.runtimeOwner.searchRuntimeBus.publish({
      hydrationOperationId: rootSessionRuntime.runtimeFlags.hydrationOperationId,
    });
  }, [
    rootSessionRuntime.runtimeFlags.hydrationOperationId,
    rootSessionRuntime.runtimeOwner.searchRuntimeBus,
  ]);

  React.useEffect(() => {
    const nextPreparedSnapshotKey =
      profileOwner.profileViewState.presentation.preparedSnapshotKey ?? preparedResultsSnapshotKey;
    rootSessionRuntime.runtimeOwner.searchRuntimeBus.publish({
      preparedPresentationSnapshotKey: nextPreparedSnapshotKey,
    });
  }, [
    preparedResultsSnapshotKey,
    profileOwner.profileViewState.presentation.preparedSnapshotKey,
    rootSessionRuntime.runtimeOwner.searchRuntimeBus,
  ]);

  return {
    profileActionRuntime,
    foregroundActionRuntime,
    resultsActionRuntime,
  };
};
