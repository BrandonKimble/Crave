export const PRICE_LEVEL_RANGE_LABELS: Record<number, string> = {
  0: 'Free / <$10',
  1: '$10-20',
  2: '$20-40',
  3: '$40-70',
  4: '$70+',
};

export const getPriceRangeLabel = (priceLevel?: number | null): string | undefined => {
  if (priceLevel === null || priceLevel === undefined) {
    return undefined;
  }

  const rounded = Math.round(priceLevel);
  const clamped = Math.max(0, Math.min(4, rounded));
  return PRICE_LEVEL_RANGE_LABELS[clamped];
};
