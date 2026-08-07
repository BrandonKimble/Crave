import type { OverlayKey } from '../../overlays/types';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';

/**
 * Capture seam for entry origins (S-B origin-on-entry slice): the overlay session-state
 * controller owns the live inputs (current scene identity, live detent, the scene live-state
 * registry) and registers its snapshot builder here; the scene-switch controller calls it at
 * PUSH COMMIT — before any motion — so the pushed entry carries the departing scene's
 * committed presentation. Same module-registration pattern as the active-controller hook.
 */

// The capturer takes the DEPARTING scene key explicitly — NOT as a workaround (F1509 uncollapsed
// the session controller's live-identity resolver) but because the reducer delivers the pre-push
// active key ATOMICALLY with the state mutation, before any authority publication; D56's camera
// capture is contractually keyed to the same parameter. History: the parameter originally
// compensated for a root-collapsed resolver that mis-keyed a child departure's scroll lanes to
// the root scene — proven RED on the rig (lane 'profile' carried the followList offset and the
// restore staged the wrong lane); the collapse is gone, the atomicity reason remains.
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

/**
 * Stage a POPPED entry's origin for restore.
 *
 * F2402 — ONE SEAM, ONE FAILURE POLICY. This used to read
 * `if (origin != null) { currentOriginRestorer?.(origin) }`: two silent no-ops on one line,
 * sitting thirty lines beneath a comment declaring capture TOTAL and backing that with an
 * `[ORIGIN-CONTRACT]` bark. The two halves of one seam disagreed about whether a missing
 * piece is a defect or a state — and the failure that exited silently is the one this file
 * calls RIG-PROVEN ("staging after commit is a stale read … a wrong-detent pop").
 *
 * They agree now, and each null gets the treatment its own truth deserves:
 *   • THE ORIGIN is non-nullable. A pushed entry is born with its return address, so
 *     "there is no origin" is never a fact about a pushed entry. It IS a fact about the
 *     ROOT entry (it departed nothing) and about a pop with no entry above the target —
 *     so those callers now DECIDE not to stage, in one named line each, rather than
 *     handing a null in here and hoping.
 *   • AN UNREGISTERED RESTORER is the boot-window wiring defect the capture half already
 *     names, and it barks through the same `[ORIGIN-CONTRACT]` sink.
 */
export const stageRouteEntryOriginRestore = (origin: OriginSnapshot): void => {
  const restorer = currentOriginRestorer;
  if (restorer == null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error(
        `[ORIGIN-CONTRACT] origin restore staged for '${origin.sceneKey}' with no restorer registered — the pop will settle at the WRONG DETENT (rig-proven failure)`
      );
    }
    return;
  }
  restorer(origin);
};
