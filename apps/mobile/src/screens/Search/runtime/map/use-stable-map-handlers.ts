import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { Coordinate } from '../../../../types';

type UseStableMapHandlersArgs = {
  handleMapPress: () => void;
  handleNativeViewportChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapLoaded: () => void;
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  handleRevealBatchMountedHidden: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    readyAtMs: number;
  }) => void;
  handleMarkerRevealStarted: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    startedAtMs: number;
  }) => void;
  handleMarkerRevealFirstVisibleFrame: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    syncedAtMs: number;
  }) => void;
  handleMarkerRevealSettled: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  handleMarkerDismissStarted: (payload: { requestKey: string; startedAtMs: number }) => void;
  handleMarkerDismissSettled: (payload: { requestKey: string; settledAtMs: number }) => void;
};

type StableMapHandlers = {
  onMapPress: () => void;
  onNativeViewportChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onRevealBatchMountedHidden: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerRevealStarted: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    startedAtMs: number;
  }) => void;
  onMarkerRevealFirstVisibleFrame: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    syncedAtMs: number;
  }) => void;
  onMarkerRevealSettled: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
  onMarkerDismissStarted: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerDismissSettled: (payload: { requestKey: string; settledAtMs: number }) => void;
};

export const useStableMapHandlers = ({
  handleMapPress,
  handleNativeViewportChanged,
  handleMapIdle,
  handleMapLoaded,
  handleMarkerPress,
  handleRevealBatchMountedHidden,
  handleMarkerRevealStarted,
  handleMarkerRevealFirstVisibleFrame,
  handleMarkerRevealSettled,
  handleMarkerDismissStarted,
  handleMarkerDismissSettled,
}: UseStableMapHandlersArgs): StableMapHandlers => {
  const handleMapPressRef = React.useRef(handleMapPress);
  const handleNativeViewportChangedRef = React.useRef(handleNativeViewportChanged);
  const handleMapIdleRef = React.useRef(handleMapIdle);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);
  const handleMarkerPressRef = React.useRef(handleMarkerPress);
  const handleRevealBatchMountedHiddenRef = React.useRef(handleRevealBatchMountedHidden);
  const handleMarkerRevealStartedRef = React.useRef(handleMarkerRevealStarted);
  const handleMarkerRevealFirstVisibleFrameRef = React.useRef(handleMarkerRevealFirstVisibleFrame);
  const handleMarkerRevealSettledRef = React.useRef(handleMarkerRevealSettled);
  const handleMarkerDismissStartedRef = React.useRef(handleMarkerDismissStarted);
  const handleMarkerDismissSettledRef = React.useRef(handleMarkerDismissSettled);

  handleMapPressRef.current = handleMapPress;
  handleNativeViewportChangedRef.current = handleNativeViewportChanged;
  handleMapIdleRef.current = handleMapIdle;
  handleMapLoadedRef.current = handleMapLoaded;
  handleMarkerPressRef.current = handleMarkerPress;
  handleRevealBatchMountedHiddenRef.current = handleRevealBatchMountedHidden;
  handleMarkerRevealStartedRef.current = handleMarkerRevealStarted;
  handleMarkerRevealFirstVisibleFrameRef.current = handleMarkerRevealFirstVisibleFrame;
  handleMarkerRevealSettledRef.current = handleMarkerRevealSettled;
  handleMarkerDismissStartedRef.current = handleMarkerDismissStarted;
  handleMarkerDismissSettledRef.current = handleMarkerDismissSettled;

  const stableMapHandlersRef = React.useRef<StableMapHandlers | null>(null);

  if (!stableMapHandlersRef.current) {
    stableMapHandlersRef.current = {
      onMapPress: () => {
        handleMapPressRef.current();
      },
      onNativeViewportChanged: (state: MapboxMapState) => {
        handleNativeViewportChangedRef.current(state);
      },
      onMapIdle: (state: MapboxMapState) => {
        handleMapIdleRef.current(state);
      },
      onMapLoaded: () => {
        handleMapLoadedRef.current();
      },
      onMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
        handleMarkerPressRef.current(restaurantId, pressedCoordinate);
      },
      onRevealBatchMountedHidden: (payload) => {
        handleRevealBatchMountedHiddenRef.current(payload);
      },
      onMarkerRevealStarted: (payload) => {
        handleMarkerRevealStartedRef.current(payload);
      },
      onMarkerRevealFirstVisibleFrame: (payload) => {
        handleMarkerRevealFirstVisibleFrameRef.current(payload);
      },
      onMarkerRevealSettled: (payload) => {
        handleMarkerRevealSettledRef.current(payload);
      },
      onMarkerDismissStarted: (payload) => {
        handleMarkerDismissStartedRef.current(payload);
      },
      onMarkerDismissSettled: (payload) => {
        handleMarkerDismissSettledRef.current(payload);
      },
    };
  }

  return stableMapHandlersRef.current;
};
