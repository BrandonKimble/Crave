import type { MapBounds } from '../../../../types';

export type MapMotionBudgetClass = 'moving' | 'settled';

export type MapViewportMotionToken = {
  budgetClass: MapMotionBudgetClass;
  scaleBucket: number;
  latCell: number;
  lngCell: number;
  identity: string;
};

type MotionDecisionArgs = {
  budgetClass: MapMotionBudgetClass;
  previousToken: MapViewportMotionToken | null;
  nextToken: MapViewportMotionToken | null;
  lastRunAtMs: number;
  nowMs: number;
  minIntervalMs: number;
};

export type MotionDecision =
  | {
      shouldRun: true;
      reason:
        | 'settled'
        | 'bootstrap'
        | 'scale_bucket_changed'
        | 'viewport_cell_changed'
        | 'cadence_elapsed'
        | 'no_token';
      token: MapViewportMotionToken | null;
    }
  | {
      shouldRun: false;
      reason: 'coalesced';
      token: MapViewportMotionToken | null;
    };

const MIN_SPAN = 1e-6;
const MIN_CELL_SIZE = 0.0001;
const VIEWPORT_CELL_DIVISOR = 10;
const SCALE_BUCKET_GRANULARITY = 4;

const normalizeSpan = (value: number): number => Math.max(Math.abs(value), MIN_SPAN);

const buildScaleBucket = (latSpan: number, lngSpan: number): number => {
  const normalizedSpan = Math.max(normalizeSpan(latSpan), normalizeSpan(lngSpan));
  return Math.round(-Math.log2(normalizedSpan) * SCALE_BUCKET_GRANULARITY);
};

export const buildViewportMotionToken = ({
  bounds,
  budgetClass,
  zoom,
}: {
  bounds: MapBounds | null;
  budgetClass: MapMotionBudgetClass;
  zoom?: number | null;
}): MapViewportMotionToken | null => {
  if (!bounds) {
    return null;
  }

  const latSpan = normalizeSpan(bounds.northEast.lat - bounds.southWest.lat);
  const lngSpan = normalizeSpan(bounds.northEast.lng - bounds.southWest.lng);
  const centerLat = (bounds.northEast.lat + bounds.southWest.lat) / 2;
  const centerLng = (bounds.northEast.lng + bounds.southWest.lng) / 2;
  const latCellSize = Math.max(latSpan / VIEWPORT_CELL_DIVISOR, MIN_CELL_SIZE);
  const lngCellSize = Math.max(lngSpan / VIEWPORT_CELL_DIVISOR, MIN_CELL_SIZE);
  const latCell = Math.round(centerLat / latCellSize);
  const lngCell = Math.round(centerLng / lngCellSize);
  const scaleBucket =
    typeof zoom === 'number' && Number.isFinite(zoom)
      ? Math.round(zoom * SCALE_BUCKET_GRANULARITY)
      : buildScaleBucket(latSpan, lngSpan);

  return {
    budgetClass,
    scaleBucket,
    latCell,
    lngCell,
    identity: `${budgetClass}:${scaleBucket}:${latCell}:${lngCell}`,
  };
};

export const decideMotionDerivation = ({
  budgetClass,
  previousToken,
  nextToken,
  lastRunAtMs,
  nowMs,
  minIntervalMs,
}: MotionDecisionArgs): MotionDecision => {
  if (budgetClass === 'settled') {
    return {
      shouldRun: true,
      reason: 'settled',
      token: nextToken,
    };
  }
  if (!nextToken) {
    return {
      shouldRun: true,
      reason: 'no_token',
      token: nextToken,
    };
  }
  if (!previousToken) {
    return {
      shouldRun: true,
      reason: 'bootstrap',
      token: nextToken,
    };
  }
  if (previousToken.scaleBucket !== nextToken.scaleBucket) {
    return {
      shouldRun: true,
      reason: 'scale_bucket_changed',
      token: nextToken,
    };
  }
  if (previousToken.latCell !== nextToken.latCell || previousToken.lngCell !== nextToken.lngCell) {
    return {
      shouldRun: true,
      reason: 'viewport_cell_changed',
      token: nextToken,
    };
  }
  if (nowMs - lastRunAtMs >= minIntervalMs) {
    return {
      shouldRun: true,
      reason: 'cadence_elapsed',
      token: nextToken,
    };
  }
  return {
    shouldRun: false,
    reason: 'coalesced',
    token: nextToken,
  };
};
