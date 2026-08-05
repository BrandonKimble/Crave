import {
  DEFAULT_SEARCH_FILTER_VARIANT,
  areSearchLensesEqual,
  buildSearchLensKey,
  selectSearchLens,
  type SearchDesiredTuple,
} from './search-desired-state-contract';

const tupleWith = (dietary: string[]): SearchDesiredTuple => ({
  queryIdentity: { kind: 'idle' },
  filterVariant: { ...DEFAULT_SEARCH_FILTER_VARIANT, dietary },
  committedBounds: null,
  tab: 'restaurants',
});

describe('dietary walls are a LENS (owner semantics 2026-08-04)', () => {
  it('defaults to no walls', () => {
    expect(DEFAULT_SEARCH_FILTER_VARIANT.dietary).toEqual([]);
  });

  it('a dietary flip changes the lens KEY (it re-slices the same world)', () => {
    const none = buildSearchLensKey(selectSearchLens(tupleWith([])));
    const vegan = buildSearchLensKey(selectSearchLens(tupleWith(['vegan'])));
    expect(vegan).not.toEqual(none);
    expect(vegan).toContain('diet:vegan');
  });

  it('order never distinguishes two lenses (a SET, not a list)', () => {
    const a = selectSearchLens(tupleWith(['vegan', 'halal']));
    const b = selectSearchLens(tupleWith(['halal', 'vegan']));
    expect(areSearchLensesEqual(a, b)).toBe(true);
    expect(buildSearchLensKey(a)).toEqual(buildSearchLensKey(b));
  });

  it('different wall sets are different lenses', () => {
    expect(
      areSearchLensesEqual(
        selectSearchLens(tupleWith(['vegan'])),
        selectSearchLens(tupleWith(['vegetarian']))
      )
    ).toBe(false);
  });
});
