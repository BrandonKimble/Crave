import { getPriceSummaryReelIndexFromBoundaries } from '../utils/price-summary-reel';

/**
 * THE PRICE REEL BLENDS ONLY REAL RANGES (F6206).
 *
 * The reel index is a bilinear blend over four table corners
 * `${cornerLow}-${cornerHigh}`. The table holds the ten ranges with
 * `high > low`, but the clamp forces `high >= low + 1`, so whenever BOTH
 * handles sit between integers the third corner is the degenerate `n-n` —
 * a zero-width range no reel entry represents. That corner used to resolve
 * through `?? PRICE_SUMMARY_REEL_DEFAULT_INDEX`, i.e. `'1-5'`, the WIDEST
 * range in the reel and the entry furthest from the neighbourhood being
 * interpolated: at (1.5, 2.5) the honest neighbours are '1-2'(0), '1-3'(1)
 * and '2-3'(4), whose blend is 1.667, and the phantom dragged it to 2.000 —
 * straight into `priceSheetSummaryNeighborVisibility`'s crossfade.
 *
 * An absent corner now contributes nothing and the existing
 * `weightedIndex / totalWeight` renormalises the remaining three by
 * construction. SHOWS RED: restore the fallback and every case below fails.
 */

const closeTo = (value: number, expected: number) => {
  expect(value).toBeCloseTo(expected, 6);
};

describe('price summary reel index', () => {
  it('blends only the corners the table actually contains', () => {
    // Both handles fractional -> the degenerate '2-2' corner at weight 0.25.
    // Renormalised over '1-2'(0), '1-3'(1), '2-3'(4).
    closeTo(getPriceSummaryReelIndexFromBoundaries(1.5, 2.5), 5 / 3);
    // The clamp lifts 2.2 to low + 1, so this is the same position.
    closeTo(getPriceSummaryReelIndexFromBoundaries(1.5, 2.2), 5 / 3);
    // '3-3' missing; renormalised over '2-3'(4), '2-4'(5), '3-4'(7).
    closeTo(getPriceSummaryReelIndexFromBoundaries(2.5, 3.5), 16 / 3);
    // '4-4' missing; renormalised over '3-4'(7), '3-5'(8), '4-5'(9).
    closeTo(getPriceSummaryReelIndexFromBoundaries(3.5, 4.5), 8);
  });

  it('stays inside the neighbourhood its handles sit in', () => {
    // '1-2' = 0, '2-3' = 4: the blend must live between them, and must not
    // reach the 2.000 the '1-5' phantom produced.
    const blended = getPriceSummaryReelIndexFromBoundaries(1.5, 2.5);
    expect(blended).toBeGreaterThan(0);
    expect(blended).toBeLessThan(2);
  });

  it('returns the exact entry when both handles land on integers', () => {
    closeTo(getPriceSummaryReelIndexFromBoundaries(1, 2), 0);
    closeTo(getPriceSummaryReelIndexFromBoundaries(1, 5), 3);
    closeTo(getPriceSummaryReelIndexFromBoundaries(4, 5), 9);
  });
});
