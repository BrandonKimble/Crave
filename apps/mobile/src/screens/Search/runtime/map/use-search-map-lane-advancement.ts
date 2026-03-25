import React from 'react';

import {
  type SearchRuntimeBus,
  isSearchRuntimeMapPresentationSettled,
} from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

export const useSearchMapLaneAdvancement = ({
  searchRuntimeBus,
  shouldDeferMapFromPressure,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  shouldDeferMapFromPressure: boolean;
}): void => {
  const mapPresentationPhase = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.mapPresentationPhase,
    Object.is,
    ['mapPresentationPhase'] as const
  );

  React.useEffect(() => {
    let animationFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const clearScheduledRelease = () => {
      if (animationFrameHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
      if (timeoutHandle != null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const releaseIdleIfReady = (operationId: string) => {
      const state = searchRuntimeBus.getState();
      if (
        state.activeOperationId !== operationId ||
        state.activeOperationLane !== 'lane_f_polish'
      ) {
        return;
      }
      if (
        !isSearchRuntimeMapPresentationSettled(state.mapPresentationPhase) ||
        shouldDeferMapFromPressure
      ) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'idle',
        activeOperationId: null,
      });
    };

    const scheduleRelease = (operationId: string) => {
      clearScheduledRelease();
      if (typeof requestAnimationFrame === 'function') {
        animationFrameHandle = requestAnimationFrame(() => {
          animationFrameHandle = null;
          releaseIdleIfReady(operationId);
        });
        return;
      }
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        releaseIdleIfReady(operationId);
      }, 0);
    };

    const maybeAdvancePolishLane = () => {
      const state = searchRuntimeBus.getState();
      const operationId = state.activeOperationId;
      if (!operationId || state.activeOperationLane !== 'lane_e_map_pins') {
        return;
      }
      if (
        !isSearchRuntimeMapPresentationSettled(state.mapPresentationPhase) ||
        shouldDeferMapFromPressure
      ) {
        return;
      }
      searchRuntimeBus.publish({
        activeOperationLane: 'lane_f_polish',
      });
      scheduleRelease(operationId);
    };

    maybeAdvancePolishLane();
    const unsubscribe = searchRuntimeBus.subscribe(maybeAdvancePolishLane, [
      'activeOperationId',
      'activeOperationLane',
      'mapPresentationPhase',
    ]);

    return () => {
      unsubscribe();
      clearScheduledRelease();
    };
  }, [mapPresentationPhase, searchRuntimeBus, shouldDeferMapFromPressure]);
};
