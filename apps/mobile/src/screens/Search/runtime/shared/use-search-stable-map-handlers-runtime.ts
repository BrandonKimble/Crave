import React from 'react';
import MapboxGL from '@rnmapbox/maps';

type MarkerBatchPayload = {
  requestKey: string;
  frameGenerationId: string | null;
  executionBatchId: string | null;
};

type MarkerBatchMountedHiddenPayload = MarkerBatchPayload & {
  readyAtMs: number;
};

type MarkerBatchStartedPayload = MarkerBatchPayload & {
  startedAtMs: number;
};

type MarkerBatchSettledPayload = MarkerBatchPayload & {
  markerEnterCommitId: number | null;
  settledAtMs: number;
};

type MarkerExitStartedPayload = {
  requestKey: string;
  startedAtMs: number;
};

type MarkerExitSettledPayload = {
  requestKey: string;
  settledAtMs: number;
};

type CameraAnimationCompletePayload = {
  animationCompletionId: string | null;
  status: 'finished' | 'cancelled';
};

type StableMapHandlers = {
  onMapPress: () => void;
  onNativeViewportChanged: (state: MapboxGL.MapState) => void;
  onMapIdle: (state: MapboxGL.MapState) => void;
  onCameraAnimationComplete: (payload: CameraAnimationCompletePayload) => void;
  onMapLoaded: () => void;
  onExecutionBatchMountedHidden: (payload: MarkerBatchMountedHiddenPayload) => void;
  onMarkerEnterStarted: (payload: MarkerBatchStartedPayload) => void;
  onMarkerEnterSettled: (payload: MarkerBatchSettledPayload) => void;
  onMarkerExitStarted: (payload: MarkerExitStartedPayload) => void;
  onMarkerExitSettled: (payload: MarkerExitSettledPayload) => void;
};

type UseSearchStableMapHandlersRuntimeArgs = {
  handleMapPress: () => void;
  handleNativeViewportChanged: (state: MapboxGL.MapState) => void;
  handleMapIdle: (state: MapboxGL.MapState) => void;
  handleCameraAnimationComplete: (payload: CameraAnimationCompletePayload) => void;
  handleMapLoaded: () => void;
  handleExecutionBatchMountedHidden: (payload: MarkerBatchMountedHiddenPayload) => void;
  handleMarkerEnterStarted: (payload: MarkerBatchStartedPayload) => void;
  handleMarkerEnterSettled: (payload: MarkerBatchSettledPayload) => void;
  handleMarkerExitStarted: (payload: MarkerExitStartedPayload) => void;
  handleMarkerExitSettled: (payload: MarkerExitSettledPayload) => void;
};

export const useSearchStableMapHandlersRuntime = ({
  handleMapPress,
  handleNativeViewportChanged,
  handleMapIdle,
  handleCameraAnimationComplete,
  handleMapLoaded,
  handleExecutionBatchMountedHidden,
  handleMarkerEnterStarted,
  handleMarkerEnterSettled,
  handleMarkerExitStarted,
  handleMarkerExitSettled,
}: UseSearchStableMapHandlersRuntimeArgs): StableMapHandlers => {
  const handleMapPressRef = React.useRef(handleMapPress);
  const handleNativeViewportChangedRef = React.useRef(handleNativeViewportChanged);
  const handleMapIdleRef = React.useRef(handleMapIdle);
  const handleCameraAnimationCompleteRef = React.useRef(handleCameraAnimationComplete);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);
  const handleExecutionBatchMountedHiddenRef = React.useRef(handleExecutionBatchMountedHidden);
  const handleMarkerEnterStartedRef = React.useRef(handleMarkerEnterStarted);
  const handleMarkerEnterSettledRef = React.useRef(handleMarkerEnterSettled);
  const handleMarkerExitStartedRef = React.useRef(handleMarkerExitStarted);
  const handleMarkerExitSettledRef = React.useRef(handleMarkerExitSettled);

  handleMapPressRef.current = handleMapPress;
  handleNativeViewportChangedRef.current = handleNativeViewportChanged;
  handleMapIdleRef.current = handleMapIdle;
  handleCameraAnimationCompleteRef.current = handleCameraAnimationComplete;
  handleMapLoadedRef.current = handleMapLoaded;
  handleExecutionBatchMountedHiddenRef.current = handleExecutionBatchMountedHidden;
  handleMarkerEnterStartedRef.current = handleMarkerEnterStarted;
  handleMarkerEnterSettledRef.current = handleMarkerEnterSettled;
  handleMarkerExitStartedRef.current = handleMarkerExitStarted;
  handleMarkerExitSettledRef.current = handleMarkerExitSettled;

  const stableMapHandlersRef = React.useRef<StableMapHandlers | null>(null);
  if (!stableMapHandlersRef.current) {
    stableMapHandlersRef.current = {
      onMapPress: () => {
        handleMapPressRef.current();
      },
      onNativeViewportChanged: (state) => {
        handleNativeViewportChangedRef.current(state);
      },
      onMapIdle: (state) => {
        handleMapIdleRef.current(state);
      },
      onCameraAnimationComplete: (payload) => {
        handleCameraAnimationCompleteRef.current(payload);
      },
      onMapLoaded: () => {
        handleMapLoadedRef.current();
      },
      onExecutionBatchMountedHidden: (payload) => {
        handleExecutionBatchMountedHiddenRef.current(payload);
      },
      onMarkerEnterStarted: (payload) => {
        handleMarkerEnterStartedRef.current(payload);
      },
      onMarkerEnterSettled: (payload) => {
        handleMarkerEnterSettledRef.current(payload);
      },
      onMarkerExitStarted: (payload) => {
        handleMarkerExitStartedRef.current(payload);
      },
      onMarkerExitSettled: (payload) => {
        handleMarkerExitSettledRef.current(payload);
      },
    };
  }

  return stableMapHandlersRef.current;
};
