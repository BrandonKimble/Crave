import { SpendAnalyticsService } from './spend-analytics.service';
import { geminiCostMicros } from './gemini-pricing';

/**
 * §24.2 Leg A: the unit-cost derivation must PROVE per-document math for the
 * gemini work class from fixture ledger rows, and PROVE the
 * 'unattributed.<service>' catch-all appears for unjoinable spend (§24.2 —
 * "spend never vanishes"). Both are exercised against the real
 * geminiCostMicros K4 table, not a re-implemented shadow calculation.
 */

const WINDOW_END = new Date('2026-07-24T03:40:00Z');
const MODEL = 'gemini-3.1-flash-lite-preview'; // {input:0.25,cached:0.025,output:1.5}/1M, batch = 50% off

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/** Build a prisma double whose calls are answered in the exact sequence
 *  refreshUnitCosts issues them: (1) refreshGeminiPerDocument's joined
 *  $queryRaw, (2) unattributedGeminiMicros's apiUsageEvent.findMany,
 *  (3) tomtom refreshUnattributed's aggregate, (4) google_places
 *  refreshUnattributed's aggregate, (5) attributeLaneCosts's $queryRaw. */
function buildPrisma(params: {
  joinedRows: unknown[];
  unattributedGeminiEvents: unknown[];
  tomtomAgg: {
    _sum: { requestCount: number | null };
    _count: { _all: number };
  };
  placesAgg: {
    _sum: { requestCount: number | null };
    _count: { _all: number };
  };
  laneJoinRows: unknown[];
}) {
  const queryRawCalls = [params.joinedRows, params.laneJoinRows];
  let queryRawIndex = 0;
  const aggregateCalls = [params.tomtomAgg, params.placesAgg];
  let aggregateIndex = 0;
  const upsert = jest.fn().mockResolvedValue(undefined);
  return {
    $queryRaw: jest.fn().mockImplementation(() => {
      const value = queryRawCalls[queryRawIndex];
      queryRawIndex += 1;
      return Promise.resolve(value);
    }),
    apiUsageEvent: {
      findMany: jest.fn().mockResolvedValue(params.unattributedGeminiEvents),
      aggregate: jest.fn().mockImplementation(() => {
        const value = aggregateCalls[aggregateIndex];
        aggregateIndex += 1;
        return Promise.resolve(value);
      }),
    },
    spendUnitCost: {
      upsert,
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function emptyAgg() {
  return { _sum: { requestCount: null }, _count: { _all: 0 } };
}

describe('SpendAnalyticsService.refreshUnitCosts (§24.2 Leg A)', () => {
  it('derives micro-USD-per-document for gemini from real token math, and folds a thin/unjoined batch cost plus interactive spend into unattributed.gemini', async () => {
    // 150 documents (>= the MIN_SAMPLE_UNITS floor) joined to one batch row.
    const joinedRow = {
      input_tokens: 10_000_000n,
      output_tokens: 2_000_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
      doc_count: 150n,
    };
    const expectedBatchCostMicros = geminiCostMicros({
      model: MODEL,
      mode: 'batch',
      inputTokens: 10_000_000,
      outputTokens: 2_000_000,
      cachedTokens: 0,
    });

    // An interactive relevance-gate event with no run_key join at all —
    // this is the unjoinable spend that must not vanish.
    const unattributedEvent = {
      inputTokens: 5_000,
      outputTokens: 500,
      cachedTokens: 0,
      model: 'gemini-3.1-flash-lite-preview',
      mode: 'interactive',
    };
    const expectedUnattributedCostMicros = geminiCostMicros({
      model: unattributedEvent.model,
      mode: 'interactive',
      inputTokens: unattributedEvent.inputTokens,
      outputTokens: unattributedEvent.outputTokens,
      cachedTokens: unattributedEvent.cachedTokens,
    });

    const prisma = buildPrisma({
      joinedRows: [joinedRow],
      unattributedGeminiEvents: [unattributedEvent],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const logger = stubLogger();
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      logger as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);

    const docRow = rows.find((r) => r.workClass === 'gemini.reddit_extraction');
    expect(docRow).toBeDefined();
    expect(docRow!.unit).toBe('document');
    expect(docRow!.sampleUnits).toBe(150);
    expect(docRow!.microUsdPerUnit).toBeCloseTo(expectedBatchCostMicros / 150);

    const unattributedRow = rows.find(
      (r) => r.workClass === 'unattributed.gemini',
    );
    expect(unattributedRow).toBeDefined();
    // Only the interactive event is unjoined here — the batch row met the
    // sample floor and got its own priced row above.
    expect(unattributedRow!.sampleUnits).toBe(1);
    expect(unattributedRow!.microUsdPerUnit).toBeCloseTo(
      expectedUnattributedCostMicros,
    );

    // No fabricated $-per-call rate for vendors with no price table.
    expect(
      rows.find((r) => r.workClass === 'unattributed.tomtom'),
    ).toBeUndefined();
    expect(
      rows.find((r) => r.workClass === 'unattributed.google_places'),
    ).toBeUndefined();
  });

  it('a thin sample (below MIN_SAMPLE_UNITS) never publishes a per-document rate — its cost folds into unattributed.gemini instead', async () => {
    const thinRow = {
      input_tokens: 100_000n,
      output_tokens: 20_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
      doc_count: 5n, // far under the 100-unit floor
    };
    const prisma = buildPrisma({
      joinedRows: [thinRow],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);

    expect(
      rows.find((r) => r.workClass === 'gemini.reddit_extraction'),
    ).toBeUndefined();
    const unattributedRow = rows.find(
      (r) => r.workClass === 'unattributed.gemini',
    );
    expect(unattributedRow).toBeDefined();
    expect(unattributedRow!.microUsdPerUnit).toBeGreaterThan(0);
  });

  it('surfaces request-counted (unpriced) rows for vendors with ledger activity but no $-rate table', async () => {
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: { _sum: { requestCount: 12 }, _count: { _all: 4 } },
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);
    const tomtomRow = rows.find((r) => r.workClass === 'unattributed.tomtom');
    expect(tomtomRow).toBeDefined();
    expect(tomtomRow!.sampleUnits).toBe(12);
    expect(tomtomRow!.microUsdPerUnit).toBe(0);
  });

  it('feeds joined per-source lane spend into CollectorSourceRegistryService.recordLaneCost (Leg B wiring)', async () => {
    const laneJoinRow = {
      source_id: 'src-1',
      input_tokens: 1_000_000n,
      output_tokens: 200_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
    };
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [laneJoinRow],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    await service.refreshUnitCosts(WINDOW_END);

    expect(registry.recordLaneCost).toHaveBeenCalledTimes(1);
    const [sourceId, lane, costMicros] = registry.recordLaneCost.mock
      .calls[0] as [string, string, number];
    expect(sourceId).toBe('src-1');
    expect(lane).toBe('keyword');
    expect(costMicros).toBeGreaterThan(0);
  });
});

/**
 * §24.4 item 6: the replacement for the deleted 80%-of-cap warn. Proves the
 * RED case (month-to-date running hot vs. the trailing measured baseline
 * warns) and the GREEN case (a normal month does not) — an always-green
 * telemetry metric would be lying (CLAUDE.md's ATTRIBUTE-before-ideate
 * law), so both directions are exercised against the SAME fixture shape.
 */
describe('SpendAnalyticsService.logSpendTelemetry (§24.4 item 6)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // The 10th of the month, 00:00 UTC — day-of-month = 10, so a flat daily
  // baseline prorates to exactly 10x one day's spend.
  const NOW = new Date('2026-07-10T00:00:00Z');
  const DAILY_EVENT_INPUT_TOKENS = 1_000; // MODEL's $0.25/1M input rate.

  function buildTelemetryPrisma(monthToDateCostMicros: number) {
    const findMany = jest.fn().mockImplementation((args: unknown) => {
      const where = (args as { where: { createdAt: { gte: Date; lt: Date } } })
        .where;
      const start = where.createdAt.gte.getTime();
      const end = where.createdAt.lt.getTime();
      const spanDays = (end - start) / DAY_MS;
      if (spanDays <= 1.5) {
        // One of the 30 daily-baseline calls: flat DAILY_COST_MICROS/day.
        return Promise.resolve([
          {
            inputTokens: DAILY_EVENT_INPUT_TOKENS,
            outputTokens: 0,
            cachedTokens: 0,
            model: MODEL,
            mode: 'interactive',
          },
        ]);
      }
      // The month-to-date call: scaled to hit the exact target cost via
      // inputTokens (same $0.25/1M rate), independent of how many days
      // have elapsed.
      return Promise.resolve([
        {
          inputTokens: monthToDateCostMicros / 0.25,
          outputTokens: 0,
          cachedTokens: 0,
          model: MODEL,
          mode: 'interactive',
        },
      ]);
    });
    return { apiUsageEvent: { findMany } };
  }

  it('RED: month-to-date well above the prorated trailing baseline WARNS', async () => {
    // Prorated expectation at day 10 = 10 * 250 = 2500 micros, stddev = 0,
    // so anything over 2500 breaches the K=3*stddev*sqrt(days) threshold
    // (which is exactly 2500 here since stddev is 0) — pick 2x to be
    // unambiguous.
    const prisma = buildTelemetryPrisma(5_000);
    const logger = stubLogger();
    const registry = { recordLaneCost: jest.fn() };
    const service = new SpendAnalyticsService(
      prisma as never,
      logger as never,
      registry as never,
    );

    await (
      service as unknown as { logSpendTelemetry(now: Date): Promise<void> }
    ).logSpendTelemetry(NOW);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('running hot'),
      expect.objectContaining({ dayOfMonth: 10 }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      'Gemini spend telemetry',
      expect.anything(),
    );
  });

  it('GREEN: a month tracking exactly its trailing baseline does not warn', async () => {
    // Exactly at the prorated expectation (2500 micros at day 10) — not
    // over it, so the metric must be quiet, proving it CAN show green too.
    const prisma = buildTelemetryPrisma(2_500);
    const logger = stubLogger();
    const registry = { recordLaneCost: jest.fn() };
    const service = new SpendAnalyticsService(
      prisma as never,
      logger as never,
      registry as never,
    );

    await (
      service as unknown as { logSpendTelemetry(now: Date): Promise<void> }
    ).logSpendTelemetry(NOW);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Gemini spend telemetry',
      expect.objectContaining({ dayOfMonth: 10 }),
    );
  });
});

/**
 * §24.4 item 4: the nightly backstop re-derivation must write the
 * measured backstop row and, when a live GovernanceService is present,
 * apply it immediately via PoolRegistry.resetLimit.
 *
 * RED-TEAM FIX 2026-07-24 (finding 3 — "the backstop must not chase a
 * runaway"): the baseline is now the MEDIAN of the 30 daily totals x 30
 * (not their raw sum), and growth is clamped to
 * min(derived, previousLimit x BACKSTOP_MULTIPLE). refreshBackstop now
 * issues one apiUsageEvent.findMany call PER trailing day (30 calls) plus
 * one spendUnitCost.findUnique for the prior row.
 */
describe('SpendAnalyticsService.refreshBackstop (§24.4 item 4 / §24.1 Tier 3)', () => {
  const WINDOW_START = new Date('2026-06-24T03:40:00Z');

  function buildBackstopPrisma(
    dailyInputTokens: number,
    priorMicroUsdPerUnit: number | null,
  ) {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        priorMicroUsdPerUnit === null
          ? null
          : { microUsdPerUnit: priorMicroUsdPerUnit },
      );
    return {
      prisma: {
        apiUsageEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              inputTokens: dailyInputTokens,
              outputTokens: 0,
              cachedTokens: 0,
              model: MODEL,
              mode: 'interactive',
            },
          ]),
        },
        spendUnitCost: { upsert, findUnique },
      },
      upsert,
      findUnique,
    };
  }

  it('writes backstop.gemini as BACKSTOP_MULTIPLE(3) x the MEDIAN daily spend x 30, and resets the live pool (no prior row: unclamped)', async () => {
    // Flat 1000 micros/day for all 30 days -> median = 1000 -> trailing =
    // 30_000 -> derived = 30_000 * 3 = 90_000.
    const { prisma, upsert } = buildBackstopPrisma(4_000, null);
    const poolStatus = jest.fn().mockReturnValue({ limit: 300_000_000 });
    const resetLimit = jest.fn();
    const governance = { pools: { poolStatus, resetLimit } };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      governance as never,
    );

    await (
      service as unknown as {
        refreshBackstop(start: Date, end: Date, now: Date): Promise<void>;
      }
    ).refreshBackstop(WINDOW_START, WINDOW_END, WINDOW_END);

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = (upsert.mock.calls as unknown[][])[0][0] as {
      where: unknown;
      create: { microUsdPerUnit: number; sampleUnits: number };
    };
    expect(call.where).toEqual({
      workClass_unit: { workClass: 'backstop.gemini', unit: 'month' },
    });
    expect(call.create.microUsdPerUnit).toBe(90_000);
    expect(call.create.sampleUnits).toBe(30);
    expect(resetLimit).toHaveBeenCalledWith('gemini.monthlySpend', 90_000);
  });

  it('does not touch the pool when the derived limit already matches (no-op re-derivation)', async () => {
    const { prisma } = buildBackstopPrisma(4_000, null); // derived -> 90_000
    const resetLimit = jest.fn();
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ limit: 90_000 }),
        resetLimit,
      },
    };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      governance as never,
    );

    await (
      service as unknown as {
        refreshBackstop(start: Date, end: Date, now: Date): Promise<void>;
      }
    ).refreshBackstop(WINDOW_START, WINDOW_END, WINDOW_END);

    expect(resetLimit).not.toHaveBeenCalled();
  });

  it('RED-PROOF: a 10x spike month does NOT 10x the backstop in one derivation — growth clamps at previousLimit x BACKSTOP_MULTIPLE(3)', async () => {
    // Every trailing day now costs 10_000 micros (10x the 1_000/day used
    // above) -> median = 10_000 -> trailing = 300_000 -> naive derived =
    // 300_000 * 3 = 900_000 (a 300x jump from a previous limit of 3_000).
    // The clamp must cap growth at previousLimit(3_000) * 3 = 9_000.
    const { prisma, upsert } = buildBackstopPrisma(40_000, 3_000);
    const resetLimit = jest.fn();
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ limit: 3_000 }),
        resetLimit,
      },
    };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      governance as never,
    );

    await (
      service as unknown as {
        refreshBackstop(start: Date, end: Date, now: Date): Promise<void>;
      }
    ).refreshBackstop(WINDOW_START, WINDOW_END, WINDOW_END);

    const call = (upsert.mock.calls as unknown[][])[0][0] as {
      create: { microUsdPerUnit: number };
    };
    expect(call.create.microUsdPerUnit).toBe(9_000); // clamped, NOT 900_000
    expect(resetLimit).toHaveBeenCalledWith('gemini.monthlySpend', 9_000);
  });

  it('shrinking is unclamped: a derived limit below the previous limit applies immediately', async () => {
    // Flat 1_000/day -> derived 90_000, well below a previous limit of
    // 500_000 -- shrinking must pass straight through (min() lets it).
    const { prisma, upsert } = buildBackstopPrisma(4_000, 500_000);
    const resetLimit = jest.fn();
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ limit: 500_000 }),
        resetLimit,
      },
    };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      governance as never,
    );

    await (
      service as unknown as {
        refreshBackstop(start: Date, end: Date, now: Date): Promise<void>;
      }
    ).refreshBackstop(WINDOW_START, WINDOW_END, WINDOW_END);

    const call = (upsert.mock.calls as unknown[][])[0][0] as {
      create: { microUsdPerUnit: number };
    };
    expect(call.create.microUsdPerUnit).toBe(90_000);
    expect(resetLimit).toHaveBeenCalledWith('gemini.monthlySpend', 90_000);
  });
});
