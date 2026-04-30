import React from 'react';

import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
  SearchRootPreparedResultsSnapshotControlLane,
  SearchRootProfilePresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootSearchSceneBusPatchRuntime } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneBusPublishEffectRuntime } from './use-search-root-search-scene-bus-publish-effect-runtime';

type UseSearchRootSearchSceneBusPublicationRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  preparedResultsSnapshotControlLane: SearchRootPreparedResultsSnapshotControlLane;
};

export const useSearchRootSearchSceneBusPublicationRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  filterModalControlLane,
  foregroundInteractionControlLane,
  profilePresentationControlLane,
  preparedResultsSnapshotControlLane,
}: UseSearchRootSearchSceneBusPublicationRuntimeArgs): void => {
  const { searchRuntimeBus } = sessionCoreLane;

  const searchRouteSceneBusPatch = useSearchRootSearchSceneBusPatchRuntime({
    stateFoundationLane,
    filterModalControlLane,
    foregroundInteractionControlLane,
    profilePresentationControlLane,
    preparedResultsSnapshotControlLane,
  });

  useSearchRootSearchSceneBusPublishEffectRuntime({
    searchRuntimeBus,
    searchRouteSceneBusPatch,
  });
};
