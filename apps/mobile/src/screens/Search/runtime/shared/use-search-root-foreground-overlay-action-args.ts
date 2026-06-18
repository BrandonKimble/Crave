import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchForegroundOverlayRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundOverlayActionArgs = Pick<
  SearchForegroundOverlayRuntimeArgs,
  | 'closeRestaurantProfile'
  | 'dismissTransientOverlays'
  | 'transitionActions'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setIsAutocompleteSuppressed'
  | 'setIsSuggestionLayoutWarm'
  | 'setSearchTransitionVariant'
  | 'cancelAutocomplete'
  | 'resetSearchHeaderFocusProgress'
  | 'resetSubmitTransitionHold'
>;

type UseSearchRootForegroundOverlayActionArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  profileOwner: ProfileOwner;
};

export const useSearchRootForegroundOverlayActionArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  profileOwner,
}: UseSearchRootForegroundOverlayActionArgsArgs): SearchRootForegroundOverlayActionArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const { rootOverlayStoreRuntime, routeOverlayTransitionActions } = rootOverlayFoundationRuntime;

  return React.useMemo(
    () => ({
      closeRestaurantProfile: profileOwner.profileActions.closeRestaurantProfile,
      dismissTransientOverlays: rootOverlayStoreRuntime.dismissTransientOverlays,
      transitionActions: routeOverlayTransitionActions,
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
      setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
      setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      setIsSuggestionLayoutWarm: rootSuggestionRuntime.setIsSuggestionLayoutWarm,
      setSearchTransitionVariant: rootSuggestionRuntime.setSearchTransitionVariant,
      cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    }),
    [
      profileOwner.profileActions.closeRestaurantProfile,
      rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      routeOverlayTransitionActions,
      rootOverlayStoreRuntime.dismissTransientOverlays,
      rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      rootPrimitivesRuntime.searchState.setIsSearchFocused,
      rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.setShowSuggestions,
      rootPrimitivesRuntime.searchState.setSuggestions,
      rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      rootSuggestionRuntime.resetSubmitTransitionHold,
      rootSuggestionRuntime.setIsSuggestionLayoutWarm,
      rootSuggestionRuntime.setSearchTransitionVariant,
    ]
  );
};
