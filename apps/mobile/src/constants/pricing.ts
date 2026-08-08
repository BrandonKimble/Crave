export const PRICE_LEVEL_SYMBOLS: Record<number, string> = {
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

/**
 * THE PRICE LEVELS — bounds are the single truth, every label is RENDERED from them.
 *
 * F895 (2026-08-03): price levels were encoded TWICE in INCOMPATIBLE representations —
 * display strings (`PRICE_LEVEL_RANGE_LABELS`) and numbers (`PRICE_LEVEL_BOUNDS`) — and
 * `formatPriceRangeText` read the STRINGS on its `min === max` path and the NUMBERS on its
 * range path. Editing one and not the other produced "$25–$50" sitting next to "$25–$75",
 * with no type error, no failing test, and no other symptom. There is now one table and one
 * formatter; the two paths cannot disagree because they read the same numbers.
 *
 * F1019 (2026-08-07) — WHAT THESE BOUNDS MAY LABEL. They describe the PRICE FILTER's own
 * selection ("you asked for $25–$50 places"), which is the user's stated intent and so is
 * not an observation about anybody. They must NEVER label a RESTAURANT: a level-derived
 * dollar band presented on a card reads as an observed price and is fabricated. A
 * restaurant renders the server's real `priceRangeText`, else the real `priceSymbol` /
 * `getPriceSymbolLabel` — never a band from this table. The per-restaurant band renderer
 * that used to live here (`getPriceRangeLabel`) is deleted for exactly that reason; only
 * `formatPriceRangeText` (filter summary) reads these bounds now.
 */
type PriceBounds = { min: number | null; max: number | null };

const PRICE_LEVEL_BOUNDS: Record<number, PriceBounds> = {
  1: { min: 1, max: 25 },
  2: { min: 25, max: 50 },
  3: { min: 50, max: 75 },
  4: { min: 75, max: null },
};

/** The ONE renderer: a bounds pair -> the string a user reads. */
const formatBounds = ({ min, max }: PriceBounds): string | undefined => {
  if (min === null && max === null) {
    return undefined;
  }
  if (min === null) {
    return `<$${max}`;
  }
  if (max === null) {
    return `$${min}+`;
  }
  return `$${min}–$${max}`;
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

  // ONE path for one level and for a span — a single level is just the span [n, n].
  const bounds: PriceBounds = {
    min: PRICE_LEVEL_BOUNDS[min]?.min ?? null,
    max: PRICE_LEVEL_BOUNDS[max]?.max ?? null,
  };
  return formatBounds(bounds) ?? 'Any price';
};

export const getPriceSymbolLabel = (priceLevel?: number | null): string | undefined => {
  if (priceLevel === null || priceLevel === undefined) {
    return undefined;
  }

  return PRICE_LEVEL_SYMBOLS[clampPriceLevel(priceLevel)];
};
