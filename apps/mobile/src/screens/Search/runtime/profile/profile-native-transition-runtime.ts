import React from 'react';

export type ProfileNativeTransitionExecutionModel = {
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  getLastCameraState: () => {
    center: [number, number];
    zoom: number;
  } | null;
  setLastCameraState: (
    state: {
      center: [number, number];
      zoom: number;
    } | null
  ) => void;
};

type UseProfileNativeTransitionExecutionRuntimeArgs = {
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
};

export const useProfileNativeTransitionExecutionRuntime = ({
  emitRuntimeMechanismEvent,
  lastCameraStateRef,
}: UseProfileNativeTransitionExecutionRuntimeArgs): ProfileNativeTransitionExecutionModel => {
  const getLastCameraState = React.useCallback(
    () => lastCameraStateRef.current,
    [lastCameraStateRef]
  );

  const setLastCameraState = React.useCallback(
    (state: { center: [number, number]; zoom: number } | null) => {
      lastCameraStateRef.current = state;
    },
    [lastCameraStateRef]
  );

  return React.useMemo(
    () => ({
      emitRuntimeMechanismEvent,
      getLastCameraState,
      setLastCameraState,
    }),
    [emitRuntimeMechanismEvent, getLastCameraState, setLastCameraState]
  );
};
