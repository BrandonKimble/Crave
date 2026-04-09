import React from 'react';

export type ProfileNativeTransitionExecutionModel = {
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  getLastVisibleSheetSnap: () => 'expanded' | 'middle' | 'collapsed' | null;
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
  lastVisibleSheetStateRef: React.MutableRefObject<'expanded' | 'middle' | 'collapsed' | null>;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
};

export const useProfileNativeTransitionExecutionRuntime = ({
  emitRuntimeMechanismEvent,
  lastVisibleSheetStateRef,
  lastCameraStateRef,
}: UseProfileNativeTransitionExecutionRuntimeArgs): ProfileNativeTransitionExecutionModel => {
  const getLastVisibleSheetSnap = React.useCallback(
    () => lastVisibleSheetStateRef.current ?? null,
    [lastVisibleSheetStateRef]
  );

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
      getLastVisibleSheetSnap,
      getLastCameraState,
      setLastCameraState,
    }),
    [emitRuntimeMechanismEvent, getLastCameraState, getLastVisibleSheetSnap, setLastCameraState]
  );
};
