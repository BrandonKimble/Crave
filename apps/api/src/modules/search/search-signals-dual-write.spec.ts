import 'reflect-metadata';
import { SearchService } from './search.service';
import { SignalsService } from '../signals/signals.service';

// DUAL-WRITE milestone spec (master plan §22): a page-1 backend search submit
// records a §3 signal BESIDE the old search_events writers, and a signals
// failure never affects the search path.

const USER_ID = '11111111-1111-1111-1111-111111111111';
const FOOD_ID = '33333333-3333-3333-3333-333333333333';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const SEARCH_REQUEST_ID = '55555555-5555-5555-5555-555555555555';
const CACHE_REVEAL_REQUEST_ID = '66666666-6666-6666-6666-666666666666';

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

type SignalCreateArgs = [{ data: Record<string, unknown> }];

function createHarness(options: { searchLogEnabled?: boolean } = {}) {
  const signalsPrisma = {
    signal: {
      create: jest
        .fn<Promise<unknown>, SignalCreateArgs>()
        .mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest.fn().mockResolvedValue({ actorId: ACTOR_ID }),
    },
    // Cache-reveal geo resolves through the original event's primary market.
    market: {
      findFirst: jest.fn().mockResolvedValue({
        bboxNeLat: '30.4',
        bboxNeLng: '-97.6',
        bboxSwLat: '30.1',
        bboxSwLng: '-97.9',
        centerLatitude: '30.27',
        centerLongitude: '-97.74',
      }),
    },
  };
  const signals = new SignalsService(
    signalsPrisma as never,
    createLogger() as never,
  );
  const searchPrisma = {
    searchEvent: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  // searchLogEnabled is captured from the env at construction time.
  const previousFlag = process.env.SEARCH_LOG_ENABLED;
  process.env.SEARCH_LOG_ENABLED =
    options.searchLogEnabled === false ? 'false' : 'true';
  let service: SearchService;
  try {
    service = new SearchService(
      createLogger() as never, // loggerService
      {} as never, // queryExecutor
      {} as never, // queryBuilder
      {} as never, // entityExpansion
      {} as never, // siblingExpansion
      {} as never, // onDemandRequestService
      {} as never, // searchMetrics
      {} as never, // textSanitizer
      searchPrisma as never, // prisma
      {} as never, // marketRegistry
      {} as never, // restaurantStatusService
      signals, // signals ledger (§3 dual-write)
      {} as never, // signalDemandRead (recent-searches reader; unused here)
      {} as never, // placesCatalog (§22 cut 3 — unused on these paths)
      {} as never, // placesReconciler
    );
  } finally {
    if (previousFlag === undefined) {
      delete process.env.SEARCH_LOG_ENABLED;
    } else {
      process.env.SEARCH_LOG_ENABLED = previousFlag;
    }
  }
  return { service, signals, signalsPrisma, searchPrisma };
}

function buildRequest() {
  return {
    entities: { food: [], restaurants: [] },
    bounds: {
      northEast: { lat: 30.4, lng: -97.6 },
      southWest: { lat: 30.1, lng: -97.9 },
    },
    sourceQuery: 'birria tacos',
    userId: USER_ID,
    submissionSource: 'autocomplete',
    submissionContext: {
      selectedEntityId: FOOD_ID,
      selectedEntityType: 'food',
    },
  } as never;
}

const CONTEXT = {
  searchRequestId: SEARCH_REQUEST_ID,
  totalResults: 12,
  totalFoodResults: 9,
  totalRestaurantResults: 3,
  queryExecutionTimeMs: 42,
  resultCoverageStatus: 'full' as const,
};

const MARKET_CONTEXT = {
  marketKey: 'austin',
  attributionMarketKeys: ['austin'],
  collectableMarketKeys: ['austin'],
} as never;

type RecordQueryImpressions = (
  request: unknown,
  context: unknown,
  marketKeys: unknown,
) => Promise<void>;

function invokeImpressions(service: SearchService): Promise<void> {
  const target = service as unknown as {
    recordQueryImpressions: RecordQueryImpressions;
  };
  return target.recordQueryImpressions(buildRequest(), CONTEXT, MARKET_CONTEXT);
}

describe('search submit dual-write (§3 signals beside the old search log)', () => {
  it('records search + autocomplete_selection signals AND the old search_events row', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();

    await invokeImpressions(service);
    await flush();

    // Old writer untouched and still firing.
    expect(searchPrisma.searchEvent.upsert).toHaveBeenCalledTimes(1);

    // New ledger rows beside it: the search act + the selection act.
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(2);
    const kinds = signalsPrisma.signal.create.mock.calls.map(
      (call) => call[0].data.kind,
    );
    expect(kinds.sort()).toEqual(['autocomplete_selection', 'search']);

    const searchSignal = signalsPrisma.signal.create.mock.calls
      .map((call) => call[0].data)
      .find((data) => data.kind === 'search');
    expect(searchSignal).toBeDefined();
    expect(searchSignal?.subjectType).toBe('entity');
    expect(searchSignal?.subjectId).toBe(FOOD_ID);
    // §22 item 6: the search act carries BOTH subject halves — the resolved
    // entity AND the query term (recent-search readers consume the term).
    expect(searchSignal?.subjectText).toBe('birria tacos');
    expect(searchSignal?.geoMinLat).toBe(30.1);
    expect(searchSignal?.geoMaxLat).toBe(30.4);
    expect(searchSignal?.geoMinLng).toBe(-97.9);
    expect(searchSignal?.geoMaxLng).toBe(-97.6);
    // Finding A: the client-suppliable submit id is IN the ledger row, so a
    // client retry (same searchRequestId) is read-time dedupable forever.
    expect(searchSignal?.meta).toEqual({
      searchRequestId: SEARCH_REQUEST_ID,
      resultCount: 12,
      restaurantCount: 3,
      cached: false,
      resolvedEntityId: FOOD_ID,
    });

    const selectionSignal = signalsPrisma.signal.create.mock.calls
      .map((call) => call[0].data)
      .find((data) => data.kind === 'autocomplete_selection');
    expect(selectionSignal?.meta).toEqual({
      searchRequestId: SEARCH_REQUEST_ID,
    });
  });

  it('a signals-ledger failure never affects the search response path', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();
    signalsPrisma.signal.create.mockRejectedValue(new Error('ledger down'));

    await expect(invokeImpressions(service)).resolves.toBeUndefined();
    await flush();

    // The old writer (the response-side record) still completed.
    expect(searchPrisma.searchEvent.upsert).toHaveBeenCalledTimes(1);
  });
});

function buildOriginalEvent(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    eventId: '77777777-7777-7777-7777-777777777777',
    searchRequestId: SEARCH_REQUEST_ID,
    userId: USER_ID,
    queryText: 'birria tacos',
    eventKind: 'backend',
    primaryMarketKey: 'austin',
    totalResults: 12,
    totalFoodResults: 9,
    totalRestaurantResults: 3,
    queryExecutionTimeMs: 42,
    marketStatus: 'full',
    metadata: {},
    entities: [],
    ...overrides,
  };
}

function revealDto(): never {
  return {
    originalBackendSearchRequestId: SEARCH_REQUEST_ID,
    cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
    submissionSource: 'history',
    cacheAgeMs: 1200,
    resultsDataKey: 'rk-1',
  } as never;
}

describe('cache reveal dual-write (§3 signal fires for ANY successful reveal)', () => {
  it('a term-only reveal (no entity attribution) writes a term-subject signal while the old writer skips', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();
    searchPrisma.searchEvent.findFirst.mockResolvedValue(
      buildOriginalEvent({ entities: [] }),
    );

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    // Old writer: no entity rows to clone -> unchanged early-out.
    expect(searchPrisma.searchEvent.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0 });

    // New ledger: the reveal is still a search act with a term subject.
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('search');
    expect(data.subjectType).toBe('term');
    expect(data.subjectText).toBe('birria tacos');
    // Geo = the original event's primary-market bbox.
    expect(data.geoMinLat).toBe(30.1);
    expect(data.geoMaxLat).toBe(30.4);
    // Findings B/C: the reveal id makes concurrent duplicates read-time
    // dedupable; the original id ties the reveal to its backend search.
    expect(data.meta).toEqual({
      cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
      originalBackendSearchRequestId: SEARCH_REQUEST_ID,
      resultCount: 12,
      restaurantCount: 3,
      cached: true,
    });
  });

  it('searchLogEnabled=false still writes the signal while the old writer skips', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness({
      searchLogEnabled: false,
    });
    searchPrisma.searchEvent.findFirst.mockResolvedValue(
      buildOriginalEvent({
        entities: [
          {
            entityId: FOOD_ID,
            entityType: 'food',
            marketKey: 'austin',
            collectableMarketKey: 'austin',
          },
        ],
      }),
    );

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    // Legacy flag governs ONLY the old writer — the append-only ledger keeps
    // its cached-search stream (a reveal never written can never be
    // backfilled).
    expect(searchPrisma.searchEvent.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0 });

    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('search');
    expect(data.subjectType).toBe('entity');
    expect(data.subjectId).toBe(FOOD_ID);
    expect(data.meta).toMatchObject({
      cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
      cached: true,
    });
  });

  it('with the flag on and entity attribution, BOTH writers fire', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();
    searchPrisma.searchEvent.findFirst.mockResolvedValue(
      buildOriginalEvent({
        entities: [
          {
            entityId: FOOD_ID,
            entityType: 'food',
            marketKey: 'austin',
            collectableMarketKey: 'austin',
          },
        ],
      }),
    );

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(searchPrisma.searchEvent.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ inserted: 1 });
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
  });

  it('an already-recorded reveal id (client retry) writes neither', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();
    searchPrisma.searchEvent.findUnique.mockResolvedValue({
      eventId: 'existing',
    });

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(result).toEqual({ inserted: 0 });
    expect(searchPrisma.searchEvent.upsert).not.toHaveBeenCalled();
    expect(signalsPrisma.signal.create).not.toHaveBeenCalled();
  });
});
