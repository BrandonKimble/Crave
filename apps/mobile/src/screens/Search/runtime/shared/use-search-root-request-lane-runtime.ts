import React from 'react';

import {
  useSearchRootAutocompleteArgsRuntime,
  type SearchRootAutocompleteArgsRuntime,
} from './use-search-root-autocomplete-args-runtime';
import {
  useSearchRootForegroundInputArgsRuntime,
  type SearchRootForegroundInputArgsRuntime,
} from './use-search-root-foreground-input-args-runtime';
import {
  useSearchRootRecentActivityArgsRuntime,
  type SearchRootRecentActivityArgsRuntime,
} from './use-search-root-recent-activity-args-runtime';
import {
  useSearchRootRequestPresentationArgsRuntime,
  type SearchRootRequestPresentationArgsRuntime,
} from './use-search-root-request-presentation-args-runtime';
import {
  useSearchRequestPresentationFlowRuntime,
  type SearchRequestPresentationFlowRuntime,
} from './use-search-request-presentation-flow-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

type UseSearchRootRequestLaneRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
};

export type SearchRootRequestLaneRuntime = {
  requestPresentationFlowRuntime: SearchRequestPresentationFlowRuntime;
  resetResultsListScrollProgressRef: React.MutableRefObject<() => void>;
};

export const useSearchRootRequestLaneRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
}: UseSearchRootRequestLaneRuntimeArgs): SearchRootRequestLaneRuntime => {
  const resetResultsListScrollProgressRef = React.useRef<() => void>(() => {});
  const requestPresentationArgs: SearchRootRequestPresentationArgsRuntime =
    useSearchRootRequestPresentationArgsRuntime({
      rootSessionRuntime,
      rootPrimitivesRuntime,
      rootSuggestionRuntime,
      rootScaffoldRuntime,
    });
  const autocompleteArgs: SearchRootAutocompleteArgsRuntime = useSearchRootAutocompleteArgsRuntime({
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
  });
  const recentActivityArgs: SearchRootRecentActivityArgsRuntime =
    useSearchRootRecentActivityArgsRuntime({
      rootSessionRuntime,
      rootPrimitivesRuntime,
      rootSuggestionRuntime,
    });
  const foregroundInputArgs: SearchRootForegroundInputArgsRuntime =
    useSearchRootForegroundInputArgsRuntime({
      rootSessionRuntime,
      rootPrimitivesRuntime,
      rootScaffoldRuntime,
    });

  const requestPresentationFlowRuntime = useSearchRequestPresentationFlowRuntime({
    runOneHandoffCoordinatorRef: rootSessionRuntime.runtimeOwner.runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent: rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
    resultsScrollRef: rootPrimitivesRuntime.searchState.resultsScrollRef,
    resultsScrollOffset: rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
    resetResultsListScrollProgressRef,
    requestPresentationArgs,
    autocompleteArgs,
    recentActivityArgs,
    foregroundInputArgs,
  });

  return {
    requestPresentationFlowRuntime,
    resetResultsListScrollProgressRef,
  };
};
