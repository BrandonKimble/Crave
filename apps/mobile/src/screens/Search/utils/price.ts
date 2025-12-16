import { formatPriceRangeText } from '../../../constants/pricing';

export const PRICE_LEVEL_VALUES = [1, 2, 3, 4] as const;
export const PRICE_SLIDER_VALUES = [1, 2, 3, 4, 5] as const;

export type PriceLevelValue = (typeof PRICE_LEVEL_VALUES)[number];
export type PriceSliderValue = (typeof PRICE_SLIDER_VALUES)[number];
export type PriceRangeTuple = [number, number];

export const PRICE_LEVEL_MIN: PriceLevelValue = PRICE_LEVEL_VALUES[0];
export const PRICE_LEVEL_MAX: PriceLevelValue = PRICE_LEVEL_VALUES[PRICE_LEVEL_VALUES.length - 1];
export const PRICE_SLIDER_MIN: PriceSliderValue = PRICE_SLIDER_VALUES[0];
export const PRICE_SLIDER_MAX: PriceSliderValue = PRICE_SLIDER_VALUES[PRICE_SLIDER_VALUES.length - 1];

export const clampPriceLevelValue = (value: number): PriceLevelValue => {
  if (!Number.isFinite(value)) {
    return PRICE_LEVEL_MIN;
  }
  return Math.min(PRICE_LEVEL_MAX, Math.max(PRICE_LEVEL_MIN, Math.round(value))) as PriceLevelValue;
};

export const clampPriceSliderValue = (value: number): PriceSliderValue => {
  if (!Number.isFinite(value)) {
    return PRICE_SLIDER_MIN;
  }
  return Math.min(
    PRICE_SLIDER_MAX,
    Math.max(PRICE_SLIDER_MIN, Math.round(value))
  ) as PriceSliderValue;
};

export const normalizePriceRangeValues = (range: PriceRangeTuple): PriceRangeTuple => {
  const [rawMin, rawMax] = range;
  let min = clampPriceSliderValue(rawMin);
  let max = clampPriceSliderValue(rawMax);
  if (min > max) {
    [min, max] = [max, min];
  }
  if (min === max) {
    if (max < PRICE_SLIDER_MAX) {
      max = clampPriceSliderValue(max + 1);
    } else if (min > PRICE_SLIDER_MIN) {
      min = clampPriceSliderValue(min - 1);
    }
  }
  return [min, max];
};

export const buildLevelsFromRange = (range: PriceRangeTuple): number[] => {
  const [start, end] = normalizePriceRangeValues(range);
  const startLevel = clampPriceLevelValue(start);
  const endBoundary = clampPriceSliderValue(end);
  const values: number[] = [];
  for (let value = startLevel; value < endBoundary; value += 1) {
    values.push(value);
  }
  return values;
};

export const getRangeFromLevels = (levels: number[]): PriceRangeTuple => {
  if (!levels.length) {
    return [PRICE_SLIDER_MIN, PRICE_SLIDER_MAX];
  }
  const sorted = [...levels].sort((a, b) => a - b);
  const start = clampPriceLevelValue(sorted[0]);
  const end = clampPriceSliderValue(clampPriceLevelValue(sorted[sorted.length - 1]) + 1);
  return normalizePriceRangeValues([start, end]);
};

export const isFullPriceRange = (range: PriceRangeTuple): boolean => {
  const [min, max] = normalizePriceRangeValues(range);
  return min === PRICE_SLIDER_MIN && max === PRICE_SLIDER_MAX;
};

export const toPriceLevelRange = (range: PriceRangeTuple): [number, number] => {
  const [minBoundary, maxBoundary] = normalizePriceRangeValues(range);
  const minLevel = clampPriceLevelValue(minBoundary);
  const maxLevel = clampPriceLevelValue(maxBoundary - 1);
  return [minLevel, Math.max(minLevel, maxLevel)];
};

export const formatPriceRangeSummary = (range: PriceRangeTuple): string => {
  const normalized = normalizePriceRangeValues(range);
  if (isFullPriceRange(normalized)) {
    return 'Any price';
  }
  return formatPriceRangeText(toPriceLevelRange(normalized));
};

export const normalizePriceFilter = (levels?: number[] | null): number[] => {
  if (!Array.isArray(levels) || levels.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      levels
        .map((level) => Math.round(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 4)
    )
  ).sort((a, b) => a - b);
};

