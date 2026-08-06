/**
 * List identity `source` (list-detail choreography leg): a curated id and a
 * favorites id are different NAMESPACES — same uuid under the two sources must
 * be two different worlds (equality + world key), while absence of source keeps
 * exact backward compatibility with pre-leg favorites identities.
 */
import {
  areSearchQueryIdentitiesEqual,
  buildSearchCardsWorldKey,
  type SearchDesiredTuple,
  type SearchQueryIdentity,
} from './search-desired-state-contract';

const listIdentity = (source?: 'curated' | null): SearchQueryIdentity => ({
  kind: 'list',
  listId: 'L-1',
  listType: 'restaurant',
  displayTitle: 'Hidden gems',
  targetUserId: null,
  shareSlug: null,
  ...(source !== undefined ? { source } : {}),
});

const tupleOf = (identity: SearchQueryIdentity): SearchDesiredTuple => ({
  queryIdentity: identity,
  tab: 'restaurants',
  filterVariant: {
    openNow: false,
    dietary: [],
    priceLevels: [],
    rising: false,
    includeSimilar: false,
  },
  committedBounds: null,
});

describe('list identity source — namespacing, not presentation', () => {
  it('same list id under curated vs favorites is NOT the same identity', () => {
    expect(areSearchQueryIdentitiesEqual(listIdentity('curated'), listIdentity(null))).toBe(false);
  });

  it('absent and null source are the SAME identity (backward compatible)', () => {
    expect(areSearchQueryIdentitiesEqual(listIdentity(), listIdentity(null))).toBe(true);
  });

  it('the cards world key namespaces curated worlds; favorites keys are unchanged', () => {
    const favoritesKey = buildSearchCardsWorldKey(tupleOf(listIdentity(null)));
    const curatedKey = buildSearchCardsWorldKey(tupleOf(listIdentity('curated')));
    expect(curatedKey).not.toBe(favoritesKey);
    expect(curatedKey).toContain(':curated');
    expect(favoritesKey).toBe('list:L-1:restaurant||similar:0||none');
  });
});
