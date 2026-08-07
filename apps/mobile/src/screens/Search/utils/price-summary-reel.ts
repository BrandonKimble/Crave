import { formatPriceRangeSummary, priceSliderRange, type PriceSliderRange } from './price';

/**
 * THE PRICE SUMMARY REEL — the ten real ranges and the blend that positions
 * the reel between them. Pure boundary math, no Reanimated and no React, so
 * the hermetic node lane can execute it (the hook that renders the reel
 * cannot be imported there).
 */

const PRICE_SUMMARY_REEL_RANGES: PriceSliderRange[] = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 5],
  [4, 5],
].map(([min, max]) => priceSliderRange(min, max));

export const PRICE_SUMMARY_REEL_ENTRIES = PRICE_SUMMARY_REEL_RANGES.map((range) => ({
  range,
  key: `${range[0]}-${range[1]}`,
  label: formatPriceRangeSummary(range),
}));

const PRICE_SUMMARY_REEL_INDEX_BY_KEY = PRICE_SUMMARY_REEL_ENTRIES.reduce<Record<string, number>>(
  (acc, entry, index) => {
    acc[entry.key] = index;
    return acc;
  },
  {}
);

export const PRICE_SUMMARY_CANDIDATES = PRICE_SUMMARY_REEL_ENTRIES.map((entry) => entry.label);
const PRICE_SUMMARY_REEL_DEFAULT_INDEX = PRICE_SUMMARY_REEL_INDEX_BY_KEY['1-5'];

/**
 * The reel position for a slider pair, bilinearly blended over the four
 * table corners the two boundaries sit between.
 *
 * F6206: the clamp forces `high >= low + 1`, so when BOTH boundaries are
 * fractional the third corner is the degenerate `n-n` — a zero-width range
 * the table cannot contain and no reel entry means. It used to resolve to
 * the default entry ('1-5', the WIDEST range and the one furthest from the
 * neighbourhood being interpolated), dragging (1.5, 2.5) from 1.667 to
 * 2.000 and feeding that error straight into the neighbour crossfade. An
 * absent corner now contributes NOTHING: the division by `totalWeight`
 * below renormalises the surviving corners by construction, so the
 * geometrically correct blend is free.
 */
export const getPriceSummaryReelIndexFromBoundaries = (
  lowBoundary: number,
  highBoundary: number
): number => {
  'worklet';
  const low = Math.min(4, Math.max(1, lowBoundary));
  const high = Math.min(5, Math.max(low + 1, highBoundary));
  const lowFloor = Math.floor(low);
  const lowCeil = Math.min(4, lowFloor + 1);
  const highFloor = Math.floor(high);
  const highCeil = Math.min(5, highFloor + 1);
  const lowFraction = low - lowFloor;
  const highFraction = high - highFloor;

  let weightedIndex = 0;
  let totalWeight = 0;

  const applyCorner = (cornerLow: number, cornerHigh: number, weight: number) => {
    'worklet';
    if (weight <= 0) {
      return;
    }
    const cornerIndex = PRICE_SUMMARY_REEL_INDEX_BY_KEY[`${cornerLow}-${cornerHigh}`];
    if (cornerIndex == null) {
      return;
    }
    weightedIndex += cornerIndex * weight;
    totalWeight += weight;
  };

  applyCorner(lowFloor, highFloor, (1 - lowFraction) * (1 - highFraction));
  applyCorner(lowFloor, highCeil, (1 - lowFraction) * highFraction);
  applyCorner(lowCeil, highFloor, lowFraction * (1 - highFraction));
  applyCorner(lowCeil, highCeil, lowFraction * highFraction);

  if (totalWeight <= 0) {
    return PRICE_SUMMARY_REEL_DEFAULT_INDEX;
  }

  return weightedIndex / totalWeight;
};
