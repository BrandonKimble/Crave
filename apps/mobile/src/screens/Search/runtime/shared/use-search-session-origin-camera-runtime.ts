import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootCameraViewportRuntime } from './use-search-root-session-runtime-contract';

// Camera-in-origin (owner decision 2026-07-10): a terminal search dismiss puts the camera
// back to the viewport the SEARCH WAS TRIGGERED from — the live camera at the instant the
// desired identity left 'idle' (the same instant the search call's initial viewport was
// captured). One capture per SESSION (session_replace keeps the original origin: the X
// returns to where the user was BEFORE searching, however many searches deep they went);
// one restore, committed through the CameraIntentArbiter at the exit write. Profile pops
// keep their own savedCamera channel — this lane only speaks at the session boundary, so
// the two writers can never overlap.
export const useSearchSessionOriginCameraRuntime = ({
  searchRuntimeBus,
  lastCameraStateRef,
  commitCameraViewport,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  lastCameraStateRef: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  commitCameraViewport: SearchRootCameraViewportRuntime['commitCameraViewport'];
}): void => {
  const sessionOriginCameraRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const wasIdleRef = React.useRef(true);

  React.useEffect(() => {
    const syncFromState = () => {
      const isIdle = searchRuntimeBus.getState().desiredTuple.queryIdentity.kind === 'idle';
      if (wasIdleRef.current === isIdle) {
        return;
      }
      wasIdleRef.current = isIdle;
      if (!isIdle) {
        // Session ENTER (idle → set): snapshot the trigger viewport once.
        if (sessionOriginCameraRef.current == null) {
          const liveCamera = lastCameraStateRef.current;
          sessionOriginCameraRef.current = liveCamera
            ? { center: [...liveCamera.center] as [number, number], zoom: liveCamera.zoom }
            : null;
        }
        return;
      }
      // Session EXIT (set → idle): glide the camera home with the dismissal.
      const originCamera = sessionOriginCameraRef.current;
      sessionOriginCameraRef.current = null;
      if (originCamera != null) {
        commitCameraViewport(
          { center: originCamera.center, zoom: originCamera.zoom, padding: null },
          { allowDuringGesture: true }
        );
      }
    };
    // Adopt the boot state without acting on it (a session may already be live on remount).
    wasIdleRef.current = searchRuntimeBus.getState().desiredTuple.queryIdentity.kind === 'idle';
    return searchRuntimeBus.subscribe(syncFromState);
  }, [commitCameraViewport, lastCameraStateRef, searchRuntimeBus]);
};
