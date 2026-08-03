import { logger } from '../../../../utils';

type SearchInteractionState = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type MapInteractionDiagnosticsState = {
  cameraChanged: number;
  mapIdle: number;
  lastLog: number;
};

export type MapInteractionDiagnostics = {
  recordCameraChanged: () => void;
  recordMapIdle: () => void;
  logAutoCollapse: (payload: {
    movedMiles: number;
    zoomDelta: number;
    eventCount: number;
    sheetState: string;
    touchActive: boolean;
    startedOpen: boolean;
  }) => void;
};

export const createMapInteractionDiagnostics = ({
  enabled,
  logIntervalMs,
  shouldLogSearchStateChanges,
  state,
  getSearchInteractionState,
}: {
  enabled: boolean;
  logIntervalMs: number;
  shouldLogSearchStateChanges: boolean;
  state: MapInteractionDiagnosticsState;
  getSearchInteractionState: () => SearchInteractionState;
}): MapInteractionDiagnostics => {
  // D45/F1070: a non-positive window silently turns the rate limiter below into
  // "log on every event" — `now - lastLog < 0` is never true. This module is
  // dormant behind a `false` flag, so that defect could sit here indefinitely
  // and only bite the person who flips the flag while debugging something else.
  // The caller now passes a real interval; this clamp means a future caller
  // cannot reintroduce the firehose by passing 0.
  const flushIntervalMs = Math.max(1, logIntervalMs);
  const maybeFlushRates = () => {
    if (!enabled) {
      return;
    }
    const now = Date.now();
    if (state.lastLog === 0) {
      state.lastLog = now;
      return;
    }
    if (now - state.lastLog < flushIntervalMs) {
      return;
    }
    const interactionState = getSearchInteractionState();
    logger.debug('[SearchPerf] Map events', {
      windowMs: flushIntervalMs,
      cameraChanged: state.cameraChanged,
      mapIdle: state.mapIdle,
      drag: interactionState.isResultsSheetDragging,
      scroll: interactionState.isResultsListScrolling,
      settle: interactionState.isResultsSheetSettling,
    });
    state.cameraChanged = 0;
    state.mapIdle = 0;
    state.lastLog = now;
  };

  return {
    recordCameraChanged: () => {
      if (!enabled) {
        return;
      }
      state.cameraChanged += 1;
      maybeFlushRates();
    },
    recordMapIdle: () => {
      if (!enabled) {
        return;
      }
      state.mapIdle += 1;
      maybeFlushRates();
    },
    logAutoCollapse: ({
      movedMiles,
      zoomDelta,
      eventCount,
      sheetState,
      touchActive,
      startedOpen,
    }) => {
      if (!shouldLogSearchStateChanges) {
        return;
      }
      logger.debug('[SearchPerf] AutoSnap collapsed', {
        reason: 'mapGesture',
        movedMiles: Number(movedMiles.toFixed(4)),
        zoomDelta: Number(zoomDelta.toFixed(3)),
        eventCount,
        sheetState,
        touchActive,
        startedOpen,
      });
    },
  };
};
