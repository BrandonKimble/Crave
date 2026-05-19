import React from 'react';

import { createSearchRootResultsControlRuntimeValue } from '../controller/search-root-results-control-runtime';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootResultsInteractionPorts } from './search-root-control-ports-runtime-contract';
import type {
  SearchRootSearchSurfaceResultsTransactionControlLane,
  SearchRootResultsPresentationStateControlLane,
  SearchRootResultsSheetControlLane,
  SearchRootResultsTransitionControlLane,
  SubmitRuntimeResult,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import {
  useSearchRootSearchSurfaceResultsTransactionControlLane,
  useSearchRootResultsPresentationStateControlLane,
  useSearchRootResultsSheetControlLane,
  useSearchRootResultsTransitionControlLane,
} from './use-search-root-results-control-lanes';
import { useSearchRootResultsInteractionPortPublicationRuntime } from './use-search-root-results-interaction-port-publication-runtime';
import { useSearchRootResultsPresentationStateRuntime } from './use-search-root-results-presentation-state-runtime';
import { useSearchRootResultsSheetInteractionModelRuntime } from './use-search-root-results-sheet-interaction-model-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

type UseSearchRootResultsControlRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  resultsInteractionPorts: SearchRootResultsInteractionPorts;
  profileOwner: ProfileOwner;
  submitRuntimeResult: SubmitRuntimeResult;
};

export const useSearchRootResultsControlRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsPresentationOwner,
  resultsInteractionPorts,
  profileOwner,
  submitRuntimeResult,
}: UseSearchRootResultsControlRuntimeArgs): {
  resultsSheetControlLane: SearchRootResultsSheetControlLane;
  resultsPresentationStateControlLane: SearchRootResultsPresentationStateControlLane;
  resultsTransitionControlLane: SearchRootResultsTransitionControlLane;
  searchSurfaceResultsTransactionControlLane: SearchRootSearchSurfaceResultsTransactionControlLane;
} => {
  const { closeTransitionActions, searchSurfaceResultsTransactionKey } =
    resultsPresentationOwner;
  const resultsSheetInteractionModel =
    useSearchRootResultsSheetInteractionModelRuntime({
      stateFoundationLane,
      rootOverlayFoundationRuntime,
      submitRuntimeResult,
    });
  const presentationState = useSearchRootResultsPresentationStateRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    profileOwner,
  });

  const resultsSheetControlLane =
    useSearchRootResultsSheetControlLane(resultsSheetInteractionModel);
  const resultsPresentationStateControlLane =
    useSearchRootResultsPresentationStateControlLane(presentationState);
  const resultsTransitionControlLane =
    useSearchRootResultsTransitionControlLane(closeTransitionActions);
  const searchSurfaceResultsTransactionControlLane =
    useSearchRootSearchSurfaceResultsTransactionControlLane(searchSurfaceResultsTransactionKey);

  useSearchRootResultsInteractionPortPublicationRuntime({
    resultsInteractionPorts,
    resultsSheetInteractionModel,
  });

  return React.useMemo(
    () =>
      createSearchRootResultsControlRuntimeValue({
        resultsSheetControlLane,
        resultsPresentationStateControlLane,
        resultsTransitionControlLane,
        searchSurfaceResultsTransactionControlLane,
      }),
    [
      searchSurfaceResultsTransactionControlLane,
      resultsPresentationStateControlLane,
      resultsSheetControlLane,
      resultsTransitionControlLane,
    ]
  );
};
