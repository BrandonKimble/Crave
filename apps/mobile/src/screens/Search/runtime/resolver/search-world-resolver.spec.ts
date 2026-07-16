// The RN logger reads __DEV__ at module scope; this suite runs in plain node.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
jest.mock('../../../../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createSearchWorldResolver } from './search-world-resolver';
import type { SearchWorldValue } from './search-world-presentation-seam';
import {
  IDLE_SEARCH_DESIRED_TUPLE,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';

const makeTuple = (overrides: Partial<SearchDesiredTuple> = {}): SearchDesiredTuple => ({
  ...IDLE_SEARCH_DESIRED_TUPLE,
  queryIdentity: { kind: 'shortcut', shortcutTab: 'restaurants' },
  tab: 'restaurants',
  ...overrides,
});

const makeValue = (overrides: Partial<SearchWorldValue> = {}): SearchWorldValue => ({
  committedResponse: {
    restaurants: [],
    dishes: [],
    metadata: { searchRequestId: 'req-1', page: 1 },
  } as never,
  queryIdentity: { kind: 'shortcut', shortcutTab: 'restaurants' },
  markerProjectionByTab: { dishes: null, restaurants: null },
  resultsIdentityKey: 'idkey-1',
  searchRequestId: 'req-1',
  rootBusResultsPatch: {
    resultsIdentityCandidateKey: 'idkey-1',
    resultsDishCount: 0,
    resultsRestaurantCount: 0,
  },
  paginationMeta: {
    page: 1,
    hasMoreFood: false,
    hasMoreRestaurants: true,
    isPaginationExhausted: false,
    canLoadMore: true,
    totalRestaurantResults: 40,
    totalFoodResults: 0,
  },
  coverageByTab: {},
  ...overrides,
});

const makeHarness = (tuple: SearchDesiredTuple) => {
  const busState: { desiredTuple: SearchDesiredTuple; desiredTupleGeneration: number } & Record<
    string,
    unknown
  > = { desiredTuple: tuple, desiredTupleGeneration: 1 };
  const published: Array<Record<string, unknown>> = [];
  const commits: Array<{ worldId: string; isVersionUpdate: boolean }> = [];
  const seam = {
    beginResolution: jest.fn(),
    commitWorldToMountedState: jest.fn(
      (args: { worldId: string; isVersionUpdateOfPresentedWorld?: boolean }) => {
        commits.push({
          worldId: args.worldId,
          isVersionUpdate: Boolean(args.isVersionUpdateOfPresentedWorld),
        });
      }
    ),
    failResolution: jest.fn(),
  };
  const searchRuntimeBus = {
    getState: () => busState,
    publish: (patch: Record<string, unknown>) => {
      published.push(patch);
      Object.assign(busState, patch);
    },
    batch: (run: () => void) => run(),
    subscribe: () => () => {},
  };
  return { busState, published, commits, seam, searchRuntimeBus };
};

describe('search-world-resolver resolveNextPage', () => {
  it('appends into the SAME identity as a version bump (no page-one choreography)', async () => {
    const tuple = makeTuple();
    const h = makeHarness(tuple);
    const resolver = createSearchWorldResolver({
      searchRuntimeBus: h.searchRuntimeBus as never,
      seam: h.seam as never,
      fetchWorldForTuple: async () => ({
        value: makeValue(),
        dataReadyFrom: 'network',
        searchInputKey: null,
      }),
      fetchNextPageForTuple: async ({ targetPage }) => ({
        value: makeValue({
          paginationMeta: {
            ...makeValue().paginationMeta,
            page: targetPage,
            canLoadMore: false,
            hasMoreRestaurants: false,
          },
        }),
        dataReadyFrom: 'network',
        searchInputKey: null,
      }),
      now: () => 0,
    });
    await resolver.resolve({ tuple, generation: 1, cause: 'initial_submit' });
    expect(h.commits).toEqual([
      { worldId: expect.stringContaining('@v1'), isVersionUpdate: false },
    ]);
    await resolver.resolveNextPage();
    expect(h.commits[1]).toEqual({
      worldId: expect.stringContaining('@v2'),
      isVersionUpdate: true,
    });
  });

  it('a superseded append (desire moved mid-fetch) caches without presenting', async () => {
    const tuple = makeTuple();
    const h = makeHarness(tuple);
    let releaseFetch: () => void = () => {};
    const resolver = createSearchWorldResolver({
      searchRuntimeBus: h.searchRuntimeBus as never,
      seam: h.seam as never,
      fetchWorldForTuple: async () => ({
        value: makeValue(),
        dataReadyFrom: 'network',
        searchInputKey: null,
      }),
      fetchNextPageForTuple: () =>
        new Promise((resolve) => {
          releaseFetch = () =>
            resolve({ value: makeValue(), dataReadyFrom: 'network', searchInputKey: null });
        }),
      now: () => 0,
    });
    await resolver.resolve({ tuple, generation: 1, cause: 'initial_submit' });
    const appendPromise = resolver.resolveNextPage();
    // Desire moves (retoggle) while page 2 is in flight:
    h.busState.desiredTuple = makeTuple({
      filterVariant: { ...tuple.filterVariant, openNow: true },
    });
    releaseFetch();
    await appendPromise;
    // Only the page-1 present — the superseded append never committed to the screen.
    expect(h.commits).toHaveLength(1);
    // ...and the loading bracket was closed.
    expect(h.published.some((p) => p.isLoadingMore === false)).toBe(true);
  });

  it('refuses to append when the world reports no more pages', async () => {
    const tuple = makeTuple();
    const h = makeHarness(tuple);
    const fetchNextPage = jest.fn();
    const resolver = createSearchWorldResolver({
      searchRuntimeBus: h.searchRuntimeBus as never,
      seam: h.seam as never,
      fetchWorldForTuple: async () => ({
        value: makeValue({
          paginationMeta: {
            ...makeValue().paginationMeta,
            canLoadMore: false,
            hasMoreRestaurants: false,
          },
        }),
        dataReadyFrom: 'network',
        searchInputKey: null,
      }),
      fetchNextPageForTuple: fetchNextPage as never,
      now: () => 0,
    });
    await resolver.resolve({ tuple, generation: 1, cause: 'initial_submit' });
    await resolver.resolveNextPage();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('dedupes concurrent load-mores for the same identity', async () => {
    const tuple = makeTuple();
    const h = makeHarness(tuple);
    let fetchCount = 0;
    let releaseFetch: () => void = () => {};
    const resolver = createSearchWorldResolver({
      searchRuntimeBus: h.searchRuntimeBus as never,
      seam: h.seam as never,
      fetchWorldForTuple: async () => ({
        value: makeValue(),
        dataReadyFrom: 'network',
        searchInputKey: null,
      }),
      fetchNextPageForTuple: () => {
        fetchCount += 1;
        return new Promise((resolve) => {
          releaseFetch = () =>
            resolve({ value: makeValue(), dataReadyFrom: 'network', searchInputKey: null });
        });
      },
      now: () => 0,
    });
    await resolver.resolve({ tuple, generation: 1, cause: 'initial_submit' });
    const first = resolver.resolveNextPage();
    const second = resolver.resolveNextPage();
    releaseFetch();
    await Promise.all([first, second]);
    expect(fetchCount).toBe(1);
  });
});
