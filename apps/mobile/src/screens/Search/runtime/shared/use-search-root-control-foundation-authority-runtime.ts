import React from 'react';

import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootMutationCancelAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootRequestExecutionAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootAutocompleteAuthorityRuntime } from './use-search-root-autocomplete-authority-runtime';
import { useSearchRootClearRestoreAuthorityRuntime } from './use-search-root-clear-restore-authority-runtime';
import { useSearchRootMutationCancelAuthorityRuntime } from './use-search-root-mutation-cancel-authority-runtime';
import { useSearchRootProfileBridgeAuthorityRuntime } from './use-search-root-profile-bridge-authority-runtime';
import { useSearchRootRecentActivityAuthorityRuntime } from './use-search-root-recent-activity-authority-runtime';
import { useSearchRootResultsScrollAuthorityRuntime } from './use-search-root-results-scroll-authority-runtime';
import { useSearchRootRequestExecutionAuthorityRuntime } from './use-search-root-request-execution-authority-runtime';
import type {
  SearchRootSessionCoreLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootControlFoundationAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export type SearchRootControlFoundationAuthorityRuntime = {
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  autocompleteControlPort: SearchRootAutocompleteAuthorityRuntime['autocompleteControlPort'];
};

export const useSearchRootControlFoundationAuthorityRuntime = ({
  sessionCoreLane,
  mapViewportIntentRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootControlFoundationAuthorityRuntimeArgs): SearchRootControlFoundationAuthorityRuntime => {
  const requestExecutionAuthorityRuntime =
    useSearchRootRequestExecutionAuthorityRuntime({
      sessionCoreLane,
      mapViewportIntentRuntime,
      stateFoundationLane,
      rootOverlayFoundationRuntime,
    });
  const autocompleteAuthorityRuntime =
    useSearchRootAutocompleteAuthorityRuntime({
      sessionCoreLane,
      stateFoundationLane,
    });
  const mutationCancelAuthorityRuntime =
    useSearchRootMutationCancelAuthorityRuntime();
  const resultsScrollAuthorityRuntime = useSearchRootResultsScrollAuthorityRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
  const profileBridgeAuthorityRuntime =
    useSearchRootProfileBridgeAuthorityRuntime();
  const recentActivityAuthorityRuntime = useSearchRootRecentActivityAuthorityRuntime({
    stateFoundationLane,
  });
  const clearRestoreAuthorityRuntime = useSearchRootClearRestoreAuthorityRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    requestExecutionAuthorityRuntime,
    mutationCancelAuthorityRuntime,
    profileBridgeAuthorityRuntime,
    resultsScrollAuthorityRuntime,
  });

  return React.useMemo(
    () => ({
      requestExecutionAuthorityRuntime,
      autocompleteAuthorityRuntime,
      mutationCancelAuthorityRuntime,
      profileBridgeAuthorityRuntime,
      recentActivityAuthorityRuntime,
      resultsScrollAuthorityRuntime,
      clearRestoreAuthorityRuntime,
      autocompleteControlPort:
        autocompleteAuthorityRuntime.autocompleteControlPort,
    }),
    [
      autocompleteAuthorityRuntime,
      clearRestoreAuthorityRuntime,
      mutationCancelAuthorityRuntime,
      profileBridgeAuthorityRuntime,
      recentActivityAuthorityRuntime,
      requestExecutionAuthorityRuntime,
      resultsScrollAuthorityRuntime,
    ]
  );
};
