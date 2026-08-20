import 'reflect-metadata';
import { SearchQueryExecutor } from './search-query.executor';
import { QueryPlan, SearchQueryRequestDto } from './dto/search-query.dto';

/**
 * OPEN-NOW FLAG HONESTY (⭐05 finding (e), 2026-08-19).
 *
 * The open-now SQL predicate carries a graceful-degradation arm: when NO
 * location in the viewport pool holds hours, the filter is inapplicable and
 * everything is admitted. The executor used to report
 * `metadata.openNowApplied = Boolean(request.openNow)` — "requested", not
 * "applied" — so a degraded serve claimed the filter had constrained it. The
 * count queries now carry `open_now_supported` (the exact negation of the
 * degradation arm) and the flag reports what ACTUALLY constrained the
 * results.
 *
 * Both arms specced through executeDual with the builder and prisma faked at
 * the seam (the SQL objects are opaque markers; rows are dispatched by
 * marker identity, so the assertion is on the executor's law, not SQL text).
 *
 * MUTATION: reverting the executor to `openNowApplied = needsOpenFilter`
 * turns the degraded-arm case RED; wiring the flag to constant false turns
 * the constrained-arm case RED.
 */

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

function createHarness(params: {
  placeSupported: boolean | null;
  dishSupported: boolean | null;
}) {
  const placeData = { marker: 'place-data' };
  const placeCount = { marker: 'place-count' };
  const dishData = { marker: 'dish-data' };
  const dishCount = { marker: 'dish-count' };

  const queryBuilder = {
    buildPlaceQuery: jest.fn(() => ({
      dataSql: placeData,
      countSql: placeCount,
      metadata: {
        boundsApplied: false,
        priceFilterApplied: false,
        minimumVotesApplied: false,
      },
    })),
    buildDishQuery: jest.fn(() => ({
      dataSql: dishData,
      countSql: dishCount,
      metadata: {
        boundsApplied: false,
        priceFilterApplied: false,
        minimumVotesApplied: false,
      },
    })),
  };

  const prisma = {
    $queryRaw: jest.fn((sql: unknown) => {
      if (sql === placeData || sql === dishData) {
        return Promise.resolve([]);
      }
      if (sql === placeCount) {
        return Promise.resolve([
          {
            total_restaurants: 0n,
            open_now_supported: params.placeSupported,
          },
        ]);
      }
      if (sql === dishCount) {
        return Promise.resolve([
          {
            total_connections: 0n,
            total_restaurants: 0n,
            open_now_supported: params.dishSupported,
          },
        ]);
      }
      throw new Error('unexpected SQL');
    }),
  };

  const executor = new SearchQueryExecutor(
    createLogger() as never,
    prisma as never,
    queryBuilder as never,
  );

  const plan: QueryPlan = {
    format: 'dual_list',
    placeFilters: [],
    connectionFilters: [],
    ranking: { placeOrder: 'crave_score DESC', itemOrder: 'crave_score DESC' },
  } as unknown as QueryPlan;

  const request = {
    entities: {},
    openNow: true,
  } as unknown as SearchQueryRequestDto;

  return { executor, plan, request };
}

describe('openNowApplied reports what actually constrained the results', () => {
  it('constrained arm: hours exist in the pool -> openNowApplied true', async () => {
    const { executor, plan, request } = createHarness({
      placeSupported: true,
      dishSupported: true,
    });
    const result = await executor.executeDual({
      plan,
      request,
      pagination: { skip: 0, take: 25 },
    });
    expect(result.metadata.openNowApplied).toBe(true);
  });

  it('degraded arm: a hours-less pool admitted everything -> openNowApplied false', async () => {
    const { executor, plan, request } = createHarness({
      placeSupported: false,
      dishSupported: false,
    });
    const result = await executor.executeDual({
      plan,
      request,
      pagination: { skip: 0, take: 25 },
    });
    expect(result.metadata.openNowApplied).toBe(false);
  });

  it('mixed axes OR like boundsApplied: either axis constraining counts', async () => {
    const { executor, plan, request } = createHarness({
      placeSupported: false,
      dishSupported: true,
    });
    const result = await executor.executeDual({
      plan,
      request,
      pagination: { skip: 0, take: 25 },
    });
    expect(result.metadata.openNowApplied).toBe(true);
  });

  it('not requested: flag stays false regardless of pool hours', async () => {
    const { executor, plan, request } = createHarness({
      placeSupported: null,
      dishSupported: null,
    });
    const result = await executor.executeDual({
      plan,
      request: { ...request, openNow: false } as never,
      pagination: { skip: 0, take: 25 },
    });
    expect(result.metadata.openNowApplied).toBe(false);
  });
});
