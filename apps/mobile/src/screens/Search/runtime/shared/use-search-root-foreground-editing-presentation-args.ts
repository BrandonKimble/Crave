import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootStateFoundationLane,
} from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { SearchForegroundEditingRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundEditingPresentationArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'dismissTransientOverlays'
  | 'beginSuggestionCloseHold'
  | 'requestSearchPresentationIntent'
  | 'beginCloseSearch'
  | 'restoreDockedPolls'
>;

type UseSearchRootForegroundEditingPresentationArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
};

export const useSearchRootForegroundEditingPresentationArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsPresentationOwner,
}: UseSearchRootForegroundEditingPresentationArgsArgs): SearchRootForegroundEditingPresentationArgs => {
  const { rootSuggestionRuntime } = stateFoundationLane;
  const {
    rootOverlayStoreRuntime,
    routeOverlayCommandActions,
  } = rootOverlayFoundationRuntime;

  return React.useMemo(
    () => ({
      dismissTransientOverlays: rootOverlayStoreRuntime.dismissTransientOverlays,
      beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
      requestSearchPresentationIntent:
        resultsPresentationOwner.presentationActions.requestSearchPresentationIntent,
      beginCloseSearch: resultsPresentationOwner.presentationActions.beginCloseSearch,
      restoreDockedPolls: routeOverlayCommandActions.restoreDockedPolls,
    }),
    [
      resultsPresentationOwner.presentationActions.beginCloseSearch,
      resultsPresentationOwner.presentationActions.requestSearchPresentationIntent,
      routeOverlayCommandActions.restoreDockedPolls,
      rootOverlayStoreRuntime.dismissTransientOverlays,
      rootSuggestionRuntime.beginSuggestionCloseHold,
    ]
  );
};
