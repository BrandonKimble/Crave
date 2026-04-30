import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchForegroundOverlayRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';

type SearchRootForegroundOverlayStateArgs = Pick<
  SearchForegroundOverlayRuntimeArgs,
  | 'navigation'
  | 'routeSearchIntent'
  | 'userLocation'
  | 'rootOverlay'
  | 'isSuggestionPanelActive'
  | 'profilePresentationActive'
  | 'beginSuggestionCloseHoldRef'
  | 'ignoreNextSearchBlurRef'
  | 'allowSearchBlurExitRef'
  | 'inputRef'
>;

type UseSearchRootForegroundOverlayStateArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  navigation: SearchRootEnvironment['navigation'];
  routeSearchIntent: SearchRootEnvironment['routeSearchIntent'];
  userLocation: SearchRootEnvironment['userLocation'];
  profileOwner: ProfileOwner;
};

export const useSearchRootForegroundOverlayStateArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  navigation,
  routeSearchIntent,
  userLocation,
  profileOwner,
}: UseSearchRootForegroundOverlayStateArgsArgs): SearchRootForegroundOverlayStateArgs => {
  const { rootPrimitivesRuntime } = stateFoundationLane;
  const { rootOverlay } = rootOverlayFoundationRuntime.rootOverlayStoreRuntime;

  return React.useMemo(
    () => ({
      navigation,
      routeSearchIntent,
      userLocation,
      rootOverlay,
      isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      profilePresentationActive: profileOwner.profileViewState.presentation.isPresentationActive,
      beginSuggestionCloseHoldRef: rootPrimitivesRuntime.searchState.beginSuggestionCloseHoldRef,
      ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      inputRef: rootPrimitivesRuntime.searchState.inputRef,
    }),
    [
      navigation,
      profileOwner.profileViewState.presentation.isPresentationActive,
      rootOverlay,
      rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      rootPrimitivesRuntime.searchState.beginSuggestionCloseHoldRef,
      rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      rootPrimitivesRuntime.searchState.inputRef,
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      routeSearchIntent,
      userLocation,
    ]
  );
};
