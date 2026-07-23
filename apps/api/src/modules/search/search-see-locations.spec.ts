import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SignalsService } from '../signals/signals.service';

// SEE-LOCATIONS mode (Leg 2 tail): the lean single-restaurant variant.
// Laws under test:
// - transport: /search/run + `seeLocations` discriminator routes to the lean
//   path (never the ranked pipeline) and answers on the ordinary
//   SearchResponse wire (one RestaurantResult whose `locations` = the
//   IN-VIEW set).
// - membership: the executor's SQL constrains locations to the request
//   bounds AND to THAT restaurant; zero in-view locations = empty world.
// - signals: the act is a real 'search' in the ledger, meta-stamped
//   mode='see_locations' with the restaurant as subject (echo selection
//   rides along when the submit carried the autocomplete selection).

const USER_ID = '11111111-1111-1111-1111-111111111111';
const RESTAURANT_ID = '44444444-4444-4444-4444-444444444444';
const SECOND_RESTAURANT_ID = '77777777-7777-7777-7777-777777777777';

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

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

function buildLeanRestaurant(locationCount: number) {
  const locations = Array.from({ length: locationCount }, (_, index) => ({
    locationId: `aaaaaaa${index}-0000-0000-0000-000000000000`,
    latitude: 30.2 + index * 0.01,
    longitude: -97.7 - index * 0.01,
    address: `${100 + index} Main St`,
    isPrimary: index === 0,
  }));
  return {
    restaurant: {
      restaurantId: RESTAURANT_ID,
      restaurantName: "Torchy's Tacos",
      restaurantAliases: [],
      rank: 1,
      scoreSubjectType: 'restaurant' as const,
      scoreSubjectId: RESTAURANT_ID,
      craveScore: 8.7,
      locations,
      displayLocation: locations[0] ?? null,
      locationCount: 12,
      topFood: [],
      totalDishCount: 4,
    },
    inViewLocationCount: locationCount,
  };
}

function createServiceHarness(options: { inViewLocationCount?: number } = {}) {
  const signalsPrisma = {
    signal: {
      create: jest.fn().mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest
        .fn()
        .mockResolvedValue({ actorId: '22222222-2222-2222-2222-222222222222' }),
    },
  };
  const signals = new SignalsService(
    signalsPrisma as never,
    createLogger() as never,
  );
  const executeSeeLocations = jest
    .fn()
    .mockResolvedValue(buildLeanRestaurant(options.inViewLocationCount ?? 3));
  const executeDual = jest.fn();
  const service = new SearchService(
    createLogger() as never,
    { executeSeeLocations, executeDual } as never, // queryExecutor
    {} as never, // queryBuilder
    {} as never, // entityExpansion
    {} as never, // siblingExpansion
    {} as never, // onDemandRequestService
    {} as never, // searchMetrics
    {} as never, // textSanitizer
    {} as never, // prisma
    {
      resolveViewportCoverage: jest
        .fn()
        .mockResolvedValue({ share: 0, engines: [] }),
    } as never, // engineCoverage
    {} as never, // restaurantStatusService
    signals,
    {} as never, // signalDemandRead
    {} as never, // placesCatalog
    { noteViewport: jest.fn() } as never, // placesReconciler
    {
      enqueue: jest.fn().mockResolvedValue(undefined),
      noteHeaderAnswer: jest.fn(),
    } as never, // placesPromotions
  );
  return { service, signalsPrisma, executeSeeLocations, executeDual };
}

function buildSeeLocationsRequest(
  overrides: Record<string, unknown> = {},
): never {
  return {
    seeLocations: true,
    entities: {
      restaurants: [
        {
          normalizedName: "torchy's tacos",
          entityIds: [RESTAURANT_ID],
          originalText: "Torchy's Tacos",
        },
      ],
    },
    bounds: BOUNDS,
    sourceQuery: "Torchy's Tacos",
    userId: USER_ID,
    submissionSource: 'autocomplete',
    submissionContext: {
      selectedEntityId: RESTAURANT_ID,
      selectedEntityType: 'restaurant',
      matchType: 'entity',
    },
    ...overrides,
  } as never;
}

describe('see-locations service routing (lean variant on the ONE search wire)', () => {
  it('routes to the lean executor — the ranked pipeline never runs', async () => {
    const { service, executeSeeLocations, executeDual } =
      createServiceHarness();

    const response = await service.runQuery(buildSeeLocationsRequest());

    expect(executeDual).not.toHaveBeenCalled();
    expect(executeSeeLocations).toHaveBeenCalledTimes(1);
    expect(executeSeeLocations).toHaveBeenCalledWith({
      restaurantId: RESTAURANT_ID,
      bounds: BOUNDS,
      userLocation: null,
    });
    expect(response.restaurants).toHaveLength(1);
    expect(response.restaurants[0].restaurantId).toBe(RESTAURANT_ID);
    expect(response.restaurants[0].locations).toHaveLength(3);
    expect(response.dishes).toEqual([]);
    expect(response.plan.diagnostics.notes).toContain('see_locations');
    expect(response.metadata.totalRestaurantResults).toBe(1);
    expect(response.metadata.boundsApplied).toBe(true);
    expect(response.metadata.analysisMetadata).toEqual({
      seeLocations: { restaurantId: RESTAURANT_ID, inViewLocationCount: 3 },
    });
  });

  it('zero in-view locations = empty world (membership law), not a zero-location row', async () => {
    const { service, executeSeeLocations } = createServiceHarness();
    executeSeeLocations.mockResolvedValue({
      restaurant: buildLeanRestaurant(0).restaurant,
      inViewLocationCount: 0,
    });

    const response = await service.runQuery(buildSeeLocationsRequest());

    expect(response.restaurants).toEqual([]);
    expect(response.metadata.totalRestaurantResults).toBe(0);
  });

  it('rejects anything but exactly one restaurant entity id', async () => {
    const { service } = createServiceHarness();

    await expect(
      service.runQuery(
        buildSeeLocationsRequest({ entities: { restaurants: [] } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.runQuery(
        buildSeeLocationsRequest({
          entities: {
            restaurants: [
              {
                normalizedName: 'two',
                entityIds: [RESTAURANT_ID, SECOND_RESTAURANT_ID],
              },
            ],
          },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records the act as a real search signal with mode meta + restaurant subject', async () => {
    const { service, signalsPrisma } = createServiceHarness();

    await service.runQuery(buildSeeLocationsRequest());
    await flush();

    const rows = signalsPrisma.signal.create.mock.calls.map(
      (call: [{ data: Record<string, unknown> }]) => call[0].data,
    );
    const searchSignal = rows.find((data) => data.kind === 'search');
    expect(searchSignal).toBeDefined();
    expect(searchSignal?.subjectId).toBe(RESTAURANT_ID);
    expect(searchSignal?.meta).toMatchObject({
      mode: 'see_locations',
      restaurantId: RESTAURANT_ID,
      inViewLocationCount: 3,
      resultCount: 1,
      restaurantCount: 1,
      cached: false,
    });
    // The autocomplete selection echo rides along (writer invariant: it
    // always attaches the parent searchRequestId).
    const selectionSignal = rows.find(
      (data) => data.kind === 'autocomplete_selection',
    );
    expect(selectionSignal).toBeDefined();
    expect(
      (selectionSignal?.meta as { searchRequestId?: string }).searchRequestId,
    ).toBe(
      (searchSignal?.meta as { searchRequestId?: string }).searchRequestId,
    );
  });
});

describe('see-locations executor membership (in-view locations of THAT restaurant only)', () => {
  function createExecutorHarness(rows: unknown[], snippetRows: unknown[] = []) {
    const queryRaw = jest
      .fn<Promise<unknown[]>, [unknown]>()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(snippetRows);
    const executor = new SearchQueryExecutor(
      createLogger() as never,
      { $queryRaw: queryRaw } as never,
      {} as never,
    );
    return { executor, queryRaw };
  }

  const ROW = {
    entity_id: RESTAURANT_ID,
    name: "Torchy's Tacos",
    aliases: [],
    price_level: 2,
    price_level_updated_at: null,
    restaurant_crave_score: '8.7',
    restaurant_crave_score_exact: '0.91234',
    restaurant_rising: null,
    restaurant_score_info: { evidenceCopy: 'Based on community evidence.' },
    location_count: 12,
    dish_count: 4,
    locations_json: [
      {
        locationId: 'aaaaaaa1-0000-0000-0000-000000000000',
        latitude: '30.2',
        longitude: '-97.7',
        address: '100 Main St',
        isPrimary: true,
      },
      {
        locationId: 'aaaaaaa2-0000-0000-0000-000000000000',
        latitude: '30.3',
        longitude: '-97.8',
        address: '200 Elm St',
        isPrimary: false,
      },
    ],
  };

  it('the SQL scopes locations to the restaurant AND the viewport bbox', async () => {
    const { executor, queryRaw } = createExecutorHarness([ROW]);

    const result = await executor.executeSeeLocations({
      restaurantId: RESTAURANT_ID,
      bounds: BOUNDS,
      userLocation: null,
    });

    const sqlArg = queryRaw.mock.calls[0][0] as {
      sql?: string;
      values?: unknown[];
      strings?: string[];
    };
    const sqlText = sqlArg.sql ?? (sqlArg.strings ?? []).join('?');
    // Membership predicates are IN the SQL: this-restaurant + bbox. If the
    // bounds filter is ever dropped, this goes RED.
    expect(sqlText).toContain('rl.restaurant_id = e.entity_id');
    expect(sqlText).toContain('rl.latitude BETWEEN');
    expect(sqlText).toContain('rl.longitude BETWEEN');
    const values = sqlArg.values ?? [];
    expect(values).toEqual(
      expect.arrayContaining([
        BOUNDS.southWest.lat,
        BOUNDS.northEast.lat,
        BOUNDS.southWest.lng,
        BOUNDS.northEast.lng,
        RESTAURANT_ID,
      ]),
    );

    // Assembly: the response row's locations ARE the in-view SQL rows —
    // nothing is refetched, recapped, or padded.
    expect(result.inViewLocationCount).toBe(2);
    expect(result.restaurant?.locations?.map((l) => l.locationId)).toEqual([
      'aaaaaaa1-0000-0000-0000-000000000000',
      'aaaaaaa2-0000-0000-0000-000000000000',
    ]);
    // Display facts derive from the nearest-to-center row ([0]).
    expect(result.restaurant?.restaurantLocationId).toBe(
      'aaaaaaa1-0000-0000-0000-000000000000',
    );
    expect(result.restaurant?.latitude).toBe(30.2);
    // The TRUE global count survives alongside the in-view membership.
    expect(result.restaurant?.locationCount).toBe(12);
  });

  it('an antimeridian viewport (west > east) uses the wrap-aware OR predicate', async () => {
    const { executor, queryRaw } = createExecutorHarness([ROW]);

    await executor.executeSeeLocations({
      restaurantId: RESTAURANT_ID,
      bounds: {
        northEast: { lat: 30.4, lng: -170 },
        southWest: { lat: 30.1, lng: 170 },
      },
      userLocation: null,
    });

    const sqlArg = queryRaw.mock.calls[0][0] as { sql?: string };
    expect(sqlArg.sql).toContain('rl.longitude >=');
    expect(sqlArg.sql).toContain('OR rl.longitude <=');
    expect(sqlArg.sql).not.toContain('rl.longitude BETWEEN');
  });

  it('an unknown restaurant answers null (the service maps it to an empty world)', async () => {
    const { executor } = createExecutorHarness([]);

    const result = await executor.executeSeeLocations({
      restaurantId: RESTAURANT_ID,
      bounds: BOUNDS,
      userLocation: null,
    });

    expect(result.restaurant).toBeNull();
    expect(result.inViewLocationCount).toBe(0);
  });
});
