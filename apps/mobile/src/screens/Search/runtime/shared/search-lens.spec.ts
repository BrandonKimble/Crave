// THE LENS AXIS (lens-exit design S1 vocabulary + S2 key laws) — the RED contracts.
import {
  IDLE_SEARCH_DESIRED_TUPLE,
  areSearchLensesEqual,
  areSearchWorldIdentitiesEqual,
  buildSearchCardsWorldKey,
  buildSearchLensKey,
  buildSearchWorldSliceKey,
  searchWorldGroupOfSliceKey,
  selectSearchLens,
  type SearchDesiredTuple,
} from './search-desired-state-contract';

const makeTuple = (overrides: Partial<SearchDesiredTuple> = {}): SearchDesiredTuple => ({
  ...IDLE_SEARCH_DESIRED_TUPLE,
  queryIdentity: { kind: 'natural', query: 'tacos' },
  ...overrides,
});

describe('the lens axis (S1 vocabulary)', () => {
  it('a lens flip changes the LENS, never the WORLD IDENTITY (M-1: no session/world mint)', () => {
    const base = makeTuple();
    const lensed = makeTuple({
      filterVariant: { ...base.filterVariant, openNow: true, rising: true, priceLevels: [1, 2] },
    });
    expect(areSearchLensesEqual(selectSearchLens(base), selectSearchLens(lensed))).toBe(false);
    expect(areSearchWorldIdentitiesEqual(base, lensed)).toBe(true);
  });

  it('includeSimilar is IDENTITY (retrieval-semantic), not lens', () => {
    const base = makeTuple();
    const similar = makeTuple({
      filterVariant: { ...base.filterVariant, includeSimilar: true },
    });
    expect(areSearchWorldIdentitiesEqual(base, similar)).toBe(false);
    expect(areSearchLensesEqual(selectSearchLens(base), selectSearchLens(similar))).toBe(true);
  });

  it('the lens key is stable and canonical for the default lens', () => {
    expect(buildSearchLensKey(selectSearchLens(makeTuple()))).toBe(
      buildSearchLensKey(selectSearchLens(makeTuple()))
    );
    expect(buildSearchLensKey(selectSearchLens(makeTuple()))).toBe('open:0|price:|rising:0');
  });

  it('S2 DECOMPOSITION IS LOSSLESS: sliceKey = worldKey ## lensKey carries every axis the flat key carried', () => {
    // The S1 guard's successor: the worldKey is now PURE IDENTITY (no lens tokens);
    // the slice key composes the two axes and must lose NOTHING the old flat key held.
    const tuple = makeTuple({
      filterVariant: {
        openNow: true,
        priceLevels: [2],
        rising: false,
        includeSimilar: true,
        listSort: 'best',
        marketKey: 'region-us-tx-austin',
      },
    });
    const worldKey = buildSearchCardsWorldKey(tuple);
    const lensKey = buildSearchLensKey(selectSearchLens(tuple));
    const sliceKey = buildSearchWorldSliceKey(tuple);
    // Identity side: similar only — no lens token may appear in the worldKey.
    expect(worldKey).toContain('similar:1');
    expect(worldKey).not.toContain('open:');
    expect(worldKey).not.toContain('rising:');
    expect(worldKey).not.toContain('sort:');
    expect(worldKey).not.toContain('mkt:');
    // Lens side carries the rest, and the slice key is the exact composition.
    expect(lensKey).toBe('open:1|price:2|rising:0|sort:best|mkt:region-us-tx-austin');
    expect(sliceKey).toBe(`${worldKey}##${lensKey}`);
    expect(searchWorldGroupOfSliceKey(sliceKey)).toBe(worldKey);
  });

  it('a lens flip keeps the worldKey (group) and changes only the slice', () => {
    const base = makeTuple();
    const lensed = makeTuple({
      filterVariant: { ...base.filterVariant, openNow: true },
    });
    expect(buildSearchCardsWorldKey(base)).toBe(buildSearchCardsWorldKey(lensed));
    expect(buildSearchWorldSliceKey(base)).not.toBe(buildSearchWorldSliceKey(lensed));
    expect(searchWorldGroupOfSliceKey(buildSearchWorldSliceKey(lensed))).toBe(
      buildSearchCardsWorldKey(base)
    );
  });

  it('identity equality still respects bounds and tab (world-key facts)', () => {
    const base = makeTuple();
    expect(areSearchWorldIdentitiesEqual(base, makeTuple({ tab: 'dishes' }))).toBe(false);
  });
});
