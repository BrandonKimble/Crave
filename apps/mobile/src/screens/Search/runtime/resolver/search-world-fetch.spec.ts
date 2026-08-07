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

// F5700: the ENTITY lane's entry-surface provenance. The trigger declares it
// (`submissionSource: 'recent'` from a recent-search row, the user's real typed prefix)
// and it rides the decoration exactly as the natural lane's does. Both fields used to be
// CONSTANTS here — `'autocomplete'` and the entity's own display name — so a recent tap
// and a deep link both reported themselves as autocomplete submissions with a "typed
// prefix" the user never typed, and recall telemetry could not tell the surfaces apart.
//
// MUTATION PROOF: restore either constant (`submissionSource: 'autocomplete'`, or the
// `?? identity.displayName` typedPrefix fallthrough) and the matching spec goes RED.
describe('search-world-fetch — entity provenance is declared, never assumed', () => {
  const entityTuple = (entityType: 'restaurant' | 'food'): SearchDesiredTuple => ({
    ...listTuple(null),
    queryIdentity: {
      kind: 'entity',
      entityType,
      entityId: 'r-1',
      displayName: 'Thai Fresh',
    },
  });

  const captureEntityPayload = async (
    entityType: 'restaurant' | 'food',
    requestDecoration?: { submissionSource?: string; submissionContext?: Record<string, unknown> }
  ) => {
    const env = createEnv();
    const sentPayloads: Array<{
      submissionSource?: string;
      submissionContext?: Record<string, unknown>;
    }> = [];
    env.runSearch = async (request) => {
      sentPayloads.push(request.payload);
      return { kind: 'response', response: RESPONSE };
    };
    const outcome = await createSearchWorldFetcher(env)({
      tuple: entityTuple(entityType),
      requestDecoration,
    });
    expect(outcome.kind).toBe('resolved');
    expect(sentPayloads).toHaveLength(1);
    return sentPayloads[0];
  };

  it('a recent-submit tap reaches the structured wire as recent, with the real typed prefix', async () => {
    const payload = await captureEntityPayload('restaurant', {
      submissionSource: 'recent',
      submissionContext: { typedPrefix: 'thai' },
    });
    expect(payload.submissionSource).toBe('recent');
    expect(payload.submissionContext?.typedPrefix).toBe('thai');
    // The display name is NOT smuggled in as something the user typed.
    expect(payload.submissionContext?.typedPrefix).not.toBe('Thai Fresh');
  });

  it('carries the same declared provenance on the food/attribute (natural) entity arm', async () => {
    const payload = await captureEntityPayload('food', {
      submissionSource: 'recent',
      submissionContext: { typedPrefix: 'pad see ew' },
    });
    expect(payload.submissionSource).toBe('recent');
    expect(payload.submissionContext?.typedPrefix).toBe('pad see ew');
  });

  it('an autocomplete tap still declares autocomplete — the constant was not the only truth', async () => {
    const payload = await captureEntityPayload('restaurant', {
      submissionSource: 'autocomplete',
      submissionContext: { typedPrefix: 'thai f' },
    });
    expect(payload.submissionSource).toBe('autocomplete');
    expect(payload.submissionContext?.typedPrefix).toBe('thai f');
  });

  it('omits typedPrefix entirely when no trigger declared one (never the display name)', async () => {
    const payload = await captureEntityPayload('restaurant', { submissionSource: 'recent' });
    expect(payload.submissionContext).not.toHaveProperty('typedPrefix');
  });
});
