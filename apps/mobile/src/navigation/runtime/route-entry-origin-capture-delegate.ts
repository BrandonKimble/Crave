import type { OverlayKey } from '../../overlays/types';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';

/**
 * Capture seam for entry origins (S-B origin-on-entry slice): the overlay session-state
 * controller owns the live inputs (current scene identity, live detent, the scene live-state
 * registry) and registers its snapshot builder here; the scene-switch controller calls it at
 * PUSH COMMIT — before any motion — so the pushed entry carries the departing scene's
 * committed presentation. Same module-registration pattern as the active-controller hook.
 */

// The capturer takes the DEPARTING scene key explicitly: the session controller's own live
// identity resolution is ROOT-COLLAPSED (built for the search-session slot), which mis-keys a
// child departure's scroll lanes to the root scene — proven RED on the rig (lane 'profile'
// carried the followList offset and the restore staged the wrong lane).
let currentOriginCapturer: ((departingSceneKey: OverlayKey) => OriginSnapshot) | null = null;

export const registerRouteEntryOriginCapturer = (
  capturer: (departingSceneKey: OverlayKey) => OriginSnapshot
): (() => void) => {
  currentOriginCapturer = capturer;
  return () => {
    if (currentOriginCapturer === capturer) {
      currentOriginCapturer = null;
    }
  };
};

export const captureRouteEntryOrigin = (departingSceneKey: OverlayKey): OriginSnapshot | null =>
  currentOriginCapturer?.(departingSceneKey) ?? null;
