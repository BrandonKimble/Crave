/**
 * F5700 — THE ENTITY LANE'S ENTRY-SURFACE PROVENANCE, END TO END.
 *
 * `RunRestaurantEntitySearchParams` has always DECLARED `submissionSource` and
 * `typedPrefix`, and all five live call sites fill them honestly and differently (a recent
 * row and a deep link pass 'recent'; the autocomplete chip passes 'autocomplete'). The
 * owner body read neither, and the entity arm of search-world-fetch hardcoded
 * `submissionSource: 'autocomplete'` with the entity's own display name standing in for
 * the user's typed prefix — so every entity-tap search reached the backend claiming to be
 * an autocomplete submission, and recall telemetry keyed on submissionSource could not
 * tell a recent tap from an autocomplete tap.
 *
 * This spec drives the REAL seam, not a paraphrase of it: the owner registers on the real
 * decoration registry immediately before its tuple write, and the reconciler TAKES that
 * decoration at the kick the write produces (search-world-reconciler.ts:375) and hands it
 * to the fetcher. Here the take is explicit because no reconciler is subscribed.
 *
 * The owner's body is pure — no state, no effects — so React's memo hooks are the
 * identity functions they behave as on first render.
 *
 * MUTATION PROOF: restore `submissionSource: 'autocomplete'` in search-world-fetch's
 * entity arm, or drop the owner's `registerPendingSearchRequestDecoration` call, and this
 * spec goes RED.
 */
jest.mock('../constants/search', () => ({ DEFAULT_PAGE_SIZE: 20 }));
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    default: {
      ...actual,
      useCallback: <T>(callback: T): T => callback,
      useMemo: <T>(factory: () => T): T => factory(),
    },
    useCallback: <T>(callback: T): T => callback,
    useMemo: <T>(factory: () => T): T => factory(),
  };
});

import { useSearchStructuredSubmitOwner } from './use-search-structured-submit-owner';
import { takePendingSearchRequestDecoration } from '../runtime/reconciler/search-request-decoration-registry';
import {
  createSearchWorldFetcher,
  type SearchWorldFetchEnv,
} from '../runtime/resolver/search-world-fetch';
import { createSearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { SearchResponse } from '../../../types';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';

const RESPONSE: SearchResponse = {
  restaurants: [],
  dishes: [],
  metadata: { searchRequestId: 'req-1' },
} as unknown as SearchResponse;

const AUSTIN_BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

const createViewportBoundsService = (): ViewportBoundsService =>
  ({
    getBounds: () => AUSTIN_BOUNDS,
    getCamera: () => ({ center: [-97.74, 30.27] as [number, number], zoom: 12 }),
  }) as unknown as ViewportBoundsService;

/**
 * The entity tap, all the way to the wire: the owner writes the tuple (registering its
 * decoration first), the reconciler's take hands that decoration to the fetcher, and the
 * fetcher builds the request the backend actually receives.
 */
const submitEntityTapAndCaptureRequest = async (params: {
  placeId: string;
  placeName: string;
  submissionSource: 'recent' | 'autocomplete' | 'manual';
  typedPrefix?: string;
}) => {
  const searchRuntimeBus = createSearchRuntimeBus();
  // rules-of-hooks polices RENDER ordering. This owner has no state and no effects, so
  // there is no ordering to police: its body is a pure factory that the memo mocks above
  // reduce to a direct call. Running it outside React is the point — the real owner, not
  // a re-implementation of it.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const owner = useSearchStructuredSubmitOwner({
    searchRuntimeBus,
    viewportBoundsService: createViewportBoundsService(),
    captureFreshTupleBounds: async () => null,
    resetMapMoveFlag: () => undefined,
  });

  await owner.runRestaurantEntitySearch(params);

  // Exactly what the reconciler does at the kick this write produced.
  const requestDecoration = takePendingSearchRequestDecoration();

  const sentPayloads: Array<{
    submissionSource?: string;
    submissionContext?: Record<string, unknown>;
  }> = [];
  const env: SearchWorldFetchEnv = {
    runSearch: async (request) => {
      sentPayloads.push(request.payload);
      return { kind: 'response', response: RESPONSE };
    },
    userLocationRef: { current: null },
    shortcutCoverage: (() => {
      throw new Error('an entity world never fetches shortcut coverage');
    }) as unknown as SearchWorldFetchEnv['shortcutCoverage'],
    getFavoritesListResults: async () => {
      throw new Error('an entity world never reads a list');
    },
    getCuratedListResults: async () => {
      throw new Error('an entity world never reads a curated list');
    },
  };
  const outcome = await createSearchWorldFetcher(env)({
    tuple: searchRuntimeBus.getState().desiredTuple,
    requestDecoration,
  });
  expect(outcome.kind).toBe('resolved');
  expect(sentPayloads).toHaveLength(1);
  return sentPayloads[0];
};

describe('F5700 — an entity tap reports the surface it CAME FROM', () => {
  it('a recent-submit tap arrives as recent, carrying the real typed prefix', async () => {
    const payload = await submitEntityTapAndCaptureRequest({
      placeId: 'r-1',
      placeName: 'Thai Fresh',
      submissionSource: 'recent',
      typedPrefix: 'thai',
    });
    expect(payload.submissionSource).toBe('recent');
    expect(payload.submissionContext?.typedPrefix).toBe('thai');
  });

  it('an autocomplete chip tap arrives as autocomplete — the two surfaces are now distinguishable', async () => {
    const payload = await submitEntityTapAndCaptureRequest({
      placeId: 'r-1',
      placeName: 'Thai Fresh',
      submissionSource: 'autocomplete',
      typedPrefix: 'thai f',
    });
    expect(payload.submissionSource).toBe('autocomplete');
    expect(payload.submissionContext?.typedPrefix).toBe('thai f');
  });

  it('leaves no decoration behind for the next dispatch to inherit (RT-6)', async () => {
    await submitEntityTapAndCaptureRequest({
      placeId: 'r-1',
      placeName: 'Thai Fresh',
      submissionSource: 'recent',
      typedPrefix: 'thai',
    });
    expect(takePendingSearchRequestDecoration()).toBeUndefined();
  });
});
