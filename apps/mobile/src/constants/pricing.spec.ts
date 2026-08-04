import { formatPriceRangeText, getPriceRangeLabel, getPriceSymbolLabel } from './pricing';

/**
 * F895: price levels were encoded twice in incompatible representations (display strings +
 * numeric bounds) and `formatPriceRangeText` read a DIFFERENT one on each of its two paths.
 * These cases pin the property that made the drift possible: the single-level answer and the
 * span answer must be the SAME function of the SAME numbers.
 *
 * RED RECIPE: give `PRICE_LEVEL_BOUNDS[2]` a max of 60 (the exact drift the finding
 * describes — one representation edited, the other not). Both 'level 2 alone' and
 * 'levels 1–2 span' move together here; under the old two-table code only the span moved,
 * and nothing failed.
 */
describe('price level formatting', () => {
  it('a single level and the degenerate span [n, n] are the SAME string', () => {
    for (const level of [1, 2, 3, 4]) {
      expect(formatPriceRangeText([level, level])).toBe(getPriceRangeLabel(level));
    }
  });

  it('a span reads from the low bound of its floor and the high bound of its ceiling', () => {
    expect(formatPriceRangeText([1, 2])).toBe('$1–$50');
    expect(formatPriceRangeText([2, 3])).toBe('$25–$75');
    // The open-ended top level stays open-ended in a span.
    expect(formatPriceRangeText([3, 4])).toBe('$50+');
  });

  it('the whole scale is "Any price", and the range is order-insensitive', () => {
    expect(formatPriceRangeText([1, 4])).toBe('Any price');
    expect(formatPriceRangeText([4, 1])).toBe('Any price');
    expect(formatPriceRangeText([3, 2])).toBe(formatPriceRangeText([2, 3]));
  });

  it('out-of-range and non-finite levels clamp instead of producing a broken label', () => {
    expect(formatPriceRangeText([0, 9])).toBe('Any price');
    expect(getPriceRangeLabel(7)).toBe(getPriceRangeLabel(4));
    expect(getPriceSymbolLabel(0)).toBe('$');
    expect(getPriceSymbolLabel(Number.NaN)).toBe('$');
  });

  it('a missing level is a missing label, never a defaulted one', () => {
    expect(getPriceRangeLabel(null)).toBeUndefined();
    expect(getPriceRangeLabel(undefined)).toBeUndefined();
    expect(getPriceSymbolLabel(null)).toBeUndefined();
  });
});
