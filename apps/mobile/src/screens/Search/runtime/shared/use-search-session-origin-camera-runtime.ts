import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootCameraViewportRuntime } from './use-search-root-session-runtime-contract';

// Camera-in-origin (owner decision 2026-07-10; single-source collapse 2026-07-11): a
// terminal search dismiss puts the camera back to the viewport the LATEST SEARCH WAS
// TRIGGERED FROM ("wherever you run the search, that's the map location to return to").
//   ONE SOURCE: the origin is `tuple.committedBounds.camera` — the {center, zoom}
// captured in the SAME commit-moment snapshot as the bounds the search resolved
// against. Center and zoom can no longer disagree with the searched viewport, because
// they are fields of it. (This retires the last dual-source read: zoom used to come
// from `lastCameraStateRef`, a separate idle-only tracker that lagged programmatic
// moves — the cd59e8a2 bug class. That ref remains the PROFILE lane's tracker; this
// lane no longer touches it.)
//   The origin tracks the LATEST search's viewport, keyed to the committedBounds
// object identity, which turns over only at a search commit (initial submit / STA
// area rerun / chip rerun — never a profile focus, never a plain bus republish). So a
// drill-in profile does NOT move the origin, and a terminal dismiss short-circuits any
// nested profile-camera chain straight back to the last search.
//   One restore, committed through the CameraIntentArbiter at the exit write. Profile
// pops keep their own savedCamera channel; on a terminal X with a profile open both
// fire in one tick and the microtask defer below makes this restore the last word.
export const useSearchSessionOriginCameraRuntime = ({
  searchRuntimeBus,
  viewportBoundsService,
  commitCameraViewport,
}: {
  searchRuntimeBus: SearchRuntimeBus;
  viewportBoundsService: {
    getCamera: () => { center: [number, number]; zoom: number } | null;
  };
  commitCameraViewport: SearchRootCameraViewportRuntime['commitCameraViewport'];
}): void => {
  const sessionOriginCameraRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const wasIdleRef = React.useRef(true);
  // The committedBounds object we last captured the origin against — the "a new search
  // ran at a location" signal (see the identity-keying note above).
  const lastCapturedBoundsRef = React.useRef<object | null>(null);

  React.useEffect(() => {
    const syncFromState = () => {
      const tuple = searchRuntimeBus.getState().desiredTuple;
      const isIdle = tuple.queryIdentity.kind === 'idle';

      if (isIdle) {
        // Session EXIT (set → idle): glide the camera back to WHERE THE LATEST SEARCH
        // WAS TRIGGERED FROM. Deferred one microtask so this commit lands AFTER any
        // same-tick pop-side camera commit (a terminal X with a profile open fires the
        // profile's savedCamera focus at pop commit — the search origin is the final
        // destination and must be the last word). Arbiter semantics are
        // last-write-wins, so ordering is the contract.
        if (!wasIdleRef.current) {
          wasIdleRef.current = true;
          const originCamera = sessionOriginCameraRef.current;
          sessionOriginCameraRef.current = null;
          lastCapturedBoundsRef.current = null;
          if (originCamera != null) {
            queueMicrotask(() => {
              // The origin glide is the final word ONLY while the session is still
              // ended. A new session can enter between the exit and this microtask
              // (dismiss list A → immediately open list B): the new world owns the
              // camera and the stale origin must not stomp its fit (sim-proven
              // 2026-07-13 — the Taco-crawl fitAll froze mid-flight under this write).
              if (searchRuntimeBus.getState().desiredTuple.queryIdentity.kind !== 'idle') {
                return;
              }
              commitCameraViewport(
                { center: originCamera.center, zoom: originCamera.zoom, padding: null },
                { allowDuringGesture: true }
              );
            });
          }
        }
        return;
      }

      wasIdleRef.current = false;
      const committed = tuple.committedBounds;
      if (committed != null && committed.bounds !== lastCapturedBoundsRef.current) {
        // A search commit landed: adopt ITS camera as the origin. `camera` is null only
        // when no viewport event preceded the capture — fall back to the service's live
        // camera (the same underlying source, read at observation instead of capture).
        lastCapturedBoundsRef.current = committed.bounds;
        const camera = committed.camera ?? viewportBoundsService.getCamera();
        if (camera != null) {
          sessionOriginCameraRef.current = {
            center: [camera.center[0], camera.center[1]],
            zoom: camera.zoom,
          };
        }
      } else if (sessionOriginCameraRef.current == null && committed == null) {
        // A session that entered without committedBounds yet — seed from the live
        // camera so a dismiss before the first search commit still restores.
        sessionOriginCameraRef.current = viewportBoundsService.getCamera();
      }
    };
    // Adopt the boot state without acting on it (a session may already be live on remount).
    wasIdleRef.current = searchRuntimeBus.getState().desiredTuple.queryIdentity.kind === 'idle';
    return searchRuntimeBus.subscribe(syncFromState);
  }, [commitCameraViewport, searchRuntimeBus, viewportBoundsService]);
};
