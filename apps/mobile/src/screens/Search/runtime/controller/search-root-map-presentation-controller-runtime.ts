import type {
  SearchRootMapProfileControlLane,
  SearchRootResultsPresentationControlLane,
} from '../shared/use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from '../shared/search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from '../shared/use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from '../shared/use-search-root-session-runtime-contract';

export const createSearchRootMapPresentationRuntimeValue = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  mapProfileControlLane,
  resultsPresentationControlLane,
}: {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mapProfileControlLane: SearchRootMapProfileControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
}) => {
  const {
    sessionPrimitivesLane,
  } = stateFoundationLane;
  const {
    rootInstrumentationRuntime: instrumentationRuntime,
    rootResultsSheetRuntimeLane,
  } = rootOverlayFoundationRuntime;

  return {
    highlightedRestaurantId:
      mapProfileControlLane.mapViewState.highlightedRestaurantId,
    viewportBoundsService: sessionCoreLane.viewportBoundsService,
    resolveRestaurantMapLocations:
      mapProfileControlLane.restaurantSelectionModel
        .resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor:
      mapProfileControlLane.restaurantSelectionModel
        .resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation:
      mapProfileControlLane.restaurantSelectionModel
        .pickPreferredRestaurantMapLocation,
    mapGestureActiveRef: rootResultsSheetRuntimeLane.mapGestureActiveRef,
    mapMotionPressureController:
      rootResultsSheetRuntimeLane.mapMotionPressureController,
    shouldLogSearchComputes:
      instrumentationRuntime.shouldLogSearchComputes,
    getPerfNow: sessionPrimitivesLane.primitives.getPerfNow,
    logSearchCompute: instrumentationRuntime.logSearchCompute,
    mapQueryBudget: sessionCoreLane.mapQueryBudget,
    profileCommandPort: mapProfileControlLane.mapProfileCommandPort,
    cameraPadding: mapProfileControlLane.mapViewState.mapCameraPadding,
    handleMapLoaded: sessionCoreLane.mapBootstrapRuntime.handleMapLoaded,
    handleMainMapFullyRendered:
      sessionCoreLane.mapBootstrapRuntime.handleMainMapFullyRendered,
    isMapStyleReady: sessionCoreLane.mapBootstrapRuntime.isMapStyleReady,
    onProfilerRender: instrumentationRuntime.handleProfilerRender,
    presentationLifecycleHandlers: {
      handleExecutionBatchMountedHidden:
        resultsPresentationControlLane.resultsPresentationOwner
          .handleExecutionBatchMountedHidden,
      handleMarkerEnterStarted:
        resultsPresentationControlLane.resultsPresentationOwner
          .handleMarkerEnterStarted,
      handleMarkerEnterSettled:
        resultsPresentationControlLane.resultsPresentationOwner
          .handleMarkerEnterSettled,
      handleMarkerExitStarted:
        resultsPresentationControlLane.resultsPresentationOwner
          .handleMarkerExitStarted,
      handleMarkerExitSettled:
        resultsPresentationControlLane.resultsPresentationOwner
          .handleMarkerExitSettled,
    },
  };
};
