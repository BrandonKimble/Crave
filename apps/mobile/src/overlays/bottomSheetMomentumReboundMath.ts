/**
 * Pure math for the momentum-rebound impulse (boundary-physics law §3): a momentum scroll
 * that lands on the pinned top boundary converts its ARRIVAL SPEED into a rubber-band
 * impulse. Extracted from useBottomSheetSharedScrollEventsRuntime so the conversion is
 * testable without a UI runtime — the same shape as reorder-drag-math.ts.
 *
 * F5806 (2026-08-06) — the F889 defect, found at a second site. This used to live inline as
 * `MOMENTUM_EDGE_MIN_DELTA_PT_PER_FRAME = 4` and `velocity: -arrivalDelta * FRAMES_PER_SECOND`
 * with `FRAMES_PER_SECOND = 60`: both the threshold and the pt/s conversion were expressed in
 * per-FRAME units against an ASSUMED 60Hz display. On the ProMotion devices this app targets a
 * frame is 8.3ms, so the same physical arrival speed produced HALF the per-frame delta — the
 * spring got half the velocity (a visibly shallower rubber band) and the gate compounded it in
 * the same direction, dropping real momentum arrivals under the threshold so no impulse fired
 * at all. Everything here is in pt/SECOND, derived from the MEASURED interval between
 * consecutive scroll events; the display's refresh rate is no longer a literal.
 *
 * Reanimated scroll events carry neither `velocity` nor `contentSize` (both probe-proven null,
 * 2026-07-23 / 2026-07-24), so offset DELTAS are the only velocity signal — but a delta is only
 * a speed once it is divided by the time it took.
 */

/**
 * 240 pt/s = the previous `4 pt/frame` gate evaluated at the 60Hz it silently assumed. Chosen to
 * reproduce the original 60Hz feel EXACTLY on that display rather than to introduce a new
 * measurement — same reasoning as reorder-drag-math's AUTO_SCROLL_MAX_SPEED_PX_PER_SEC. Unlike
 * the constant it replaces, it now means the same physical speed on every refresh rate.
 */
export const MOMENTUM_EDGE_MIN_SPEED_PT_PER_SEC = 240;

/**
 * The first scroll event of a momentum episode has no predecessor to measure against. A 60Hz
 * frame is the fallback interval for that ONE sample — the same fallback useReorderDrag's frame
 * pump uses for Reanimated's first tick, where `timeSincePreviousFrame` is likewise absent.
 */
export const MOMENTUM_FALLBACK_INTERVAL_MS = 1000 / 60;

export type MomentumArrivalSpeedInput = {
  /** Absolute scroll-offset change since the previous momentum event, in points. */
  deltaPt: number;
  /** MEASURED wall time since the previous momentum event, in milliseconds. */
  intervalMs: number;
  /**
   * The previous event's arrival speed (pt/s). The arrival speed is the MAX of this event's and
   * the previous one's: the event that actually lands on the boundary is already decelerating
   * against it, so the step before it is the truer reading of how fast the content arrived.
   */
  previousSpeedPtPerSec: number;
};

export type MomentumArrivalSpeeds = {
  /** THIS event's own speed — what the next event carries forward as `previousSpeedPtPerSec`. */
  stepSpeedPtPerSec: number;
  /** The reading the boundary gate and the spring impulse both use. */
  arrivalSpeedPtPerSec: number;
};

/**
 * Worklet-pure: no captures, no JS-thread reads — callable from the UI thread. Returns BOTH
 * readings from one measurement so the caller never re-derives (and never drifts) the second.
 */
export const deriveMomentumArrivalSpeedsPtPerSec = ({
  deltaPt,
  intervalMs,
  previousSpeedPtPerSec,
}: MomentumArrivalSpeedInput): MomentumArrivalSpeeds => {
  'worklet';
  const interval = intervalMs > 0 ? intervalMs : MOMENTUM_FALLBACK_INTERVAL_MS;
  const stepSpeedPtPerSec = (Math.abs(deltaPt) / interval) * 1000;
  return {
    stepSpeedPtPerSec,
    arrivalSpeedPtPerSec: Math.max(stepSpeedPtPerSec, previousSpeedPtPerSec),
  };
};
