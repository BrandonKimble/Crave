import React from 'react';

import { calculateSnapPoints } from '../../../../overlays/sheetUtils';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
type ProfileTransitionStatus = 'idle' | 'opening' | 'open' | 'closing';

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

type CameraSnapshot = {
  center: [number, number];
  zoom: number;
  padding: MapCameraPadding | null;
};

type ProfileTransitionState = {
  status: ProfileTransitionStatus;
  savedSheetSnap: Exclude<OverlaySheetSnap, 'hidden'> | null;
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

type SnapPoints = {
  expanded: number;
  middle: number;
  collapsed: number;
};

type UseProfileCameraOrchestrationArgs = {
  cameraPersistTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  cameraStateSyncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  cameraCommandFrameRef: React.MutableRefObject<number | null>;
  profileTransitionTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  profileTransitionRef: React.MutableRefObject<ProfileTransitionState>;
  lastVisibleSheetStateRef: React.MutableRefObject<Exclude<OverlaySheetSnap, 'hidden'>>;
  lastCameraStateRef: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  resultsScrollOffset: { value: number };
  sheetTranslateY: { value: number };
  snapPoints: SnapPoints;
  sheetState: OverlaySheetSnap;
  mapCenter: [number, number] | null;
  mapZoom: number | null;
  mapCameraPadding: MapCameraPadding | null;
  setMapCameraPadding: React.Dispatch<React.SetStateAction<MapCameraPadding | null>>;
  setProfileTransitionStatusState: React.Dispatch<React.SetStateAction<ProfileTransitionStatus>>;
  commitCameraViewport: (payload: { center: [number, number]; zoom: number }) => boolean;
  searchBarTop: number;
  searchBarHeight: number;
  insetsTop: number;
  navBarTop: number;
  screenHeight: number;
  profilePinTargetCenterRatio: number;
  profilePinMinVisibleHeight: number;
  profileTransitionLockMs: number;
  profileCameraAnimationMs: number;
  fitBoundsSyncBufferMs: number;
  fallbackCenter: [number, number];
  fallbackZoom: number;
};

type UseProfileCameraOrchestrationResult = {
  clearCameraPersistTimeout: () => void;
  clearCameraStateSync: () => void;
  scheduleCameraCommand: (command: () => void) => void;
  commitCameraState: (payload: {
    center: [number, number];
    zoom: number;
    padding?: MapCameraPadding | null;
  }) => boolean;
  scheduleCameraStateCommit: (
    payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null },
    delayMs?: number
  ) => void;
  clearProfileTransitionLock: () => void;
  setProfileTransitionStatus: (
    status: ProfileTransitionStatus,
    settleTo?: ProfileTransitionStatus
  ) => void;
  captureCameraSnapshot: () => CameraSnapshot | null;
  ensureProfileTransitionSnapshot: () => void;
  resolveProfileCameraPadding: () => MapCameraPadding;
};

export const useProfileCameraOrchestration = ({
  cameraPersistTimeoutRef,
  cameraStateSyncTimeoutRef,
  cameraCommandFrameRef,
  profileTransitionTimeoutRef,
  profileTransitionRef,
  lastVisibleSheetStateRef,
  lastCameraStateRef,
  resultsScrollOffset,
  sheetTranslateY,
  snapPoints,
  sheetState,
  mapCenter,
  mapZoom,
  mapCameraPadding,
  setMapCameraPadding,
  setProfileTransitionStatusState,
  commitCameraViewport,
  searchBarTop,
  searchBarHeight,
  insetsTop,
  navBarTop,
  screenHeight,
  profilePinTargetCenterRatio,
  profilePinMinVisibleHeight,
  profileTransitionLockMs,
  profileCameraAnimationMs,
  fitBoundsSyncBufferMs,
  fallbackCenter,
  fallbackZoom,
}: UseProfileCameraOrchestrationArgs): UseProfileCameraOrchestrationResult => {
  const clearCameraPersistTimeout = React.useCallback(() => {
    if (cameraPersistTimeoutRef.current) {
      clearTimeout(cameraPersistTimeoutRef.current);
      cameraPersistTimeoutRef.current = null;
    }
  }, [cameraPersistTimeoutRef]);

  const clearCameraStateSync = React.useCallback(() => {
    if (cameraStateSyncTimeoutRef.current) {
      clearTimeout(cameraStateSyncTimeoutRef.current);
      cameraStateSyncTimeoutRef.current = null;
    }
  }, [cameraStateSyncTimeoutRef]);

  const scheduleCameraCommand = React.useCallback(
    (command: () => void) => {
      if (cameraCommandFrameRef.current != null) {
        cancelAnimationFrame(cameraCommandFrameRef.current);
        cameraCommandFrameRef.current = null;
      }
      command();
    },
    [cameraCommandFrameRef]
  );

  const commitCameraState = React.useCallback(
    (payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null }) => {
      const didCommit = commitCameraViewport({
        center: payload.center,
        zoom: payload.zoom,
      });
      if (!didCommit) {
        return false;
      }
      setMapCameraPadding(payload.padding ?? null);
      lastCameraStateRef.current = { center: payload.center, zoom: payload.zoom };
      return true;
    },
    [commitCameraViewport, lastCameraStateRef, setMapCameraPadding]
  );

  const scheduleCameraStateCommit = React.useCallback(
    (
      payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null },
      delayMs = profileCameraAnimationMs + fitBoundsSyncBufferMs
    ) => {
      clearCameraStateSync();
      cameraStateSyncTimeoutRef.current = setTimeout(() => {
        cameraStateSyncTimeoutRef.current = null;
        commitCameraState(payload);
      }, delayMs);
    },
    [
      cameraStateSyncTimeoutRef,
      clearCameraStateSync,
      commitCameraState,
      fitBoundsSyncBufferMs,
      profileCameraAnimationMs,
    ]
  );

  const clearProfileTransitionLock = React.useCallback(() => {
    if (profileTransitionTimeoutRef.current) {
      clearTimeout(profileTransitionTimeoutRef.current);
      profileTransitionTimeoutRef.current = null;
    }
  }, [profileTransitionTimeoutRef]);

  const setProfileTransitionStatus = React.useCallback(
    (status: ProfileTransitionStatus, settleTo?: ProfileTransitionStatus) => {
      profileTransitionRef.current.status = status;
      setProfileTransitionStatusState(status);
      clearProfileTransitionLock();
      if (settleTo) {
        profileTransitionTimeoutRef.current = setTimeout(() => {
          profileTransitionRef.current.status = settleTo;
          setProfileTransitionStatusState(settleTo);
        }, profileTransitionLockMs);
      }
    },
    [
      clearProfileTransitionLock,
      profileTransitionLockMs,
      profileTransitionRef,
      profileTransitionTimeoutRef,
      setProfileTransitionStatusState,
    ]
  );

  const captureCameraSnapshot = React.useCallback((): CameraSnapshot | null => {
    const current = lastCameraStateRef.current;
    const center = current?.center ?? mapCenter ?? fallbackCenter;
    const zoom = current?.zoom ?? mapZoom ?? fallbackZoom;
    if (!center || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
      return null;
    }
    return {
      center: [center[0], center[1]],
      zoom,
      padding: mapCameraPadding ? { ...mapCameraPadding } : null,
    };
  }, [fallbackCenter, fallbackZoom, lastCameraStateRef, mapCameraPadding, mapCenter, mapZoom]);

  const ensureProfileTransitionSnapshot = React.useCallback(() => {
    const transition = profileTransitionRef.current;
    const captureCurrentResultsSheetSnap = (): Exclude<OverlaySheetSnap, 'hidden'> => {
      const y = sheetTranslateY.value;
      if (typeof y === 'number' && Number.isFinite(y)) {
        const candidates: Array<Exclude<OverlaySheetSnap, 'hidden'>> = [
          'expanded',
          'middle',
          'collapsed',
        ];
        let bestSnap: Exclude<OverlaySheetSnap, 'hidden'> = lastVisibleSheetStateRef.current;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of candidates) {
          const targetY = snapPoints[candidate];
          const distance = Math.abs(y - targetY);
          if (distance < bestDistance) {
            bestSnap = candidate;
            bestDistance = distance;
          }
        }
        return bestSnap;
      }
      if (sheetState !== 'hidden') {
        return sheetState;
      }
      return lastVisibleSheetStateRef.current;
    };
    if (!transition.savedSheetSnap) {
      transition.savedSheetSnap = captureCurrentResultsSheetSnap();
    }
    if (!transition.savedCamera) {
      const snapshot = captureCameraSnapshot();
      if (snapshot) {
        transition.savedCamera = snapshot;
      }
    }
    if (transition.savedResultsScrollOffset === null) {
      transition.savedResultsScrollOffset = resultsScrollOffset.value;
    }
  }, [
    captureCameraSnapshot,
    lastVisibleSheetStateRef,
    profileTransitionRef,
    resultsScrollOffset,
    sheetState,
    sheetTranslateY,
    snapPoints,
  ]);

  const resolveProfileCameraPadding = React.useCallback((): MapCameraPadding => {
    const snaps = calculateSnapPoints(screenHeight, searchBarTop, insetsTop, navBarTop, 0);
    const topPadding = Math.max(searchBarTop + searchBarHeight, snaps.expanded);
    const desiredCenter = screenHeight * profilePinTargetCenterRatio;
    const minCenter = topPadding + profilePinMinVisibleHeight / 2;
    const targetCenter = Math.max(desiredCenter, minCenter);
    const bottomPadding = Math.max(screenHeight + topPadding - 2 * targetCenter, 0);
    return {
      paddingTop: topPadding,
      paddingBottom: bottomPadding,
      paddingLeft: 0,
      paddingRight: 0,
    };
  }, [
    insetsTop,
    navBarTop,
    profilePinMinVisibleHeight,
    profilePinTargetCenterRatio,
    screenHeight,
    searchBarHeight,
    searchBarTop,
  ]);

  return {
    clearCameraPersistTimeout,
    clearCameraStateSync,
    scheduleCameraCommand,
    commitCameraState,
    scheduleCameraStateCommit,
    clearProfileTransitionLock,
    setProfileTransitionStatus,
    captureCameraSnapshot,
    ensureProfileTransitionSnapshot,
    resolveProfileCameraPadding,
  };
};
