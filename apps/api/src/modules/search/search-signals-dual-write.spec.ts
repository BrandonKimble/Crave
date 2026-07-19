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

function createHarness() {
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
    searchEvent: { upsert: jest.fn().mockResolvedValue({}) },
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
    {} as never, // marketRegistry
    {} as never, // restaurantStatusService
    signals, // signals ledger (§3 dual-write)
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
    expect(searchSignal?.geoMinLat).toBe(30.1);
    expect(searchSignal?.geoMaxLat).toBe(30.4);
    expect(searchSignal?.geoMinLng).toBe(-97.9);
    expect(searchSignal?.geoMaxLng).toBe(-97.6);
    expect(searchSignal?.meta).toEqual({
      resultCount: 12,
      restaurantCount: 3,
      cached: false,
      resolvedEntityId: FOOD_ID,
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
