import React from 'react';
import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { Coordinate } from '../../../../types';

type UseStableMapHandlersArgs = {
  handleMapPress: () => void;
  handleCameraChanged: (state: MapboxMapState) => void;
  handleMapIdle: (state: MapboxMapState) => void;
  handleMapLoaded: () => void;
  handleMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  handleMapVisualReady: (requestKey: string) => void;
  handleMarkerRevealStarted: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    startedAtMs: number;
  }) => void;
  handleMarkerRevealSettled: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
};

type StableMapHandlers = {
  onMapPress: () => void;
  onCameraChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMarkerPress: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  onMapVisualReady: (requestKey: string) => void;
  onMarkerRevealStarted: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    startedAtMs: number;
  }) => void;
  onMarkerRevealSettled: (payload: {
    requestKey: string;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  }) => void;
};

export const useStableMapHandlers = ({
  handleMapPress,
  handleCameraChanged,
  handleMapIdle,
  handleMapLoaded,
  handleMarkerPress,
  handleMapVisualReady,
  handleMarkerRevealStarted,
  handleMarkerRevealSettled,
}: UseStableMapHandlersArgs): StableMapHandlers => {
  const handleMapPressRef = React.useRef(handleMapPress);
  const handleCameraChangedRef = React.useRef(handleCameraChanged);
  const handleMapIdleRef = React.useRef(handleMapIdle);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);
  const handleMarkerPressRef = React.useRef(handleMarkerPress);
  const handleMapVisualReadyRef = React.useRef(handleMapVisualReady);
  const handleMarkerRevealStartedRef = React.useRef(handleMarkerRevealStarted);
  const handleMarkerRevealSettledRef = React.useRef(handleMarkerRevealSettled);

  handleMapPressRef.current = handleMapPress;
  handleCameraChangedRef.current = handleCameraChanged;
  handleMapIdleRef.current = handleMapIdle;
  handleMapLoadedRef.current = handleMapLoaded;
  handleMarkerPressRef.current = handleMarkerPress;
  handleMapVisualReadyRef.current = handleMapVisualReady;
  handleMarkerRevealStartedRef.current = handleMarkerRevealStarted;
  handleMarkerRevealSettledRef.current = handleMarkerRevealSettled;

  const stableMapHandlersRef = React.useRef<StableMapHandlers | null>(null);

  if (!stableMapHandlersRef.current) {
    stableMapHandlersRef.current = {
      onMapPress: () => {
        handleMapPressRef.current();
      },
      onCameraChanged: (state: MapboxMapState) => {
        handleCameraChangedRef.current(state);
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
      onMapVisualReady: (requestKey: string) => {
        handleMapVisualReadyRef.current(requestKey);
      },
      onMarkerRevealStarted: (payload) => {
        handleMarkerRevealStartedRef.current(payload);
      },
      onMarkerRevealSettled: (payload) => {
        handleMarkerRevealSettledRef.current(payload);
      },
    };
  }

  return stableMapHandlersRef.current;
};
