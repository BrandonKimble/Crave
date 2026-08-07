import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchForegroundOverlayRuntimeArgs } from './search-foreground-interaction-runtime-contract';

type SearchRootForegroundOverlayActionArgs = Pick<
  SearchForegroundOverlayRuntimeArgs,
  | 'transitionActions'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setSuggestions'
  | 'setIsAutocompleteSuppressed'
  | 'setIsSuggestionLayoutWarm'
  | 'cancelAutocomplete'
  | 'resetSearchHeaderFocusProgress'
  | 'resetSubmitTransitionHold'
>;

type UseSearchRootForegroundOverlayActionArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootForegroundOverlayActionArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootForegroundOverlayActionArgsArgs): SearchRootForegroundOverlayActionArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const { routeOverlayTransitionActions } = rootOverlayFoundationRuntime;

  return React.useMemo(
    () => ({
      transitionActions: routeOverlayTransitionActions,
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
      setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      setIsSuggestionLayoutWarm: rootSuggestionRuntime.setIsSuggestionLayoutWarm,
      cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    }),
    [
      rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      routeOverlayTransitionActions,
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      rootPrimitivesRuntime.searchState.setIsSearchFocused,
      rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.setSuggestions,
      rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      rootSuggestionRuntime.resetSubmitTransitionHold,
      rootSuggestionRuntime.setIsSuggestionLayoutWarm,
    ]
  );
};
