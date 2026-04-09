import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type UseSearchRuntimePublicationRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  hydrationOperationId: string | null;
  preparedResultsSnapshotKey: string | null;
  profilePreparedSnapshotKey: string | null;
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
};

export const useSearchRuntimePublicationRuntime = ({
  searchRuntimeBus,
  hydrationOperationId,
  preparedResultsSnapshotKey,
  profilePreparedSnapshotKey,
  rankButtonLabelText,
  rankButtonIsActive,
  priceButtonLabelText,
  priceButtonIsActive,
  openNow,
  votesFilterActive,
  isRankSelectorVisible,
  isPriceSelectorVisible,
  shouldRetrySearchOnReconnect,
  hasSystemStatusBanner,
}: UseSearchRuntimePublicationRuntimeArgs) => {
  const filterToggleDraftRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      toggleInteraction: state.toggleInteraction,
      rankButtonLabelText: state.rankButtonLabelText,
      rankButtonIsActive: state.rankButtonIsActive,
      openNow: state.openNow,
      votesFilterActive: state.votesFilterActive,
    }),
    (left, right) =>
      left.toggleInteraction === right.toggleInteraction &&
      left.rankButtonLabelText === right.rankButtonLabelText &&
      left.rankButtonIsActive === right.rankButtonIsActive &&
      left.openNow === right.openNow &&
      left.votesFilterActive === right.votesFilterActive,
    [
      'toggleInteraction',
      'rankButtonLabelText',
      'rankButtonIsActive',
      'openNow',
      'votesFilterActive',
    ] as const
  );

  React.useEffect(() => {
    const shouldPreserveInteractionDraft =
      filterToggleDraftRuntimeState.toggleInteraction.kind != null;
    searchRuntimeBus.publish({
      rankButtonLabelText: shouldPreserveInteractionDraft
        ? filterToggleDraftRuntimeState.rankButtonLabelText
        : rankButtonLabelText,
      rankButtonIsActive: shouldPreserveInteractionDraft
        ? filterToggleDraftRuntimeState.rankButtonIsActive
        : rankButtonIsActive,
      priceButtonLabelText,
      priceButtonIsActive,
      openNow: shouldPreserveInteractionDraft ? filterToggleDraftRuntimeState.openNow : openNow,
      votesFilterActive: shouldPreserveInteractionDraft
        ? filterToggleDraftRuntimeState.votesFilterActive
        : votesFilterActive,
      isRankSelectorVisible,
      isPriceSelectorVisible,
      shouldRetrySearchOnReconnect,
      hasSystemStatusBanner,
    });
  }, [
    filterToggleDraftRuntimeState,
    hasSystemStatusBanner,
    isPriceSelectorVisible,
    isRankSelectorVisible,
    openNow,
    priceButtonIsActive,
    priceButtonLabelText,
    rankButtonIsActive,
    rankButtonLabelText,
    searchRuntimeBus,
    shouldRetrySearchOnReconnect,
    votesFilterActive,
  ]);

  React.useEffect(() => {
    searchRuntimeBus.publish({
      hydrationOperationId,
    });
  }, [hydrationOperationId, searchRuntimeBus]);

  React.useEffect(() => {
    const nextPreparedSnapshotKey = profilePreparedSnapshotKey ?? preparedResultsSnapshotKey;
    searchRuntimeBus.publish({
      preparedPresentationSnapshotKey: nextPreparedSnapshotKey,
    });
  }, [preparedResultsSnapshotKey, profilePreparedSnapshotKey, searchRuntimeBus]);
};
