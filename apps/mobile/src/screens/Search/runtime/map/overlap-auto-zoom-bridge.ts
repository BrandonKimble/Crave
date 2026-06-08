import type { Coordinate } from '../../../../types';

// ---------------------------------------------------------------------------
// OVERLAP AUTO-ZOOM BRIDGE — connects the source builder (which resolves the overlap
// region from the frozen submitted viewport + live user location, and knows when a
// far-out shortcut resolved to a metro RADIUS) to the camera layer (which owns the
// CameraIntentArbiter). The builder posts a one-shot "focus the user's vicinity"
// request; the camera layer animates there. Decoupled so neither layer has to import
// the other's deps (user location vs camera).
// ---------------------------------------------------------------------------

export type OverlapAutoZoomRequest = {
  center: Coordinate;
  radiusMiles: number;
};

type Handler = (request: OverlapAutoZoomRequest) => void;

let handler: Handler | null = null;

export const registerOverlapAutoZoomHandler = (next: Handler): (() => void) => {
  handler = next;
  return () => {
    if (handler === next) {
      handler = null;
    }
  };
};

export const requestOverlapAutoZoom = (request: OverlapAutoZoomRequest): void => {
  handler?.(request);
};
