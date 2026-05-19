import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootPresentationStateRuntime } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootResultsPresentationStateRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  profileOwner: ProfileOwner;
};

export const useSearchRootResultsPresentationStateRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  profileOwner,
}: UseSearchRootResultsPresentationStateRuntimeArgs): SearchRootPresentationStateRuntime => {
  const {
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
  } = stateFoundationLane;
  const { appRouteResultsSheetRuntimeOwner } = rootOverlayFoundationRuntime;

  return React.useMemo(() => {
    const isSuggestionPanelActive = rootPrimitivesRuntime.searchState.isSuggestionPanelActive;
    const shouldSuspendResultsSheet = profileOwner.profileViewState.presentation.isOverlayVisible;
    const shouldFreezeRestaurantPanelContent =
      profileOwner.profileViewState.presentation.isTransitionAnimating;
    const shouldDimResultsSheet =
      (isSuggestionPanelActive || rootSuggestionRuntime.isSuggestionPanelVisible) &&
      (appRouteResultsSheetRuntimeOwner.panelVisible ||
        appRouteResultsSheetRuntimeOwner.sheetState !== 'hidden');
    const shouldDisableResultsSheetInteraction =
      shouldSuspendResultsSheet ||
      (isSuggestionPanelActive &&
        (appRouteResultsSheetRuntimeOwner.panelVisible ||
          appRouteResultsSheetRuntimeOwner.sheetState !== 'hidden'));
    const shouldSuppressRestaurantOverlay =
      profileOwner.profileViewState.presentation.isOverlayVisible && isSuggestionPanelActive;

    return {
      shouldSuspendResultsSheet,
      shouldFreezeRestaurantPanelContent,
      shouldDimResultsSheet,
      shouldDisableResultsSheetInteraction,
      shouldSuppressRestaurantOverlay,
      shouldEnableRestaurantOverlayInteraction: !shouldSuppressRestaurantOverlay,
    };
  }, [
    profileOwner.profileViewState.presentation.isOverlayVisible,
    profileOwner.profileViewState.presentation.isTransitionAnimating,
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    appRouteResultsSheetRuntimeOwner.panelVisible,
    appRouteResultsSheetRuntimeOwner.sheetState,
    rootSuggestionRuntime.isSuggestionPanelVisible,
  ]);
};
