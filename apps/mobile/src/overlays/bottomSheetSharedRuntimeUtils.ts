import type { BottomSheetSnap } from './bottomSheetMotionTypes';

// ─── F976: THE SHEET'S TUNING CONSTANTS — EACH ONE ANSWERED OR DECLARED LOST ─────────
//
// This file already demonstrates how to do it: NATIVE_RUBBER_COEFFICIENT below cites Apple's
// WebKit ScrollElasticityController formula by name. Everything above it was bare. The rule
// applied here is the codebase's own: a number is a FACT, an OWNER CHOICE (dated), or a
// DERIVATION — and if it is none of those, saying "unattributed" out loud is the honest
// answer, because it tells the next reader that changing it is an eyeball decision rather
// than an arithmetic one.
//
// THREE KINDS appear below, and the label matters more than the value:
//   FACT       — follows from something else that is true (a geometry, a formula, a limit).
//   FEEL       — an owner choice about how the sheet should feel. Change with the sim open.
//   UNATTRIBUTED — nobody recorded why. Not safe to "derive"; re-tune by eye if needed.

/** FACT (float/pixel tolerance): "at the scroll top" within one logical point of slop, so a
 *  sub-pixel content offset does not read as scrolled. Any value in [1, 2] behaves alike. */
export const TOP_EPSILON = 2;

/** FACT (same class): a pan translation under 2pt is finger noise, not a drag. */
export const DRAG_EPSILON = 2;

/** FEEL: how far the sheet can be pulled past a boundary before the rubber curve pins it.
 *  This is the TIGHT fixed-range curve, deliberately distinct from the native content curve
 *  (NATIVE_RUBBER_COEFFICIENT below) — a sheet edge should feel firmer than a scroll edge. */
export const RUBBER_BAND_RANGE_PX = 96;

/** FEEL: the tightness of that same curve. Notably NOT Apple's 0.55 — the sheet band is
 *  meant to resist sooner. UNATTRIBUTED as to why 0.44 exactly. */
export const RUBBER_BAND_COEFFICIENT = 0.44;

/** FEEL: below this drag distance a release steps to the ADJACENT snap rather than
 *  projecting; it is what makes a small deliberate nudge move exactly one detent. */
export const STEP_SNAP_SMALL_DRAG_PX = 20;

/** FACT (direction sensing): a drag must resolve at least this far to have a direction at
 *  all; below it the sign of the translation is noise. */
export const STEP_SNAP_DIRECTION_EPSILON_PX = 4;

/** FEEL (reversal cancel): a fling BACK this fast cancels a step-snap in flight — the user
 *  changed their mind mid-gesture. UNATTRIBUTED: 220px/s has no recorded measurement. */
export const STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S = 220;

/** FEEL (reversal cancel, distance arm of the same rule). UNATTRIBUTED. */
export const STEP_SNAP_REVERSAL_CANCEL_DRAG_PX = 140;

/** FEEL: fallback gate distance when no measured band is available. Shares the 96 of
 *  RUBBER_BAND_RANGE_PX by intent, not coincidence — one "a boundary is about this deep"
 *  scale for the whole sheet. */
export const SNAP_GATE_FALLBACK_PX = 96;

/** FEEL (inertia projection): a release projects the finger's velocity forward this many
 *  seconds to pick the destination detent. ~11 frames at 60Hz. UNATTRIBUTED as to why 0.18
 *  rather than, say, 0.15 — it is the knob that decides how "flick-happy" the sheet is. */
export const SNAP_VELOCITY_PROJECTION_SECONDS = 0.18;

/** FACT (axis lock): the pan must travel this far before an axis is claimed. Deliberately
 *  equal to STEP_SNAP_DIRECTION_EPSILON_PX — both are the same underlying claim, that 4pt is
 *  where a touch stops being noise and starts being a direction. Note the third tolerance in
 *  this family lives on the tap recogniser (Gesture.Tap().maxDistance(12) in
 *  useBottomSheetSharedGestureRuntime): a TAP is allowed to wander further than a drag needs
 *  to travel, so that a slightly sloppy tap is still a tap. 4 < 12 is the relationship, and
 *  it is the only one that matters between them. */
export const AXIS_LOCK_SLOP_PX = 4;

/** FEEL: how much more vertical than horizontal a pan must be to claim the vertical axis.
 *  1.15 gives the sheet a slight bias toward its own axis without stealing genuine
 *  horizontal swipes. UNATTRIBUTED as to the exact ratio. */
export const AXIS_LOCK_RATIO = 1.15;
export const AXIS_LOCK_NONE = 0;
export const AXIS_LOCK_HORIZONTAL = 1;
export const AXIS_LOCK_VERTICAL = 2;
export const GESTURE_OWNER_SHEET = 0;
export const GESTURE_OWNER_SCROLL = 1;
// PROGRAMMATIC SNAP VELOCITY — a synthetic fling, so that a snap the CODE requests lands
// with the same spring character as one a finger requested (a zero-velocity spring reads as
// mushy next to a flicked one). The velocity is distance-proportional and clamped:
//   velocity = clamp(distance * PER_PX, MIN, MAX)
// FEEL, all three. The clamp bounds exist so a 10pt nudge is not glacial and a full-screen
// jump is not a slam; 3.2px/s per px of travel is the slope between them. UNATTRIBUTED as to
// the exact figures — they were tuned by eye against the gesture-driven case.
export const PROGRAMMATIC_SNAP_MIN_VELOCITY = 900;
export const PROGRAMMATIC_SNAP_MAX_VELOCITY = 2200;
export const PROGRAMMATIC_SNAP_VELOCITY_PER_PX = 3.2;

export const getScrollTopOffset = (contentInsetTop?: number | null): number => {
  'worklet';
  if (typeof contentInsetTop !== 'number' || !Number.isFinite(contentInsetTop)) {
    return 0;
  }
  return -contentInsetTop;
};

export const isAtScrollTop = (offsetY: number, scrollTopOffset: number): boolean => {
  'worklet';
  return offsetY <= scrollTopOffset + TOP_EPSILON;
};

/** THE NATIVE RUBBER CURVE (boundary-physics native baseline): Apple's own formula —
 *  offset = (1 − 1/(x·c/d + 1))·d with c = 0.55 and d = the VIEWPORT dimension (WebKit
 *  ScrollElasticityController constants). Content overscroll uses THIS (the feel every
 *  iOS scroll view has); the sheet's between-snap band keeps the tighter fixed-range
 *  curve below — one formula family, two declared materials. */
export const NATIVE_RUBBER_COEFFICIENT = 0.55;
export const nativeRubberBandDistance = (
  distanceFromBound: number,
  viewportDimension: number
): number => {
  'worklet';
  if (distanceFromBound <= 0 || viewportDimension <= 0) {
    return 0;
  }
  return (
    (1 - 1 / ((distanceFromBound * NATIVE_RUBBER_COEFFICIENT) / viewportDimension + 1)) *
    viewportDimension
  );
};

/** Inverse of the native curve — the CATCH seed: given a visible stretch y, the
 *  equivalent finger pull x with rubber(x) = y, so a finger landing mid-rebound
 *  continues the curve from where the content actually is (native catch semantics). */
export const inverseNativeRubberBandDistance = (
  stretch: number,
  viewportDimension: number
): number => {
  'worklet';
  if (stretch <= 0 || viewportDimension <= 0 || stretch >= viewportDimension) {
    return 0;
  }
  return (
    (viewportDimension * stretch) / (NATIVE_RUBBER_COEFFICIENT * (viewportDimension - stretch))
  );
};

export const rubberBandDistance = (distanceFromBound: number): number => {
  'worklet';
  if (distanceFromBound <= 0) {
    return 0;
  }
  return (
    (distanceFromBound * RUBBER_BAND_RANGE_PX * RUBBER_BAND_COEFFICIENT) /
    (RUBBER_BAND_RANGE_PX + RUBBER_BAND_COEFFICIENT * distanceFromBound)
  );
};

export const applyElasticBounds = (
  value: number,
  lowerBound: number,
  upperBound: number
): number => {
  'worklet';
  if (value < lowerBound) {
    return lowerBound - rubberBandDistance(lowerBound - value);
  }
  if (value > upperBound) {
    return upperBound + rubberBandDistance(value - upperBound);
  }
  return value;
};

const findNearestPointIndex = (value: number, points: readonly number[]): number => {
  'worklet';
  let closestIndex = 0;
  let minDist = Math.abs(value - (points[0] ?? value));
  for (let i = 1; i < points.length; i += 1) {
    const dist = Math.abs(value - points[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  return closestIndex;
};

const resolveDirection = (value: number): -1 | 0 | 1 => {
  'worklet';
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
};

export const resolveHeaderGatedSnapPoint = ({
  value,
  velocity,
  gestureStartValue,
  gateDistance,
  points,
}: {
  value: number;
  velocity: number;
  gestureStartValue: number;
  gateDistance: number;
  points: readonly number[];
}): number => {
  'worklet';
  if (points.length === 0) {
    return value;
  }
  const lastIndex = points.length - 1;
  const startIndex = findNearestPointIndex(gestureStartValue, points);
  const startValue = points[startIndex];
  const resolvedGateDistance =
    Number.isFinite(gateDistance) && gateDistance > 0 ? gateDistance : SNAP_GATE_FALLBACK_PX;
  const projectedValue = Math.min(
    Math.max(value + velocity * SNAP_VELOCITY_PROJECTION_SECONDS, points[0]),
    points[lastIndex]
  );
  const dragDelta = value - startValue;
  const projectedDelta = projectedValue - startValue;
  const absDragDelta = Math.abs(dragDelta);
  const absProjectedDelta = Math.abs(projectedDelta);
  const absVelocity = Math.abs(velocity);

  if (absDragDelta <= STEP_SNAP_SMALL_DRAG_PX && absProjectedDelta < resolvedGateDistance) {
    return startValue;
  }

  const dragDirection =
    absDragDelta >= STEP_SNAP_DIRECTION_EPSILON_PX ? resolveDirection(dragDelta) : 0;
  const projectedDirection =
    absProjectedDelta >= STEP_SNAP_DIRECTION_EPSILON_PX ? resolveDirection(projectedDelta) : 0;

  if (
    dragDirection !== 0 &&
    projectedDirection !== 0 &&
    dragDirection !== projectedDirection &&
    absVelocity >= STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S &&
    absDragDelta <= STEP_SNAP_REVERSAL_CANCEL_DRAG_PX
  ) {
    return startValue;
  }

  const direction = projectedDirection !== 0 ? projectedDirection : dragDirection;
  if (direction === 0) {
    return startValue;
  }

  let targetIndex = startIndex;
  if (direction > 0) {
    for (let index = startIndex + 1; index <= lastIndex; index += 1) {
      const gate = points[index - 1] + resolvedGateDistance;
      if (projectedValue < gate) {
        break;
      }
      targetIndex = index;
    }
  } else {
    for (let index = startIndex - 1; index >= 0; index -= 1) {
      const gate = points[index + 1] - resolvedGateDistance;
      if (projectedValue > gate) {
        break;
      }
      targetIndex = index;
    }
  }

  return points[targetIndex];
};

export const resolveSnapKeyFromValues = (
  value: number,
  expanded: number,
  middle: number,
  collapsed: number,
  hidden?: number
): BottomSheetSnap | null => {
  'worklet';
  const entries: Array<[BottomSheetSnap, number]> = [
    ['expanded', expanded],
    ['middle', middle],
    ['collapsed', collapsed],
  ];
  if (typeof hidden === 'number') {
    entries.push(['hidden', hidden]);
  }
  let best: BottomSheetSnap | null = null;
  let minDist = Number.MAX_VALUE;
  for (let i = 0; i < entries.length; i += 1) {
    const [key, val] = entries[i];
    const dist = Math.abs(value - val);
    if (dist < minDist) {
      minDist = dist;
      best = key;
    }
  }
  return best;
};
