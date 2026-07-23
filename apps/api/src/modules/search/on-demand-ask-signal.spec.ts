import 'reflect-metadata';
import { OnDemandRequestService } from './on-demand-request.service';
import { SignalsService } from '../signals/signals.service';
import { SignalDemandReadService } from '../signals/signal-demand-read.service';

// Phase C: the user-expressed collection gap is a SIGNAL (kind =
// 'on_demand_ask'), replacing collection_on_demand_ask_events. These specs
// pin (a) the write parity — term subject, viewport geo, meta qualifiers,
// site-shared ask id — and (b) the §11 unmet family's TERRITORY read shape.

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const ENTITY_ID = '33333333-3333-3333-3333-333333333333';
const SEARCH_REQUEST_ID = '55555555-5555-5555-5555-555555555555';
const PLACE_ID = '44444444-4444-4444-4444-444444444444';
const ENGINE_ID = '66666666-6666-6666-6666-666666666666';

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

describe('on_demand_ask signal write (Phase C ask-event replacement)', () => {
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
    const tx = {
      onDemandRequest: {
        upsert: jest.fn().mockResolvedValue({ requestId: 'req-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      onDemandRequestUser: {
        upsert: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (fn: (client: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
      ),
      onDemandRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OnDemandRequestService(
      prisma as never,
      createLogger() as never,
      signals,
    );
    return { service, signalsPrisma, prisma, tx };
  }

  it('records one on_demand_ask signal per gap: term subject, viewport geo, judged-at-read qualifiers', async () => {
    const { service, signalsPrisma } = createHarness();

    await service.recordRequests(
      [
        {
          term: 'khachapuri',
          entityType: 'food' as never,
          reason: 'unresolved' as never,
          entityId: null,
          engineIds: [ENGINE_ID],
        },
      ],
      { userId: USER_ID },
      {
        searchRequestId: SEARCH_REQUEST_ID,
        restaurantCount: 2,
        foodCount: 0,
        source: 'low_result',
        bounds: {
          northEast: { lat: 30.4, lng: -97.6 },
          southWest: { lat: 30.1, lng: -97.9 },
        },
      },
    );
    await flush();

    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('on_demand_ask');
    expect(data.subjectType).toBe('term');
    expect(data.subjectText).toBe('khachapuri');
    // Geo = the searcher's viewport bounds (the same bbox as the search act).
    expect(data.geoMinLat).toBe(30.1);
    expect(data.geoMaxLat).toBe(30.4);
    expect(data.geoMinLng).toBe(-97.9);
    expect(data.geoMaxLng).toBe(-97.6);
    // Qualifiers judged at read; the ask id is deliberately NOT
    // meta.searchRequestId (the ledger-wide act-dedupe key) — an ask must
    // never collapse into its originating search act.
    expect(data.meta).toEqual({
      askSearchRequestId: SEARCH_REQUEST_ID,
      reason: 'unresolved',
      entityType: 'food',
      resultRestaurantCount: 2,
      resultFoodCount: 0,
      source: 'low_result',
    });
    // ECHO-KIND WRITER INVARIANT (poll-supply swap): the ask is by
    // construction an ECHO of its parent search act — meta.askSearchRequestId
    // carries the originating searchRequestId (both call sites mint/reuse it
    // before asking). ECHO_SIGNAL_KINDS (signals.service) derives from
    // exactly this; a standalone ask write would break the aggregate mass law.
    expect(
      (data.meta as { askSearchRequestId?: string }).askSearchRequestId,
    ).toBe(SEARCH_REQUEST_ID);
  });

  it('an entity-resolved low-result ask carries the entity subject', async () => {
    const { service, signalsPrisma } = createHarness();

    await service.recordRequests(
      [
        {
          term: 'birria',
          entityType: 'food' as never,
          reason: 'low_result' as never,
          entityId: ENTITY_ID,
          engineIds: [ENGINE_ID],
        },
      ],
      { userId: USER_ID },
      {
        bounds: {
          northEast: { lat: 30.4, lng: -97.6 },
          southWest: { lat: 30.1, lng: -97.9 },
        },
      },
    );
    await flush();

    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.subjectType).toBe('entity');
    expect(data.subjectId).toBe(ENTITY_ID);
    expect(data.subjectText).toBe('birria');
    expect(data.meta).toMatchObject({ reason: 'low_result' });
  });

  it('ENGINE queueing (leg 2): one queue row per covering engine, keyed by engineId', async () => {
    const { service, tx } = createHarness();
    const ENGINE_ID_2 = '77777777-7777-7777-7777-777777777777';

    await service.recordRequests(
      [
        {
          term: 'khachapuri',
          entityType: 'food' as never,
          reason: 'unresolved' as never,
          entityId: null,
          engineIds: [ENGINE_ID, ENGINE_ID_2],
        },
      ],
      { userId: USER_ID },
      {},
    );
    await flush();

    expect(tx.onDemandRequest.upsert).toHaveBeenCalledTimes(2);
    const engineIds = tx.onDemandRequest.upsert.mock.calls.map(
      (call: [{ where: Record<string, { engineId: string }> }]) =>
        call[0].where.term_entityType_engineId_entityIdentityKey.engineId,
    );
    expect(engineIds.sort()).toEqual([ENGINE_ID, ENGINE_ID_2].sort());
  });

  it('the UNCOVERED-ASK lane: no covering engine mints NO queue row, but the on_demand_ask signal (viewport geo) still records for the ledger territory read', async () => {
    const { service, signalsPrisma, tx } = createHarness();

    await service.recordRequests(
      [
        {
          term: 'khachapuri',
          entityType: 'food' as never,
          reason: 'unresolved' as never,
          entityId: null,
          engineIds: [],
        },
      ],
      { userId: USER_ID },
      {
        bounds: {
          northEast: { lat: 30.4, lng: -97.6 },
          southWest: { lat: 30.1, lng: -97.9 },
        },
      },
    );
    await flush();

    expect(tx.onDemandRequest.upsert).not.toHaveBeenCalled();
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('on_demand_ask');
    expect(data.geoMinLat).toBe(30.1);
  });
});

describe('territoryUnmetAsks read (the §11 unmet family input)', () => {
  it('reads on_demand_ask signals by TERRITORY with per-request dedupe — never the dead ask-event table', async () => {
    const queries: string[] = [];
    const prisma = {
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        queries.push(strings.join('?'));
        return Promise.resolve([
          {
            term: 'khachapuri',
            entity_type: 'food',
            entity_id: null,
            reason: 'unresolved',
            distinct_user_count: BigInt(2),
            demand_score: 2,
            result_restaurant_count: 0,
            result_food_count: 0,
            last_seen_at: new Date('2026-07-18T00:00:00Z'),
            ask_count: BigInt(3),
          },
        ]);
      }),
    };
    const reader = new SignalDemandReadService(
      prisma as never,
      createLogger() as never,
    );

    const rows = await reader.territoryUnmetAsks({
      placeIds: [PLACE_ID],
      since: new Date('2026-07-01T00:00:00Z'),
      limit: 50,
    });

    const sql = queries.join('\n');
    expect(sql).toContain("s.kind = 'on_demand_ask'");
    // Site dedupe: the two ask sites of one search collapse on the shared id.
    expect(sql).toContain('askSearchRequestId');
    // Territory scoping = geo overlap against the member places' bboxes.
    expect(sql).toContain('p.bbox_max_lat');
    expect(sql).not.toContain('collection_on_demand_ask_events');
    expect(sql).not.toContain('collectable_market_key');

    expect(rows).toEqual([
      {
        term: 'khachapuri',
        entityType: 'food',
        entityId: null,
        reason: 'unresolved',
        distinctUserCount: 2,
        demandScore: 2,
        resultRestaurantCount: 0,
        resultFoodCount: 0,
        lastSeenAt: new Date('2026-07-18T00:00:00Z'),
        askCount: 3,
      },
    ]);
  });
});
