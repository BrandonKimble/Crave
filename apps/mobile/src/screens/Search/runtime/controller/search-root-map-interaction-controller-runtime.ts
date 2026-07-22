import type {
  SearchRootAutocompleteControlLane,
  SearchRootProfilePresentationControlLane,
  SearchRootSuggestionInteractionControlLane,
} from '../shared/use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from '../shared/search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from '../shared/use-search-root-session-runtime-contract';

export const createSearchRootMapInteractionControllerArgs = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  autocompleteControlLane,
  suggestionInteractionControlLane,
  profilePresentationControlLane,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
  profilePresentationControlLane: SearchRootProfilePresentationControlLane;
}) => {
  const {
    rootDataPlaneRuntime: dataPlaneRuntime,
    rootPrimitivesRuntime: primitivesRuntime,
    sessionPrimitivesLane,
    rootSuggestionRuntime: suggestionRuntime,
  } = stateFoundationLane;
  const {
    rootInstrumentationRuntime: instrumentationRuntime,
    rootOverlayStoreRuntime,
    rootSharedSheetRuntimeLane,
  } = rootOverlayFoundationRuntime;

  return {
    searchInteractionRef: sessionPrimitivesLane.primitives.searchInteractionRef,
    pendingMarkerOpenAnimationFrameRef:
      profilePresentationControlLane.pendingMarkerOpenAnimationFrameRef,
    allowSearchBlurExitRef: primitivesRuntime.searchState.allowSearchBlurExitRef,
    suppressAutocompleteResults:
      autocompleteControlLane.autocompleteControlPort.suppressAutocompleteResults,
    dismissSearchKeyboard:
      suggestionInteractionControlLane.suggestionInteractionRuntime.dismissSearchKeyboard,
    beginSuggestionCloseHold: suggestionRuntime.beginSuggestionCloseHold,
    isSearchSessionActive: dataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    isProfilePresentationActive:
      profilePresentationControlLane.profileOwner.profileViewState.presentation
        .isPresentationActive,
    setIsAutocompleteSuppressed: primitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setIsSearchFocused: primitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: primitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: primitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: primitivesRuntime.searchState.setSuggestions,
    clearMapHighlightedRestaurantId:
      profilePresentationControlLane.profileOwner.profileActions.clearMapHighlightedRestaurantId,
    cancelAutocomplete: dataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
    shouldLogMapEventRates: instrumentationRuntime.shouldLogMapEventRates,
    mapEventLogIntervalMs: instrumentationRuntime.mapEventLogIntervalMs,
    shouldLogSearchStateChanges: instrumentationRuntime.shouldLogSearchStateChanges,
    mapGestureActiveRef: rootSharedSheetRuntimeLane.mapGestureActiveRef,
    suppressMapMovedRef: primitivesRuntime.mapState.suppressMapMovedRef,
    mapMotionPressureController: rootSharedSheetRuntimeLane.mapMotionPressureController,
    markMapMovedIfNeeded: rootSharedSheetRuntimeLane.markMapMovedIfNeeded,
    scheduleMapIdleEnter: rootSharedSheetRuntimeLane.scheduleMapIdleEnter,
    isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
    lastCameraStateRef: sessionPrimitivesLane.primitives.lastCameraStateRef,
    lastPersistedCameraRef: sessionPrimitivesLane.primitives.lastPersistedCameraRef,
    cameraIntentArbiter: sessionCoreLane.cameraIntentArbiter,
    viewportBoundsService: sessionCoreLane.viewportBoundsService,
  };
};
