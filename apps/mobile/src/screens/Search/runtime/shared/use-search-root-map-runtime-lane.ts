import React from 'react';

import { useSearchMapMovementState } from '../../hooks/use-search-map-movement-state';
import {
  createMapMotionPressureController,
  type MapMotionPressureController,
} from '../map/map-motion-pressure';
import type { SearchRootResultsSheetRuntimeLane } from './search-root-scaffold-runtime-contract';
import type {
  SearchRootSessionCoreLane,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type RootPrimitivesRuntime = {
  mapState: {
    mapRef: Parameters<typeof useSearchMapMovementState>[0]['mapRef'];
  };
};

type UseSearchRootMapRuntimeLaneArgs = {
  startupPollBounds: Parameters<typeof useSearchMapMovementState>[0]['startupPollBounds'];
  rootPrimitivesRuntime: RootPrimitivesRuntime;
  rootSessionCoreLane: Pick<
    SearchRootSessionCoreLane,
    'latestBoundsRef' | 'viewportBoundsService' | 'searchRuntimeBus'
  >;
  rootSessionPrimitivesLane: SearchRootSessionPrimitivesLane;
};

export const useSearchRootMapRuntimeLane = ({
  startupPollBounds,
  rootPrimitivesRuntime,
  rootSessionCoreLane,
  rootSessionPrimitivesLane,
}: UseSearchRootMapRuntimeLaneArgs): SearchRootResultsSheetRuntimeLane => {
  const mapMotionPressureControllerRef = React.useRef<MapMotionPressureController | null>(null);
  if (mapMotionPressureControllerRef.current == null) {
    mapMotionPressureControllerRef.current = createMapMotionPressureController();
  }
  const mapMotionPressureController = mapMotionPressureControllerRef.current;

  return {
    mapMotionPressureController,
    ...useSearchMapMovementState({
      startupPollBounds,
      latestBoundsRef: rootSessionCoreLane.latestBoundsRef,
      searchRuntimeBus: rootSessionCoreLane.searchRuntimeBus,
      viewportBoundsService: rootSessionCoreLane.viewportBoundsService,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      mapMotionPressureController,
      searchInteractionRef: rootSessionPrimitivesLane.primitives.searchInteractionRef,
      anySheetDraggingRef: rootSessionPrimitivesLane.primitives.anySheetDraggingRef,
      lastSearchBoundsCaptureSeqRef:
        rootSessionPrimitivesLane.primitives.lastSearchBoundsCaptureSeqRef,
    }),
  };
};
