import React from 'react';

import { createSearchRootMapPresentationRuntimeValue } from '../controller/search-root-map-presentation-controller-runtime';
import type {
  SearchRootMapProfileControlLane,
  SearchRootResultsPresentationControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootMapPresentationRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mapProfileControlLane: SearchRootMapProfileControlLane;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
};

export const useSearchRootMapPresentationRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  mapProfileControlLane,
  resultsPresentationControlLane,
}: UseSearchRootMapPresentationRuntimeArgs) =>
  React.useMemo(
    () =>
      createSearchRootMapPresentationRuntimeValue({
        sessionCoreLane,
        stateFoundationLane,
        rootOverlayFoundationRuntime,
        mapProfileControlLane,
        resultsPresentationControlLane,
      }),
    [
      mapProfileControlLane.mapProfileCommandPort,
      mapProfileControlLane.mapViewState.highlightedRestaurantId,
      mapProfileControlLane.mapViewState.mapCameraPadding,
      mapProfileControlLane.restaurantSelectionModel
        .pickPreferredRestaurantMapLocation,
      mapProfileControlLane.restaurantSelectionModel
        .resolveRestaurantLocationSelectionAnchor,
      mapProfileControlLane.restaurantSelectionModel
        .resolveRestaurantMapLocations,
      resultsPresentationControlLane.resultsPresentationOwner
        .handleExecutionBatchMountedHidden,
      resultsPresentationControlLane.resultsPresentationOwner
        .handleMarkerEnterSettled,
      resultsPresentationControlLane.resultsPresentationOwner
        .handleMarkerEnterStarted,
      resultsPresentationControlLane.resultsPresentationOwner
        .handleMarkerExitSettled,
      resultsPresentationControlLane.resultsPresentationOwner
        .handleMarkerExitStarted,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.logSearchCompute,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .shouldLogSearchComputes,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane.mapGestureActiveRef,
      rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane
        .mapMotionPressureController,
      sessionCoreLane.mapBootstrapRuntime.handleMainMapFullyRendered,
      sessionCoreLane.mapBootstrapRuntime.handleMapLoaded,
      sessionCoreLane.mapBootstrapRuntime.isMapStyleReady,
      sessionCoreLane.mapQueryBudget,
      sessionCoreLane.viewportBoundsService,
      stateFoundationLane.sessionPrimitivesLane.primitives.getPerfNow,
    ]
  );
