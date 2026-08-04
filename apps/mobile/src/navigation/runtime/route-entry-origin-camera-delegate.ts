import type { CameraSnapshot } from './app-route-profile-transition-state-contract';

/**
 * D56 — the CAMERA half of the route-entry origin seam (findings F1500-F1516).
 *
 * The origin snapshot is built in `navigation/runtime` (the session-state controller owns the
 * live scene identity, detent ledger and scroll registry); the camera lives in the SEARCH
 * runtime (ViewportBoundsService + CameraIntentArbiter, both React-scoped). Same module-
 * registration pattern as `route-entry-origin-capture-delegate` one file over: the search
 * runtime registers a PORT at mount, the origin seam calls it synchronously at push commit
 * and at pop restore.
 *
 * Two verbs, deliberately narrow:
 *   readOriginCamera()   — "where is the user, as they perceive it, RIGHT NOW"
 *   commitOriginCamera() — put the map back there, THROUGH the CameraIntentArbiter
 *
 * There is no direct camera call anywhere on this path: the arbiter is the single writer
 * (gesture arbitration, completion tokens, controlled-state sync all live there).
 */
export type RouteEntryOriginCameraPort = {
  readOriginCamera: () => CameraSnapshot | null;
  commitOriginCamera: (camera: CameraSnapshot) => void;
};

let currentPort: RouteEntryOriginCameraPort | null = null;

export const registerRouteEntryOriginCameraPort = (
  port: RouteEntryOriginCameraPort
): (() => void) => {
  currentPort = port;
  return () => {
    if (currentPort === port) {
      currentPort = null;
    }
  };
};

/**
 * Unlike the SHEET capture seam (which is TOTAL and barks when unregistered), an absent
 * camera port is a legitimate state: the map runtime is only mounted under the search root,
 * and a push committed before it mounts has no knowable camera. `null` is the honest answer
 * and the restore side treats it as "this entry does not own a camera" — never a guess.
 */
export const readRouteEntryOriginCamera = (): CameraSnapshot | null =>
  currentPort?.readOriginCamera() ?? null;

export const commitRouteEntryOriginCamera = (camera: CameraSnapshot | null | undefined): void => {
  if (camera == null) {
    return;
  }
  currentPort?.commitOriginCamera(camera);
};

/** Test seam only — clears the module-local port between specs. */
export const resetRouteEntryOriginCameraPortForTests = (): void => {
  currentPort = null;
};
