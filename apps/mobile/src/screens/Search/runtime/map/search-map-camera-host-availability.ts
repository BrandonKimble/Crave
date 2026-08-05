/**
 * D61 — camera-host availability seam (park-and-replay's wake-up call).
 *
 * The map's `MapboxGL.Camera` genuinely unmounts across scene switches, so a camera
 * intent committed in that window has no writer and the CameraIntentArbiter PARKS it.
 * This module is the one wire from "the camera component (re)attached its ref" to
 * "replay the parked intent": the camera intent runtime registers the notifier (its
 * effects fire — it lives in the ROOT runtime layer, not a scene body-spec hook), and
 * the map component's camera ref-attach callback pings it.
 *
 * Same module-registration pattern as route-entry-origin-capture-delegate one layer up:
 * the two sides must not import each other's React trees, so the seam is a module port.
 */

let currentNotifier: (() => void) | null = null;

export const registerCameraHostAvailabilityNotifier = (notifier: () => void): (() => void) => {
  currentNotifier = notifier;
  return () => {
    if (currentNotifier === notifier) {
      currentNotifier = null;
    }
  };
};

/** Called by the map component when the camera ref attaches (mount/remount). */
export const notifyCameraHostAttached = (): void => {
  currentNotifier?.();
};

/** Test seam only — clears the module-local notifier between specs. */
export const resetCameraHostAvailabilityNotifierForTests = (): void => {
  currentNotifier = null;
};
