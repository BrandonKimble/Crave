import React from 'react';

import { createSearchRootMapInteractionControllerArgs } from '../controller/search-root-map-interaction-controller-runtime';
import { useMapInteractionController } from '../map/map-interaction-controller';
import { useSearchRootMapInteractionBridgeRuntime } from './use-search-root-map-interaction-bridge-runtime';
import type {
  SearchRootAutocompleteControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootMapInteractionRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
  handleMapLoaded: () => void;
};

export const useSearchRootMapInteractionRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteControlLane,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
  handleMapLoaded,
}: UseSearchRootMapInteractionRuntimeArgs) => {
  const mapInteractionArgs = React.useMemo(
    () =>
      createSearchRootMapInteractionControllerArgs({
        sessionCoreLane,
        stateFoundationLane,
        rootOverlayFoundationRuntime,
        autocompleteControlLane,
        suggestionInteractionControlLane,
        profilePresentationControlLane,
      }),
    [
      autocompleteControlLane.autocompleteControlPort.suppressAutocompleteResults,
      profilePresentationControlLane.pendingMarkerOpenAnimationFrameRef,
      profilePresentationControlLane.profileOwner.profileActions.clearMapHighlightedRestaurantId,
      profilePresentationControlLane.profileOwner.profileViewState.presentation
        .isPresentationActive,
      suggestionInteractionControlLane.suggestionInteractionRuntime.dismissSearchKeyboard,
      stateFoundationLane.rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
      stateFoundationLane.rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      stateFoundationLane.rootPrimitivesRuntime.mapState.suppressMapMovedRef,
      stateFoundationLane.rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      stateFoundationLane.rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
      stateFoundationLane.rootPrimitivesRuntime.searchState.setIsSearchFocused,
      stateFoundationLane.rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      stateFoundationLane.rootPrimitivesRuntime.searchState.setShowSuggestions,
      stateFoundationLane.rootPrimitivesRuntime.searchState.setSuggestions,
      stateFoundationLane.rootSuggestionRuntime.beginSuggestionCloseHold,
      stateFoundationLane.sessionPrimitivesLane.primitives.lastCameraStateRef,
      stateFoundationLane.sessionPrimitivesLane.primitives.lastPersistedCameraRef,
      stateFoundationLane.sessionPrimitivesLane.primitives.searchInteractionRef,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.mapEventLogIntervalMs,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.shouldLogMapEventRates,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.shouldLogSearchStateChanges,
      rootOverlayFoundationRuntime.routeOverlaySessionSnapshotRef,
      rootOverlayFoundationRuntime.rootOverlayStoreRuntime.isSearchOverlay,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.cancelPendingMapMovementUpdates,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.mapGestureActiveRef,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.mapMotionPressureController,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.markMapMovedIfNeeded,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.scheduleMapIdleEnter,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.schedulePollBoundsUpdate,
      sessionCoreLane.cameraIntentArbiter,
      sessionCoreLane.viewportBoundsService,
    ]
  );

  const mapInteractionRuntime = useMapInteractionController(mapInteractionArgs);

  return useSearchRootMapInteractionBridgeRuntime({
    mapInteractionRuntime,
    handleMapLoaded,
  });
};
