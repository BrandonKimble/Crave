import type { BottomSheetSnap } from './bottomSheetMotionTypes';

export const TOP_EPSILON = 2;
export const DRAG_EPSILON = 2;
export const DEFAULT_DISMISS_SLOP = 80;
export const RUBBER_BAND_RANGE_PX = 96;
export const RUBBER_BAND_COEFFICIENT = 0.44;
export const STEP_SNAP_SMALL_DRAG_PX = 20;
export const STEP_SNAP_DRAG_PX = 48;
export const STEP_SNAP_SKIP_DRAG_PX = 212;
export const STEP_SNAP_VELOCITY_PX_PER_S = 820;
export const STEP_SNAP_SKIP_VELOCITY_PX_PER_S = 3200;
export const STEP_SNAP_SKIP_MIN_PROGRESS = 0.5;
export const STEP_SNAP_DIRECTION_EPSILON_PX = 4;
export const STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S = 120;
export const STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S = 420;
export const STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S = 220;
export const STEP_SNAP_REVERSAL_CANCEL_DRAG_PX = 140;
export const STEP_SNAP_PROGRESS_FOR_STEP = 0.18;
export const STEP_SNAP_PROGRESS_FOR_SKIP = 1.03;
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

const rubberBandDistance = (distanceFromBound: number): number => {
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

export const resolveSteppedSnapPoint = (
  value: number,
  velocity: number,
  gestureStartValue: number,
  points: readonly number[]
): number => {
  'worklet';
  if (points.length === 0) {
    return value;
  }
  const lastIndex = points.length - 1;
  const startIndex = findNearestPointIndex(gestureStartValue, points);
  const dragDelta = value - gestureStartValue;
  const absDragDelta = Math.abs(dragDelta);
  const absVelocity = Math.abs(velocity);
  if (absDragDelta <= STEP_SNAP_SMALL_DRAG_PX) {
    return points[startIndex];
  }
  const dragDirection =
    absDragDelta >= STEP_SNAP_DIRECTION_EPSILON_PX ? (dragDelta > 0 ? 1 : -1) : 0;
  const velocityDirection =
    absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S ? (velocity > 0 ? 1 : -1) : 0;
  if (dragDirection !== 0 && velocityDirection !== 0 && dragDirection !== velocityDirection) {
    if (
      absVelocity >= STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S &&
      absDragDelta <= STEP_SNAP_REVERSAL_CANCEL_DRAG_PX
    ) {
      return points[startIndex];
    }
  }
  let direction = dragDirection;
  if (
    velocityDirection !== 0 &&
    (direction === 0 || absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S)
  ) {
    direction = velocityDirection;
  }
  if (direction === 0) {
    return points[startIndex];
  }
  const nextIndex = Math.min(Math.max(startIndex + direction, 0), lastIndex);
  if (nextIndex === startIndex) {
    return points[startIndex];
  }
  const distanceToNext = Math.max(1, Math.abs(points[nextIndex] - points[startIndex]));
  const rawProgress =
    direction > 0
      ? (value - points[startIndex]) / distanceToNext
      : (points[startIndex] - value) / distanceToNext;
  const progressTowardDirection = Math.max(0, rawProgress);
  const hasStepIntent =
    progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_STEP ||
    absDragDelta >= STEP_SNAP_DRAG_PX ||
    absVelocity >= STEP_SNAP_VELOCITY_PX_PER_S;
  if (!hasStepIntent) {
    return points[startIndex];
  }
  const hasSkipIntent =
    absDragDelta >= STEP_SNAP_SKIP_DRAG_PX ||
    (progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_SKIP &&
      absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.66) ||
    (absVelocity >= STEP_SNAP_SKIP_VELOCITY_PX_PER_S &&
      progressTowardDirection >= STEP_SNAP_SKIP_MIN_PROGRESS &&
      absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.55);
  const targetIndex = Math.min(
    Math.max(startIndex + direction * (hasSkipIntent ? 2 : 1), 0),
    lastIndex
  );
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
