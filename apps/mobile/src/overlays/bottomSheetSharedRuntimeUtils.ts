import type { BottomSheetSnap } from './bottomSheetMotionTypes';

export const TOP_EPSILON = 2;
export const DRAG_EPSILON = 2;
export const RUBBER_BAND_RANGE_PX = 96;
export const RUBBER_BAND_COEFFICIENT = 0.44;
export const STEP_SNAP_SMALL_DRAG_PX = 20;
export const STEP_SNAP_DIRECTION_EPSILON_PX = 4;
export const STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S = 220;
export const STEP_SNAP_REVERSAL_CANCEL_DRAG_PX = 140;
export const SNAP_GATE_FALLBACK_PX = 96;
export const SNAP_VELOCITY_PROJECTION_SECONDS = 0.18;
export const AXIS_LOCK_SLOP_PX = 4;
export const AXIS_LOCK_RATIO = 1.15;
export const AXIS_LOCK_NONE = 0;
export const AXIS_LOCK_HORIZONTAL = 1;
export const AXIS_LOCK_VERTICAL = 2;
export const GESTURE_OWNER_SHEET = 0;
export const GESTURE_OWNER_SCROLL = 1;
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

// Closed-form inverse of rubberBandDistance (verified algebraically): given a damped
// displacement r (< RANGE), returns the raw finger distance d that produced it —
// d = r*R / (C*(R - r)). Used to re-anchor a touch that lands mid-tug so the finger
// continues the SAME curve with no jump.
export const inverseRubberBandDistance = (dampedDistance: number): number => {
  'worklet';
  if (dampedDistance <= 0) {
    return 0;
  }
  const clamped = Math.min(dampedDistance, RUBBER_BAND_RANGE_PX - 0.5);
  return (
    (clamped * RUBBER_BAND_RANGE_PX) / (RUBBER_BAND_COEFFICIENT * (RUBBER_BAND_RANGE_PX - clamped))
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
