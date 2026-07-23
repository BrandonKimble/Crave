import 'reflect-metadata';
import { SearchService } from './search.service';
import { SignalsService } from '../signals/signals.service';

// Phase C SINGLE-WRITE spec (the dual-write milestone closed): a page-1
// backend search submit records ONLY §3 signals — the search_events /
// search_event_entities writers are dead and the tables dropped — and a
// signals failure never affects the search path. Cache reveals clone the
// ORIGINAL search act from the ledger itself.

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

/** Ledger row shape returned by the raw original-act probe. */
function buildOriginalSignalRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    subject_id: null,
    subject_text: 'birria tacos',
    geo_min_lat: 30.1,
    geo_min_lng: -97.9,
    geo_max_lat: 30.4,
    geo_max_lng: -97.6,
    meta: {
      searchRequestId: SEARCH_REQUEST_ID,
      resultCount: 12,
      restaurantCount: 3,
      cached: false,
    },
    ...overrides,
  };
}

function createHarness(
  options: {
    revealRows?: unknown[];
    originalRows?: unknown[];
  } = {},
) {
  const signalsPrisma = {
    signal: {
      create: jest
        .fn<Promise<unknown>, SignalCreateArgs>()
        .mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest.fn().mockResolvedValue({ actorId: ACTOR_ID }),
    },
  };
  const signals = new SignalsService(
    signalsPrisma as never,
    createLogger() as never,
  );
  const searchPrisma = {
    // recordCacheAttribution probes the LEDGER: the reveal-exists check and
    // the original-act lookup (identified by its signal_actors join).
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('signal_actors')) {
        return Promise.resolve(options.originalRows ?? []);
      }
      return Promise.resolve(options.revealRows ?? []);
    }),
  };
  const service = new SearchService(
    createLogger() as never, // loggerService
    {} as never, // queryExecutor
    {} as never, // queryBuilder
    {} as never, // entityExpansion
    {} as never, // siblingExpansion
    {} as never, // onDemandRequestService
    {} as never, // searchMetrics
    {} as never, // textSanitizer
    searchPrisma as never, // prisma
    {
      resolveViewportCoverage: jest
        .fn()
        .mockResolvedValue({ share: 0, engines: [] }),
    } as never, // engineCoverage
    {} as never, // restaurantStatusService
    signals, // signals ledger (§3 — the ONE write path)
    {} as never, // signalDemandRead (recent-searches reader; unused here)
    {} as never, // placesCatalog (§22 cut 3 — unused on these paths)
    {} as never, // placesReconciler
    {
      enqueue: jest.fn().mockResolvedValue(undefined),
      noteHeaderAnswer: jest.fn(),
    } as never, // placesPromotions
  );
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

function invokeImpressions(service: SearchService): void {
  const target = service as unknown as {
    recordQueryImpressions: (request: unknown, context: unknown) => void;
  };
  target.recordQueryImpressions(buildRequest(), CONTEXT);
}

describe('search submit single-write (§3 signals are the ONE record)', () => {
  it('records search + autocomplete_selection signals — nothing else', async () => {
    const { service, signalsPrisma, searchPrisma } = createHarness();

    invokeImpressions(service);
    await flush();

    // No legacy table probes on the submit path.
    expect(searchPrisma.$queryRaw).not.toHaveBeenCalled();

    // The ledger rows: the search act + the selection act.
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
    // The client-suppliable submit id is IN the ledger row, so a client
    // retry (same searchRequestId) is read-time dedupable forever.
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
    // ECHO-KIND WRITER INVARIANT (poll-supply swap): the selection is by
    // construction an ECHO of its parent search act — it ALWAYS carries the
    // parent's searchRequestId and the parent 'search' row is written in the
    // same flow. ECHO_SIGNAL_KINDS (signals.service) derives from exactly
    // this; a standalone selection write would break the aggregate mass law.
    expect(
      (selectionSignal?.meta as { searchRequestId?: string }).searchRequestId,
    ).toBe(
      (searchSignal?.meta as { searchRequestId?: string }).searchRequestId,
    );
  });

  it('a signals-ledger failure never affects the search response path', async () => {
    const { service, signalsPrisma } = createHarness();
    signalsPrisma.signal.create.mockRejectedValue(new Error('ledger down'));

    expect(() => invokeImpressions(service)).not.toThrow();
    await flush();
  });
});

function revealDto(): never {
  return {
    originalBackendSearchRequestId: SEARCH_REQUEST_ID,
    cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
    submissionSource: 'history',
    cacheAgeMs: 1200,
    resultsDataKey: 'rk-1',
  } as never;
}

describe('cache reveal (§3: the ledger clones its OWN original act)', () => {
  it('a term-only reveal clones the original act as a term-subject cached search', async () => {
    const { service, signalsPrisma } = createHarness({
      originalRows: [buildOriginalSignalRow()],
    });

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(result).toEqual({ inserted: 1 });
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('search');
    expect(data.subjectType).toBe('term');
    expect(data.subjectText).toBe('birria tacos');
    // Geo = the ORIGINAL act's bbox (the reveal carries no bounds).
    expect(data.geoMinLat).toBe(30.1);
    expect(data.geoMaxLat).toBe(30.4);
    // The reveal id makes concurrent duplicates read-time dedupable; the
    // original id ties the reveal to its backend search act.
    expect(data.meta).toEqual({
      cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
      originalBackendSearchRequestId: SEARCH_REQUEST_ID,
      resultCount: 12,
      restaurantCount: 3,
      cached: true,
    });
  });

  it('an entity-resolved reveal keeps the entity subject', async () => {
    const { service, signalsPrisma } = createHarness({
      originalRows: [buildOriginalSignalRow({ subject_id: FOOD_ID })],
    });

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(result).toEqual({ inserted: 1 });
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.subjectType).toBe('entity');
    expect(data.subjectId).toBe(FOOD_ID);
    expect(data.meta).toMatchObject({
      cacheRevealRequestId: CACHE_REVEAL_REQUEST_ID,
      cached: true,
      resolvedEntityId: FOOD_ID,
    });
  });

  it('an already-recorded reveal id (client retry) writes nothing', async () => {
    const { service, signalsPrisma } = createHarness({
      revealRows: [{ signal_id: 'existing' }],
      originalRows: [buildOriginalSignalRow()],
    });

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(result).toEqual({ inserted: 0 });
    expect(signalsPrisma.signal.create).not.toHaveBeenCalled();
  });

  it('no original search act on the ledger -> nothing to clone', async () => {
    const { service, signalsPrisma } = createHarness({ originalRows: [] });

    const result = await service.recordCacheAttribution(revealDto(), USER_ID);
    await flush();

    expect(result).toEqual({ inserted: 0 });
    expect(signalsPrisma.signal.create).not.toHaveBeenCalled();
  });
});
