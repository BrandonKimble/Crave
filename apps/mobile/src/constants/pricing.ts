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
