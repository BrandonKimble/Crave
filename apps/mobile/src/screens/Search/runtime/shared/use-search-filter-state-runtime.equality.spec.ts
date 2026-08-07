import { areSearchFilterRuntimeStatesEqual } from './use-search-filter-state-runtime';

// F6409(c): priceLevels is an array. The selector's equality MUST compare it by
// value — the tuple writer can return a fresh (but value-equal) array on an
// unrelated filter write, and a reference `===` there re-renders every filter
// consumer spuriously. Reverting to `left.priceLevels === right.priceLevels`
// reds the first test.
describe('areSearchFilterRuntimeStatesEqual (F6409c)', () => {
  const base = {
    openNow: false,
    priceLevels: [1, 2] as readonly number[],
    includeSimilarActive: false,
    risingActive: false,
  };

  it('treats a fresh but value-equal priceLevels array as EQUAL (no spurious re-render)', () => {
    expect(
      areSearchFilterRuntimeStatesEqual(base, {
        ...base,
        priceLevels: [1, 2], // new reference, same values
      })
    ).toBe(true);
  });

  it('treats a genuinely different priceLevels set as NOT equal', () => {
    expect(areSearchFilterRuntimeStatesEqual(base, { ...base, priceLevels: [1, 3] })).toBe(false);
  });

  it('still distinguishes the scalar fields', () => {
    expect(areSearchFilterRuntimeStatesEqual(base, { ...base, openNow: true })).toBe(false);
    expect(areSearchFilterRuntimeStatesEqual(base, { ...base, risingActive: true })).toBe(false);
  });
});
