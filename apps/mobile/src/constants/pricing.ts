export const PRICE_LEVEL_SYMBOLS: Record<number, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

export const PRICE_LEVEL_RANGE_LABELS: Record<number, string> = {
  1: '$1–$25',
  2: '$25–$50',
  3: '$50–$75',
  4: '$75+',
};

type PriceBounds = { min: number | null; max: number | null };

const PRICE_LEVEL_BOUNDS: Record<number, PriceBounds> = {
  1: { min: 1, max: 25 },
  2: { min: 25, max: 50 },
  3: { min: 50, max: 75 },
  4: { min: 75, max: null },
};

const clampPriceLevel = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(4, Math.round(value)));
};

export const formatPriceRangeText = (range: [number, number]): string => {
  const low = clampPriceLevel(range[0]);
  const high = clampPriceLevel(range[1]);
  const min = Math.min(low, high);
  const max = Math.max(low, high);

  if (min === 1 && max === 4) {
    return 'Any price';
  }
  if (min === max) {
    return PRICE_LEVEL_RANGE_LABELS[min] ?? `Level ${min}`;
  }

  const lower = PRICE_LEVEL_BOUNDS[min];
  const upper = PRICE_LEVEL_BOUNDS[max];
  const overallMin = lower?.min ?? null;
  const overallMax = upper?.max ?? null;

  if (overallMin === null && overallMax !== null) {
    return `<$${overallMax}`;
  }
  if (overallMin !== null && overallMax === null) {
    return `$${overallMin}+`;
  }
  if (overallMin !== null && overallMax !== null) {
    return `$${overallMin}–$${overallMax}`;
  }
  return 'Any price';
};

export const getPriceRangeLabel = (priceLevel?: number | null): string | undefined => {
  if (priceLevel === null || priceLevel === undefined) {
    return undefined;
  }

  const rounded = Math.round(priceLevel);
  const clamped = Math.max(1, Math.min(4, rounded));
  return PRICE_LEVEL_RANGE_LABELS[clamped];
};

export const getPriceSymbolLabel = (priceLevel?: number | null): string | undefined => {
  if (priceLevel === null || priceLevel === undefined) {
    return undefined;
  }

  const rounded = Math.round(priceLevel);
  const clamped = Math.max(1, Math.min(4, rounded));
  return PRICE_LEVEL_SYMBOLS[clamped];
};
