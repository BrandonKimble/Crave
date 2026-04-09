import React from 'react';

import type { MapBounds } from '../../../types';
import type { MapboxMapRef } from '../components/search-map';
import {
  type MapMotionPressureController,
  shouldDeferMapMovementWork,
} from '../runtime/map/map-motion-pressure';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import { boundsFromPairs, hasBoundsMovedSignificantly, isLngLatTuple } from '../utils/geo';

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsListScrolling: boolean;
};

type UseSearchMapMovementStateArgs = {
  startupPollBounds: MapBounds | null;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  viewportBoundsService: ViewportBoundsService;
  mapRef: React.RefObject<MapboxMapRef | null>;
  mapMotionPressureController: MapMotionPressureController;
  searchInteractionRef: React.MutableRefObject<SearchInteractionState>;
  anySheetDraggingRef: React.MutableRefObject<boolean>;
  lastSearchBoundsCaptureSeqRef: React.MutableRefObject<number>;
  shouldShowPollsSheet: boolean;
};

type UseSearchMapMovementStateResult = {
  pollBounds: MapBounds | null;
  mapMovedSinceSearch: boolean;
  mapGestureActiveRef: React.MutableRefObject<boolean>;
  pollBoundsRef: React.MutableRefObject<MapBounds | null>;
  cancelPendingMapMovementUpdates: () => void;
  resetMapMoveFlag: () => void;
  markMapMovedIfNeeded: (bounds: MapBounds) => boolean;
  scheduleMapIdleEnter: () => void;
  schedulePollBoundsUpdate: (bounds: MapBounds) => void;
  flushDeferredMapMovementState: () => void;
  resolveCurrentMapBounds: () => Promise<MapBounds | null>;
};

const shouldMarkMapMovedForBounds = ({
  baselineBounds,
  nextBounds,
  hasMapMovedSinceSearch,
}: {
  baselineBounds: MapBounds | null;
  nextBounds: MapBounds;
  hasMapMovedSinceSearch: boolean;
}): boolean => {
  if (hasMapMovedSinceSearch) {
    return true;
  }
  if (baselineBounds == null) {
    return false;
  }
  return hasBoundsMovedSignificantly(baselineBounds, nextBounds);
};

const shouldPublishPollBoundsUpdate = ({
  currentPollBounds,
  nextBounds,
}: {
  currentPollBounds: MapBounds | null;
  nextBounds: MapBounds;
}): boolean => {
  return currentPollBounds == null || hasBoundsMovedSignificantly(currentPollBounds, nextBounds);
};

const resolveMapMovedEnterAdmission = ({
  hasMapMovedSinceSearch,
  isMapGestureActive,
  isSearchInteracting,
  isAnySheetDragging,
  shouldDeferMapFromPressure,
}: {
  hasMapMovedSinceSearch: boolean;
  isMapGestureActive: boolean;
  isSearchInteracting: boolean;
  isAnySheetDragging: boolean;
  shouldDeferMapFromPressure: boolean;
}): 'publish_now' | 'defer_until_idle' | 'skip_no_move' => {
  if (!hasMapMovedSinceSearch) {
    return 'skip_no_move';
  }
  if (
    shouldDeferMapFromPressure ||
    isMapGestureActive ||
    isSearchInteracting ||
    isAnySheetDragging
  ) {
    return 'defer_until_idle';
  }
  return 'publish_now';
};

export const useSearchMapMovementState = ({
  startupPollBounds,
  latestBoundsRef,
  viewportBoundsService,
  mapRef,
  mapMotionPressureController,
  searchInteractionRef,
  anySheetDraggingRef,
  lastSearchBoundsCaptureSeqRef,
  shouldShowPollsSheet,
}: UseSearchMapMovementStateArgs): UseSearchMapMovementStateResult => {
  const [pollBounds, setPollBounds] = React.useState<MapBounds | null>(() => startupPollBounds);
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = React.useState(false);
  const mapMovedSinceSearchRef = React.useRef(false);
  const pendingMapMovedEnterRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const pollBoundsRef = React.useRef<MapBounds | null>(startupPollBounds);
  const pendingPollBoundsRef = React.useRef<MapBounds | null>(null);

  const cancelPendingMapMovementUpdates = React.useCallback(() => {
    pendingPollBoundsRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!startupPollBounds) {
      return;
    }
    if (!latestBoundsRef.current) {
      viewportBoundsService.setBounds(startupPollBounds);
    }
    if (pollBoundsRef.current) {
      return;
    }
    pollBoundsRef.current = startupPollBounds;
    setPollBounds(startupPollBounds);
  }, [latestBoundsRef, startupPollBounds, viewportBoundsService]);

  const resetMapMoveFlag = React.useCallback(() => {
    pendingMapMovedEnterRef.current = false;
    const captureSeq = ++lastSearchBoundsCaptureSeqRef.current;
    const boundsSnapshot = viewportBoundsService.getBounds();
    if (boundsSnapshot) {
      viewportBoundsService.captureSearchBaseline(boundsSnapshot);
    } else {
      const boundsCandidate = mapRef.current?.getVisibleBounds?.();
      if (boundsCandidate) {
        void boundsCandidate.then((visibleBounds) => {
          if (lastSearchBoundsCaptureSeqRef.current !== captureSeq) {
            return;
          }
          if (
            !visibleBounds ||
            visibleBounds.length < 2 ||
            !isLngLatTuple(visibleBounds[0]) ||
            !isLngLatTuple(visibleBounds[1])
          ) {
            return;
          }
          const bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
          viewportBoundsService.setBounds(bounds);
          viewportBoundsService.captureSearchBaseline(bounds);
        });
      }
    }
    mapMovedSinceSearchRef.current = false;
    setMapMovedSinceSearch(false);
  }, [lastSearchBoundsCaptureSeqRef, mapRef, viewportBoundsService]);

  const markMapMovedIfNeeded = React.useCallback(
    (bounds: MapBounds) => {
      if (
        !shouldMarkMapMovedForBounds({
          baselineBounds: viewportBoundsService.getSearchBaselineBounds(),
          nextBounds: bounds,
          hasMapMovedSinceSearch: mapMovedSinceSearchRef.current,
        })
      ) {
        return false;
      }
      mapMovedSinceSearchRef.current = true;
      return true;
    },
    [viewportBoundsService]
  );

  const scheduleMapIdleEnter = React.useCallback(() => {
    const shouldDeferMapFromPressure = shouldDeferMapMovementWork({
      pressureState: mapMotionPressureController.getState(),
    });
    const mapMovedRevealAdmission = resolveMapMovedEnterAdmission({
      hasMapMovedSinceSearch: mapMovedSinceSearchRef.current,
      isMapGestureActive: mapGestureActiveRef.current,
      isSearchInteracting: searchInteractionRef.current.isInteracting,
      isAnySheetDragging: anySheetDraggingRef.current,
      shouldDeferMapFromPressure,
    });
    pendingMapMovedEnterRef.current = mapMovedRevealAdmission === 'defer_until_idle';
    if (mapMovedRevealAdmission === 'publish_now') {
      setMapMovedSinceSearch(true);
    }
  }, [anySheetDraggingRef, mapMotionPressureController, searchInteractionRef]);

  const flushPendingMapMovedEnter = React.useCallback(() => {
    if (!pendingMapMovedEnterRef.current) {
      return;
    }
    scheduleMapIdleEnter();
  }, [scheduleMapIdleEnter]);

  const flushPendingPollBoundsUpdate = React.useCallback(() => {
    const nextPollBounds = pendingPollBoundsRef.current;
    if (!nextPollBounds) {
      return;
    }
    if (
      shouldDeferMapMovementWork({
        pressureState: mapMotionPressureController.getState(),
      })
    ) {
      return;
    }
    pendingPollBoundsRef.current = null;
    pollBoundsRef.current = nextPollBounds;
    setPollBounds(nextPollBounds);
  }, [mapMotionPressureController]);

  const flushDeferredMapMovementState = React.useCallback(() => {
    flushPendingPollBoundsUpdate();
    flushPendingMapMovedEnter();
  }, [flushPendingMapMovedEnter, flushPendingPollBoundsUpdate]);

  const schedulePollBoundsUpdate = React.useCallback(
    (bounds: MapBounds) => {
      if (
        !shouldPublishPollBoundsUpdate({
          currentPollBounds: pollBoundsRef.current,
          nextBounds: bounds,
        })
      ) {
        pendingPollBoundsRef.current = null;
        return;
      }
      pendingPollBoundsRef.current = bounds;
      flushDeferredMapMovementState();
    },
    [flushDeferredMapMovementState]
  );

  const resolveCurrentMapBounds = React.useCallback(async (): Promise<MapBounds | null> => {
    const currentBounds = viewportBoundsService.getBounds();
    if (currentBounds) {
      return currentBounds;
    }
    const rawBounds = await mapRef.current?.getVisibleBounds?.();
    if (!rawBounds || rawBounds.length < 2) {
      return null;
    }
    const first = rawBounds[0] as unknown;
    const second = rawBounds[1] as unknown;
    if (!isLngLatTuple(first) || !isLngLatTuple(second)) {
      return null;
    }
    const bounds = boundsFromPairs(first, second);
    viewportBoundsService.setBounds(bounds);
    return bounds;
  }, [mapRef, viewportBoundsService]);

  React.useEffect(() => {
    if (!shouldShowPollsSheet) {
      return;
    }
    if (latestBoundsRef.current) {
      pollBoundsRef.current = latestBoundsRef.current;
      setPollBounds(latestBoundsRef.current);
      return;
    }
    void resolveCurrentMapBounds().then((bounds) => {
      if (!bounds) {
        return;
      }
      pollBoundsRef.current = bounds;
      setPollBounds(bounds);
    });
  }, [latestBoundsRef, resolveCurrentMapBounds, shouldShowPollsSheet]);

  return {
    pollBounds,
    mapMovedSinceSearch,
    mapGestureActiveRef,
    pollBoundsRef,
    cancelPendingMapMovementUpdates,
    resetMapMoveFlag,
    markMapMovedIfNeeded,
    scheduleMapIdleEnter,
    schedulePollBoundsUpdate,
    flushDeferredMapMovementState,
    resolveCurrentMapBounds,
  };
};
