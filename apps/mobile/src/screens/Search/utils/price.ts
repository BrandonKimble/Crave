import { formatPriceRangeText } from '../../../constants/pricing';

// F2307: this file maintains TWO incompatible number scales — a Google price
// LEVEL (1..4) and a slider BOUNDARY (1..5, where the max is an EXCLUSIVE right
// edge). They used to share one structural `[number, number]`, so handing a
// level range to a function expecting a boundary range compiled and silently
// rendered one band too narrow. They are distinct types now: the swap is a
// compile error.

export const PRICE_LEVEL_VALUES = [1, 2, 3, 4] as const;
export const PRICE_SLIDER_VALUES = [1, 2, 3, 4, 5] as const;

export type PriceLevelValue = (typeof PRICE_LEVEL_VALUES)[number];
export type PriceSliderValue = (typeof PRICE_SLIDER_VALUES)[number];

// The two ranges are BRANDED, not merely bounded. Bounds alone would not
// separate them: every level (1..4) is also a valid slider value (1..5), so a
// level range structurally satisfies a slider range and the swap would still
// compile. The brand is what makes it an error.
declare const priceRangeScale: unique symbol;

/** Slider BOUNDARY range: [inclusive left, EXCLUSIVE right]. */
export type PriceSliderRange = [PriceSliderValue, PriceSliderValue] & {
  readonly [priceRangeScale]: 'slider';
};
/** Google price LEVEL range: [inclusive min level, inclusive max level]. */
export type PriceLevelRange = [PriceLevelValue, PriceLevelValue] & {
  readonly [priceRangeScale]: 'level';
};

export const PRICE_LEVEL_MIN: PriceLevelValue = PRICE_LEVEL_VALUES[0];
export const PRICE_LEVEL_MAX: PriceLevelValue = PRICE_LEVEL_VALUES[PRICE_LEVEL_VALUES.length - 1];
export const PRICE_SLIDER_MIN: PriceSliderValue = PRICE_SLIDER_VALUES[0];
export const PRICE_SLIDER_MAX: PriceSliderValue =
  PRICE_SLIDER_VALUES[PRICE_SLIDER_VALUES.length - 1];

/** One rounding/clamping rule; the two scales differ only in their bounds. */
const clampToInclusiveRange = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

export const clampPriceLevelValue = (value: number): PriceLevelValue =>
  clampToInclusiveRange(value, PRICE_LEVEL_MIN, PRICE_LEVEL_MAX) as PriceLevelValue;

export const clampPriceSliderValue = (value: number): PriceSliderValue =>
  clampToInclusiveRange(value, PRICE_SLIDER_MIN, PRICE_SLIDER_MAX) as PriceSliderValue;

/** The one way to MAKE a slider boundary range from loose numbers (clamped). */
export const priceSliderRange = (min: number, max: number): PriceSliderRange =>
  [clampPriceSliderValue(min), clampPriceSliderValue(max)] as PriceSliderRange;

export const normalizePriceRangeValues = (range: PriceSliderRange): PriceSliderRange => {
  const [rawMin, rawMax] = range;
  let min = clampPriceSliderValue(rawMin);
  let max = clampPriceSliderValue(rawMax);
  if (min > max) {
    [min, max] = [max, min];
  }
  // A zero-width boundary range selects nothing; widen it by one stop so it
  // always names at least one band.
  if (min === max) {
    if (max < PRICE_SLIDER_MAX) {
      max = clampPriceSliderValue(max + 1);
    } else if (min > PRICE_SLIDER_MIN) {
      min = clampPriceSliderValue(min - 1);
    }
  }
  return [min, max] as PriceSliderRange;
};

export const buildLevelsFromRange = (range: PriceSliderRange): PriceLevelValue[] => {
  const [start, end] = normalizePriceRangeValues(range);
  const startLevel = clampPriceLevelValue(start);
  const endBoundary = clampPriceSliderValue(end);
  const values: PriceLevelValue[] = [];
  for (let value = startLevel; value < endBoundary; value += 1) {
    values.push(value as PriceLevelValue);
  }
  return values;
};

export const getRangeFromLevels = (levels: readonly number[]): PriceSliderRange => {
  if (!levels.length) {
    return [PRICE_SLIDER_MIN, PRICE_SLIDER_MAX] as PriceSliderRange;
  }
  const sorted = [...levels].sort((a, b) => a - b);
  const start = clampPriceLevelValue(sorted[0]);
  const end = clampPriceSliderValue(clampPriceLevelValue(sorted[sorted.length - 1]) + 1);
  return normalizePriceRangeValues([start, end] as PriceSliderRange);
};

export const isFullPriceRange = (range: PriceSliderRange): boolean => {
  const [min, max] = normalizePriceRangeValues(range);
  return min === PRICE_SLIDER_MIN && max === PRICE_SLIDER_MAX;
};

export const toPriceLevelRange = (range: PriceSliderRange): PriceLevelRange => {
  const [minBoundary, maxBoundary] = normalizePriceRangeValues(range);
  const minLevel = clampPriceLevelValue(minBoundary);
  const maxLevel = clampPriceLevelValue(maxBoundary - 1);
  return [minLevel, Math.max(minLevel, maxLevel) as PriceLevelValue] as PriceLevelRange;
};

export const formatPriceRangeSummary = (range: PriceSliderRange): string => {
  const normalized = normalizePriceRangeValues(range);
  if (isFullPriceRange(normalized)) {
    return 'Any price';
  }
  return formatPriceRangeText(toPriceLevelRange(normalized));
};
