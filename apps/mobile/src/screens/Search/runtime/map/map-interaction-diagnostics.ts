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
  const maybeFlushRates = () => {
    if (!enabled) {
      return;
    }
    const now = Date.now();
    if (state.lastLog === 0) {
      state.lastLog = now;
      return;
    }
    if (now - state.lastLog < logIntervalMs) {
      return;
    }
    const interactionState = getSearchInteractionState();
    logger.debug('[SearchPerf] Map events', {
      windowMs: logIntervalMs,
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
