import React from 'react';

import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootProfilePresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootSearchSceneStateBusPatchRuntime } from './use-search-root-search-scene-state-bus-patch-runtime';
import { useSearchRootSearchSceneUiBusPatchRuntime } from './use-search-root-search-scene-ui-bus-patch-runtime';

export type SearchRootSearchSceneBusPatch = {
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  shouldRetrySearchOnReconnect: boolean;
  hydrationOperationId: string | null;
  preparedPresentationSnapshotKey: string | null;
};

export const useSearchRootSearchSceneBusPatchRuntime = ({
  stateFoundationLane,
  filterModalControlLane,
  foregroundInteractionControlLane,
  profilePresentationControlLane,
  preparedResultsSnapshotControlLane,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
}): SearchRootSearchSceneBusPatch => ({
  ...useSearchRootSearchSceneUiBusPatchRuntime({
    filterModalControlLane,
    foregroundInteractionControlLane,
  }),
  ...useSearchRootSearchSceneStateBusPatchRuntime({
    stateFoundationLane,
    profilePresentationControlLane,
    preparedResultsSnapshotControlLane,
  }),
});
