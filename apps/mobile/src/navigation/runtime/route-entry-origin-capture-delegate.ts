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

// Leg 2a (phase-1 design §1.3): capture is TOTAL — a pushed entry is BORN with its return
// address, no nullable arm. The unregistered-capturer window (boot, before the session
// controller mounts) degrades to the minimal degenerate origin of the departing scene and
// barks: an un-restorable origin is a wiring defect, never a silent null.
export const captureRouteEntryOrigin = (departingSceneKey: OverlayKey): OriginSnapshot => {
  const captured = currentOriginCapturer?.(departingSceneKey);
  if (captured != null) {
    return captured;
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(
      `[ORIGIN-CONTRACT] push committed with no origin capturer registered (departing '${departingSceneKey}') — degenerate origin minted`
    );
  }
  return {
    sceneKey: departingSceneKey,
    sceneParams: null,
    detent: 'collapsed',
    segment: null,
    scroll: [],
    anchor: null,
  };
};

// Restore side of the same seam: the session-state controller owns the snap ledger + scroll
// staging, so it registers the restorer; dismiss verbs call it with the POPPED entry's origin
// BEFORE the scene-switch plan resolves (the plan reads the remembered-snap ledger — staging
// after commit is a stale read, proven RED on the rig as a wrong-detent pop).
let currentOriginRestorer: ((origin: OriginSnapshot) => void) | null = null;

export const registerRouteEntryOriginRestorer = (
  restorer: (origin: OriginSnapshot) => void
): (() => void) => {
  currentOriginRestorer = restorer;
  return () => {
    if (currentOriginRestorer === restorer) {
      currentOriginRestorer = null;
    }
  };
};

export const stageRouteEntryOriginRestore = (origin: OriginSnapshot | null | undefined): void => {
  if (origin != null) {
    currentOriginRestorer?.(origin);
  }
};
