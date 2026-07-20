// RED-provable coverage for the desired-state contract decisions made in wave-4 §3
// (2026-07-13). These lock in the load-bearing key/identity rules so a future edit that
// violates them goes RED here:
//   - listSort / marketKey are LIST-world variant axes: they key the world ONLY when
//     present (the key-pollution guard, same principle as the bounds fix), and they
//     participate in filterVariant equality.
//   - targetUserId is IDENTITY (a virtual-All under two owners is two worlds) → it keys
//     the world and participates in list-identity equality.
//   - shareSlug is RT-18 ACCESS MATERIAL, never identity → it must NOT key the world and
//     must NOT affect equality (same viewer + same list = same world regardless of the
//     capability that opened it).

import {
  areSearchFilterVariantsEqual,
  areSearchQueryIdentitiesEqual,
  buildSearchCardsWorldKey,
  buildSearchWorldSliceKey,
  DEFAULT_SEARCH_FILTER_VARIANT,
  IDLE_SEARCH_DESIRED_TUPLE,
  type SearchDesiredTuple,
  type SearchFilterVariant,
  type SearchQueryIdentity,
} from './search-desired-state-contract';

const filterVariant = (overrides: Partial<SearchFilterVariant> = {}): SearchFilterVariant => ({
  ...DEFAULT_SEARCH_FILTER_VARIANT,
  ...overrides,
});

const listIdentity = (
  overrides: Partial<Extract<SearchQueryIdentity, { kind: 'list' }>> = {}
): Extract<SearchQueryIdentity, { kind: 'list' }> => ({
  kind: 'list',
  listId: 'list-1',
  listType: 'restaurant',
  displayTitle: 'Taco crawl',
  ...overrides,
});

const listTuple = (
  identityOverrides: Partial<Extract<SearchQueryIdentity, { kind: 'list' }>> = {},
  filterOverrides: Partial<SearchFilterVariant> = {}
): SearchDesiredTuple => ({
  ...IDLE_SEARCH_DESIRED_TUPLE,
  queryIdentity: listIdentity(identityOverrides),
  filterVariant: filterVariant(filterOverrides),
  tab: 'restaurants',
});

describe('SearchFilterVariant equality — list variant axes', () => {
  it('a listSort difference makes variants UNEQUAL', () => {
    expect(
      areSearchFilterVariantsEqual(
        filterVariant({ listSort: 'best' }),
        filterVariant({ listSort: 'recent' })
      )
    ).toBe(false);
  });

  it('a marketKey difference makes variants UNEQUAL', () => {
    expect(
      areSearchFilterVariantsEqual(
        filterVariant({ marketKey: 'austin' }),
        filterVariant({ marketKey: 'nyc' })
      )
    ).toBe(false);
  });

  it('absent vs explicitly-null marketKey are EQUAL (null-normalized)', () => {
    expect(areSearchFilterVariantsEqual(filterVariant(), filterVariant({ marketKey: null }))).toBe(
      true
    );
  });

  it('identical list variants are EQUAL', () => {
    expect(
      areSearchFilterVariantsEqual(
        filterVariant({ listSort: 'recent', marketKey: 'austin' }),
        filterVariant({ listSort: 'recent', marketKey: 'austin' })
      )
    ).toBe(true);
  });
});

describe('list query-identity equality — targetUserId is identity, shareSlug is not', () => {
  it('a targetUserId difference makes list identities UNEQUAL (scoping is identity)', () => {
    expect(
      areSearchQueryIdentitiesEqual(
        listIdentity({ targetUserId: 'u1' }),
        listIdentity({ targetUserId: 'u2' })
      )
    ).toBe(false);
  });

  it('a shareSlug difference does NOT change identity (RT-18 access material)', () => {
    expect(
      areSearchQueryIdentitiesEqual(
        listIdentity({ shareSlug: 'slug-a' }),
        listIdentity({ shareSlug: 'slug-b' })
      )
    ).toBe(true);
  });
});

describe('buildSearchCardsWorldKey — list variant + access-material key rules', () => {
  it('OMITS sort/market when absent (the default-slice world = one cache entry)', () => {
    const key = buildSearchCardsWorldKey(listTuple());
    expect(key).not.toContain('sort:');
    expect(key).not.toContain('mkt:');
  });

  it('sort/market are LENS axes (S2): they key the SLICE, never the world', () => {
    const base = listTuple();
    const sliced = listTuple({}, { listSort: 'recent', marketKey: 'austin' });
    expect(buildSearchCardsWorldKey(sliced)).toBe(buildSearchCardsWorldKey(base));
    const sliceKey = buildSearchWorldSliceKey(sliced);
    expect(sliceKey).toContain('sort:recent');
    expect(sliceKey).toContain('mkt:austin');
  });

  it('a market flip mints a DISTINCT slice (membership changes ⇒ different cache entry) of the SAME world', () => {
    const austin = listTuple({}, { marketKey: 'austin' });
    const nyc = listTuple({}, { marketKey: 'nyc' });
    expect(buildSearchWorldSliceKey(austin)).not.toBe(buildSearchWorldSliceKey(nyc));
    expect(buildSearchCardsWorldKey(austin)).toBe(buildSearchCardsWorldKey(nyc));
  });

  it('targetUserId KEYS the world (:u: segment) — same list, two owners = two worlds', () => {
    const scoped = buildSearchCardsWorldKey(listTuple({ targetUserId: 'u1' }));
    expect(scoped).toContain(':u:u1');
    expect(scoped).not.toBe(buildSearchCardsWorldKey(listTuple()));
  });

  it('shareSlug NEVER appears in the world key (access material, not identity)', () => {
    const withSlug = buildSearchCardsWorldKey(listTuple({ shareSlug: 'secret-slug' }));
    expect(withSlug).not.toContain('secret-slug');
    // and the slug does not change the key at all vs the same list without it
    expect(withSlug).toBe(buildSearchCardsWorldKey(listTuple()));
  });
});

// SEE-LOCATIONS mode (Leg 2 tail): the mode is IDENTITY-relevant on the entity
// kind — the same restaurant with/without it is two different worlds (the lean
// in-view-locations variant vs the ranked single-entity search).
describe('entity query-identity — seeLocations is identity', () => {
  const entityIdentity = (
    overrides: Partial<Extract<SearchQueryIdentity, { kind: 'entity' }>> = {}
  ): Extract<SearchQueryIdentity, { kind: 'entity' }> => ({
    kind: 'entity',
    entityType: 'restaurant',
    entityId: 'rest-1',
    displayName: "Torchy's Tacos",
    ...overrides,
  });

  it('seeLocations flips identity equality', () => {
    expect(
      areSearchQueryIdentitiesEqual(entityIdentity(), entityIdentity({ seeLocations: true }))
    ).toBe(false);
    expect(
      areSearchQueryIdentitiesEqual(
        entityIdentity({ seeLocations: true }),
        entityIdentity({ seeLocations: true })
      )
    ).toBe(true);
    // absent and explicit-false are the SAME world
    expect(
      areSearchQueryIdentitiesEqual(entityIdentity(), entityIdentity({ seeLocations: false }))
    ).toBe(true);
  });

  it('seeLocations KEYS the world (:seelocations segment)', () => {
    const plain: SearchDesiredTuple = {
      ...IDLE_SEARCH_DESIRED_TUPLE,
      queryIdentity: entityIdentity(),
    };
    const mode: SearchDesiredTuple = {
      ...IDLE_SEARCH_DESIRED_TUPLE,
      queryIdentity: entityIdentity({ seeLocations: true }),
    };
    expect(buildSearchCardsWorldKey(mode)).toContain(':seelocations');
    expect(buildSearchCardsWorldKey(mode)).not.toBe(buildSearchCardsWorldKey(plain));
  });
});
