import type { GeoBbox } from '@crave-search/shared';

/**
 * THE public map-camera command seam (home-surface-charter Job 4): a module-
 * scope registry (house pattern — perf-scenario-command-registry) that lets
 * NON-search surfaces (the polls place chip, home's city picker) command the
 * map to a place bbox through the search runtime's OWN camera path. The search
 * root registers the one handler (use-search-root-submit-control-runtime →
 * commitFitAllCamera via the CameraIntentArbiter — the same fitAll executor
 * list worlds use); callers fire-and-forget. Returns false when no handler is
 * registered or the arbiter rejects (mid-gesture) — an honest no-op, never a
 * queue.
 */
export type MapCameraBboxFlyHandler = (bbox: GeoBbox) => boolean;

let flyToBboxHandler: MapCameraBboxFlyHandler | null = null;

export const registerMapCameraBboxFlyHandler = (handler: MapCameraBboxFlyHandler): (() => void) => {
  flyToBboxHandler = handler;
  return () => {
    if (flyToBboxHandler === handler) {
      flyToBboxHandler = null;
    }
  };
};

export const requestMapCameraFlyToBbox = (bbox: GeoBbox): boolean => {
  if (flyToBboxHandler == null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[map-camera-command] fly-to-bbox requested with no handler registered');
    }
    return false;
  }
  return flyToBboxHandler(bbox);
};

/** Test-only reset. */
export const resetMapCameraCommandStore = (): void => {
  flyToBboxHandler = null;
};
