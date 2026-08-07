/**
 * The identity→fetch table — LIST worlds (list-detail choreography leg):
 * favorites lists and app-curated lists ride ONE lane. The tuple's list
 * identity routes only the FETCH seam by `source`; everything downstream
 * (world value construction, list-axis tab adopt, the committedResponse the
 * fitAll members derive from) is the SAME code path. RED-provable: if curated
 * forked to a different lane (or leaked into the favorites fetch), the
 * cross-assertions here fail.
 */
// The constants module drags react-native (Dimensions) into the hermetic node
// project — stub the one constant the fetch table reads.
jest.mock('../../constants/search', () => ({ DEFAULT_PAGE_SIZE: 20 }));

import { createSearchWorldFetcher, type SearchWorldFetchEnv } from './search-world-fetch';
import type { SearchDesiredTuple } from '../shared/search-desired-state-contract';
import { mapCuratedDetailToSearchResponse } from '../../../../services/curated-list-adapter';
import type { CuratedListDetailResponse } from '../../../../services/home';

const CURATED_DETAIL: CuratedListDetailResponse = {
  listId: 'list-1',
  title: 'Hidden gems',
  subtitle: null,
  iconKey: 'gem',
  listType: 'restaurant',
  recipeKey: 'hidden_gems',
  rotationKey: '2026-07-26',
  scope: 'global',
  city: { placeId: 'place-1', name: 'Austin' },
  itemCount: 2,
  builtAt: '2026-07-26T00:00:00Z',
  viewerRole: 'viewer',
  items: [
    {
      rank: 1,
      entityId: 'r-1',
      restaurantId: null,
      connectionId: null,
      label: 'Quiet Corner',
      subLabel: 'Austin',
      latitude: 30.27,
      longitude: -97.74,
      craveScore: 9.1,
      craveScoreExact: 0.97,
      rising: null,
    },
    {
      rank: 2,
      entityId: 'r-2',
      restaurantId: null,
      connectionId: null,
      label: 'Second Spot',
      subLabel: 'Austin',
      latitude: 30.3,
      longitude: -97.7,
      craveScore: 8.4,
      craveScoreExact: 0.91,
      rising: null,
    },
  ],
};

const RESPONSE = mapCuratedDetailToSearchResponse(CURATED_DETAIL);

const listTuple = (source: 'curated' | null): SearchDesiredTuple => ({
  queryIdentity: {
    kind: 'list',
    listId: 'list-1',
    listType: 'restaurant',
    displayTitle: 'Hidden gems',
    targetUserId: null,
    shareSlug: null,
    source,
  },
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

const createEnv = (): SearchWorldFetchEnv & {
  getFavoritesListResults: jest.Mock;
  getCuratedListResults: jest.Mock;
} => ({
  runSearch: jest.fn(async () => {
    throw new Error('list worlds must never hit runSearch');
  }),
  userLocationRef: { current: null },
  shortcutCoverage: jest.fn(async () => {
    throw new Error('list worlds must never fetch shortcut coverage');
  }) as unknown as SearchWorldFetchEnv['shortcutCoverage'],
  getFavoritesListResults: jest.fn(async () => RESPONSE),
  getCuratedListResults: jest.fn(async () => RESPONSE),
});

/** The fetch answers an OUTCOME (F4800): callers narrow, they never assume. */
const resolvedWorld = async (
  fetcher: ReturnType<typeof createSearchWorldFetcher>,
  tuple: SearchDesiredTuple
) => {
  const outcome = await fetcher({ tuple });
  if (outcome.kind !== 'resolved') {
    throw new Error(`expected a resolved world, got '${outcome.kind}'`);
  }
  return outcome;
};

describe('search-world-fetch — the ONE list-world lane, source-routed fetch seam', () => {
  it('a favorites list identity fetches through getFavoritesListResults (never the curated read)', async () => {
    const env = createEnv();
    const fetcher = createSearchWorldFetcher(env);
    const result = await resolvedWorld(fetcher, listTuple(null));
    expect(env.getFavoritesListResults).toHaveBeenCalledWith('list-1', expect.any(Object));
    expect(env.getCuratedListResults).not.toHaveBeenCalled();
    expect(result.value.committedResponse).toBe(RESPONSE);
  });

  it('a curated list identity fetches through getCuratedListResults (never the favorites read)', async () => {
    const env = createEnv();
    const fetcher = createSearchWorldFetcher(env);
    const result = await resolvedWorld(fetcher, listTuple('curated'));
    expect(env.getCuratedListResults).toHaveBeenCalledWith('list-1');
    expect(env.getFavoritesListResults).not.toHaveBeenCalled();
    expect(result.value.committedResponse).toBe(RESPONSE);
  });

  it('both sources produce the SAME world session payload (source-agnostic choreography input)', async () => {
    const env = createEnv();
    const fetcher = createSearchWorldFetcher(env);
    const favorites = await resolvedWorld(fetcher, listTuple(null));
    const curated = await resolvedWorld(fetcher, listTuple('curated'));
    // The list-axis tab adopt runs for BOTH (same presentation rule)…
    expect(curated.adoptedTab).toBe(favorites.adoptedTab);
    // …and the fitAll members derive from committedResponse rows — identical
    // coordinates in, identical camera session input out.
    const membersOf = (value: { committedResponse: typeof RESPONSE }) =>
      (value.committedResponse.restaurants ?? []).map((row) => [row.latitude, row.longitude]);
    expect(membersOf(curated.value)).toEqual(membersOf(favorites.value));
    expect(membersOf(curated.value)).toHaveLength(2);
    // Neither lane collapses to the single-restaurant profile (lists keep the
    // list+toggle surface).
    expect(favorites.value.singleRestaurantCandidate).toBeNull();
    expect(curated.value.singleRestaurantCandidate).toBeNull();
  });
});

// F4800: the abort observed by the request layer PROPAGATES as the fetch's own outcome.
// It used to be a `null` this file re-narrated into `throw new Error('… returned no
// response')` for the resolver to string-match back into a boolean.
describe('search-world-fetch — an aborted request is an outcome, not a sentence', () => {
  const naturalTuple: SearchDesiredTuple = {
    ...listTuple(null),
    queryIdentity: { kind: 'natural', query: 'tacos' },
  };

  it('propagates the aborted arm instead of throwing', async () => {
    const env = createEnv();
    env.runSearch = jest.fn(async () => ({ kind: 'aborted' }) as const);
    const outcome = await createSearchWorldFetcher(env)({ tuple: naturalTuple });
    expect(outcome).toEqual({ kind: 'aborted' });
  });
});
