// F2307: the two price scales (slider BOUNDARY 1..5 exclusive-right vs Google
// price LEVEL 1..4 inclusive) are distinct types now, so a swap is a compile
// error rather than a silently-too-narrow price label. Types cannot be asserted
// at runtime, so this spec pins the BEHAVIOUR that the swap used to corrupt:
// the widening rule, the empty-levels default, and the level/boundary round trip.
import {
  buildLevelsFromRange,
  formatPriceRangeSummary,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  priceSliderRange,
  toPriceLevelRange,
} from './price';

describe('normalizePriceRangeValues', () => {
  it('orders an inverted range', () => {
    expect(normalizePriceRangeValues(priceSliderRange(4, 2))).toEqual(priceSliderRange(2, 4));
  });

  it('widens a zero-width range to the RIGHT when there is room', () => {
    expect(normalizePriceRangeValues(priceSliderRange(2, 2))).toEqual(priceSliderRange(2, 3));
  });

  it('widens to the LEFT at the top of the scale', () => {
    expect(normalizePriceRangeValues(priceSliderRange(5, 5))).toEqual(priceSliderRange(4, 5));
  });

  it('clamps out-of-scale input', () => {
    // priceSliderRange clamps on the way in — the scale cannot be escaped.
    expect(normalizePriceRangeValues(priceSliderRange(-3, 99))).toEqual(priceSliderRange(1, 5));
  });
});

describe('level / boundary conversion', () => {
  it('full slider range covers every level', () => {
    expect(buildLevelsFromRange(priceSliderRange(1, 5))).toEqual([1, 2, 3, 4]);
  });

  it('a boundary range excludes its right edge', () => {
    expect(buildLevelsFromRange(priceSliderRange(2, 4))).toEqual([2, 3]);
  });

  it('empty levels default to the FULL boundary range (no filter)', () => {
    expect(getRangeFromLevels([])).toEqual(priceSliderRange(1, 5));
    expect(isFullPriceRange(getRangeFromLevels([]))).toBe(true);
  });

  it('round trip: levels -> boundary range -> levels', () => {
    for (const levels of [[1], [2, 3], [1, 2, 3, 4], [4]]) {
      expect(buildLevelsFromRange(getRangeFromLevels(levels))).toEqual(levels);
    }
  });

  it('toPriceLevelRange turns an exclusive right boundary into an inclusive max level', () => {
    expect(toPriceLevelRange(priceSliderRange(1, 5))).toEqual([1, 4]);
    expect(toPriceLevelRange(priceSliderRange(2, 3))).toEqual([2, 2]);
  });
});

describe('formatPriceRangeSummary', () => {
  it('reads the FULL range as "Any price"', () => {
    expect(formatPriceRangeSummary(priceSliderRange(1, 5))).toBe('Any price');
  });

  it('is stable for a partial range', () => {
    const partial = priceSliderRange(2, 4);
    expect(formatPriceRangeSummary(partial)).toBe(formatPriceRangeSummary(priceSliderRange(2, 4)));
    // The swap this finding is about: feeding it an already-converted LEVEL
    // range is now a compile error, and would have read one band too narrow.
    expect(formatPriceRangeSummary(partial)).not.toBe(
      formatPriceRangeSummary(priceSliderRange(2, 3))
    );
  });
});
