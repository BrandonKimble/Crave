import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchForegroundInteractionRouteEffectsRuntimeArgs } from './use-search-foreground-interaction-effects-runtime';

type SearchRootForegroundEffectsUiArgs = SearchForegroundInteractionRouteEffectsRuntimeArgs;

type UseSearchRootForegroundEffectsUiArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootForegroundEffectsUiArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootForegroundEffectsUiArgsArgs): SearchRootForegroundEffectsUiArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const {
    rootOverlayStoreRuntime,
    rootSharedSheetRuntimeLane,
    routeOverlayCommandSnapshotRef,
    routeOverlayCommandActions,
  } = rootOverlayFoundationRuntime;

  return React.useMemo(
    () => ({
      isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
      saveSheetVisibleRef: routeOverlayCommandSnapshotRef,
      handleCloseSaveSheet: routeOverlayCommandActions.handleCloseSaveSheet,
      isSearchFocused: rootPrimitivesRuntime.searchState.isSearchFocused,
      isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      isSuggestionScreenActive: rootSuggestionRuntime.isSuggestionScreenActive,
      dismissTransientOverlays: rootOverlayStoreRuntime.dismissTransientOverlays,
      hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
      resetMapMoveFlag: rootSharedSheetRuntimeLane.resetMapMoveFlag,
    }),
    [
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      routeOverlayCommandActions.handleCloseSaveSheet,
      routeOverlayCommandSnapshotRef,
      rootOverlayStoreRuntime.dismissTransientOverlays,
      rootOverlayStoreRuntime.isSearchOverlay,
      rootPrimitivesRuntime.searchState.isSearchFocused,
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      rootPrimitivesRuntime.searchState.setIsSearchFocused,
      rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      rootSharedSheetRuntimeLane.resetMapMoveFlag,
      rootSuggestionRuntime.isSuggestionScreenActive,
    ]
  );
};
