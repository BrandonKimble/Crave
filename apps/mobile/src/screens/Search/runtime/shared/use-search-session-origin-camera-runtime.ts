import React from 'react';

import { getBoundsCenter } from '../../utils/geo';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootCameraViewportRuntime } from './use-search-root-session-runtime-contract';

// Camera-in-origin (owner decision 2026-07-10; root-cause fix 2026-07-11): a terminal search
// dismiss puts the camera back to the viewport the SEARCH WAS TRIGGERED FROM.
//   The origin's LOCATION comes from the tuple's own `committedBounds` — the exact viewport
// the search ran against, captured atomically at the tuple write from viewportBoundsService
// (updated on every camera-changed tick, gesture AND programmatic). This is the SINGLE
// source of truth: the restore location is, by construction, identical to what the search
// was triggered with.
//   THE BUG THIS FIXES (2026-07-11, reproduced on-device + rig): the origin used to be
// `lastCameraStateRef` — a SEPARATE camera tracker updated only on map IDLE (and skipped
// while the map was "busy", and NOT updated by raw arbiter-committed programmatic moves like
// the app-open camera positioning). So it lagged the true trigger viewport, and dismiss flew
// the camera to a stale earlier location the user "never searched from". Rig proof: a search
// run at Austin captured a US-center origin because `lastCameraStateRef` still held the
// bootstrap default while viewportBoundsService (→ committedBounds) was already fresh.
//   Zoom still comes from `lastCameraStateRef` (viewportBoundsService carries no zoom); it is
// device-fresh for the common case and, unlike center, a small zoom drift is not the
// "wrong-area" symptom. (Follow-up: derive zoom from the committedBounds span for full
// single-source fidelity.)
//   The origin tracks the LATEST SEARCH's viewport (owner rule 2026-07-11: "wherever you
// run the search, that's the map location [to return to]"). It refreshes on each search
// commit (keyed to the committedBounds object identity, which turns over only at a search
// write): a plain submit or an STA rerun moves it; a drill-in profile focus does NOT (not a
// search write), so a terminal dismiss short-circuits any nested profile-camera chain
// straight back to the last search. (This supersedes the 2026-07-10 once-per-session rule,
// which returned an STA dismiss to the pre-STA session start — the wrong area.)
//   One restore, committed through the CameraIntentArbiter at the exit write. Profile pops
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
  // The committedBounds object we last captured the origin against. committedBounds gets
  // a NEW object ONLY at a SEARCH commit (initial submit / STA area rerun / chip rerun —
  // never a profile focus, never a plain bus republish), so a change here is exactly the
  // "a new search was run at a location" signal.
  const lastCapturedBoundsRef = React.useRef<object | null>(null);

  React.useEffect(() => {
    const syncFromState = () => {
      const tuple = searchRuntimeBus.getState().desiredTuple;
      const isIdle = tuple.queryIdentity.kind === 'idle';

      if (isIdle) {
        // Session EXIT (set → idle): glide the camera back to WHERE THE LATEST SEARCH WAS
        // TRIGGERED FROM. Deferred one microtask so this commit lands AFTER any same-tick
        // pop-side camera commit (a terminal X with a profile open fires the profile's
        // savedCamera focus at pop commit — the search origin is the final destination and
        // must be the last word). Arbiter semantics are last-write-wins, so ordering is the
        // contract.
        if (!wasIdleRef.current) {
          wasIdleRef.current = true;
          const originCamera = sessionOriginCameraRef.current;
          sessionOriginCameraRef.current = null;
          lastCapturedBoundsRef.current = null;
          if (originCamera != null) {
            queueMicrotask(() => {
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
      // Capture / REFRESH the origin on each SEARCH TRIGGER — keyed to the committedBounds
      // object identity, which turns over only at a search commit. This is the resolution of
      // "wherever you run the search, that's the map location to return to" (owner rule):
      //   • a fresh search or an STA rerun writes a NEW committedBounds → the origin moves to
      //     that viewport (STA dismiss returns to the STA area, not the pre-STA session start);
      //   • a drill-in (tap a result → profile focus) does NOT write committedBounds → the
      //     origin stays at the last search, so a terminal dismiss short-circuits any nested
      //     profile-camera chain straight back to where the search was run.
      // LOCATION comes from committedBounds (the search's own viewport — the SINGLE source of
      // truth, identical to what the search resolved against, never stale). Zoom comes from
      // the last-known camera (viewportBoundsService carries no zoom).
      const triggerBounds = tuple.committedBounds?.bounds ?? null;
      if (triggerBounds != null && triggerBounds !== lastCapturedBoundsRef.current) {
        lastCapturedBoundsRef.current = triggerBounds;
        const zoom = lastCameraStateRef.current?.zoom ?? null;
        if (zoom != null) {
          const center = getBoundsCenter(triggerBounds);
          sessionOriginCameraRef.current = { center: [center.lng, center.lat], zoom };
        }
      } else if (sessionOriginCameraRef.current == null && triggerBounds == null) {
        // Fallback: a session that entered without committedBounds yet — seed from the
        // last-known camera so a dismiss before the first search commit still restores.
        const liveCamera = lastCameraStateRef.current;
        sessionOriginCameraRef.current = liveCamera
          ? { center: [...liveCamera.center] as [number, number], zoom: liveCamera.zoom }
          : null;
      }
    };
    // Adopt the boot state without acting on it (a session may already be live on remount).
    wasIdleRef.current = searchRuntimeBus.getState().desiredTuple.queryIdentity.kind === 'idle';
    return searchRuntimeBus.subscribe(syncFromState);
  }, [commitCameraViewport, lastCameraStateRef, searchRuntimeBus]);
};
