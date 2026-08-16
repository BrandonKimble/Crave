import { SpendAnalyticsService } from './spend-analytics.service';
import { geminiCostMicros } from './gemini-pricing';
import { placesCostMicrosPerCall } from './vendor-pricing';

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
 *  (3) refreshTomtomDraws's aggregate, (4) refreshPlacesCalls's
 *  apiUsageEvent.findMany, (5) attributeLaneCosts's $queryRaw.
 *  findMany is called TWICE per run (gemini unattributed, then places) —
 *  answered in that order from a queue, same idiom as $queryRaw below. */
function buildPrisma(params: {
  joinedRows: unknown[];
  unattributedGeminiEvents: unknown[];
  tomtomAgg: {
    _sum: { requestCount: number | null };
    _count: { _all: number };
  };
  placesEvents?: Array<{
    skuTier: string | null;
    requestCount: number;
    operation?: string;
    attribution?: string | null;
  }>;
  laneJoinRows: unknown[];
  /** §24.2 per-class rate denominators (refreshPipelineClassRates) — all
   *  default 0 so pre-existing fixtures publish no per-class rows. */
  docsCollected?: number;
  verdictsJudged?: number;
  newPlaces?: number;
  /** Honest interactive denominator (round-six): docs through completed
   *  extraction runs in the window. Default 0 → no umbrella row publishes. */
  docsExtracted?: number;
}) {
  const queryRawCalls = [params.joinedRows, params.laneJoinRows];
  let queryRawIndex = 0;
  const upsert = jest.fn().mockResolvedValue(undefined);
  return {
    $queryRaw: jest.fn().mockImplementation((query: unknown) => {
      // The docsExtracted count is dispatched by CONTENT, not queue order —
      // it was added mid-sequence and must not shift the two joined-row
      // answers below.
      const sqlText =
        (query as { sql?: string; strings?: string[] })?.sql ??
        ((query as { strings?: string[] })?.strings ?? []).join(' ');
      if (sqlText.includes('collection_extraction_input_documents')) {
        return Promise.resolve([{ n: BigInt(params.docsExtracted ?? 0) }]);
      }
      const value = queryRawCalls[queryRawIndex];
      queryRawIndex += 1;
      return Promise.resolve(value);
    }),
    apiUsageEvent: {
      // Distinguish by `where.service`: google_places calls (only
      // refreshPlacesCalls) get placesEvents; every gemini call (the
      // unattributed-spend join AND refreshBackstop/logSpendTelemetry's
      // per-day totalGeminiSpendMicros sweep, dozens of calls) gets the
      // SAME fixture value every time — mirrors the old mockResolvedValue
      // idiom, just service-scoped now that two distinct fixtures exist.
      findMany: jest.fn().mockImplementation((args: unknown) => {
        const service = (args as { where?: { service?: string } }).where
          ?.service;
        if (service === 'google_places') {
          return Promise.resolve(params.placesEvents ?? []);
        }
        // Honor the §24.2 per-class caller filter (in / notIn) and the
        // interactive umbrella's NOT-batch-mode filter, so fixtures can tag
        // events with a `caller` and get class-scoped answers. Calls with no
        // caller filter behave exactly as before.
        const where = (
          args as {
            where?: {
              caller?: { in?: string[]; notIn?: string[] };
              NOT?: { mode?: string };
            };
          }
        ).where;
        let events = params.unattributedGeminiEvents as Array<{
          caller?: string;
          mode?: string;
        }>;
        if (where?.caller?.in) {
          const allowed = where.caller.in;
          events = events.filter((e) => allowed.includes(e.caller ?? ''));
        } else if (where?.caller?.notIn) {
          const blocked = where.caller.notIn;
          events = events.filter((e) => !blocked.includes(e.caller ?? ''));
        }
        if (where?.NOT?.mode) {
          const blockedMode = where.NOT.mode;
          events = events.filter((e) => e.mode !== blockedMode);
        }
        return Promise.resolve(events);
      }),
      aggregate: jest.fn().mockResolvedValue(params.tomtomAgg),
      // TomTom unit costs are one row PER PRICED OPERATION now — the single
      // blended 'tomtom.searchFamily' class charged every draw the scarce
      // polygon rate against a mix that is ~96% cheap. Derived from the same
      // fixture so existing cases keep their totals.
      groupBy: jest.fn().mockImplementation(() =>
        Promise.resolve(
          (params.tomtomAgg._sum.requestCount ?? 0) === 0 &&
            (params.tomtomAgg._count?._all ?? 0) === 0
            ? []
            : [
                {
                  operation: 'additionalData',
                  _sum: { requestCount: params.tomtomAgg._sum.requestCount },
                  _count: { _all: params.tomtomAgg._count?._all ?? 0 },
                },
              ],
        ),
      ),
    },
    sourceDocument: {
      count: jest.fn().mockResolvedValue(params.docsCollected ?? 0),
    },
    collectionRelevanceVerdict: {
      count: jest.fn().mockResolvedValue(params.verdictsJudged ?? 0),
    },
    entity: {
      count: jest.fn().mockResolvedValue(params.newPlaces ?? 0),
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
      placesEvents: [],
      laneJoinRows: [],
    });
    const logger = stubLogger();
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      logger as never,
      registry as never,
      { emit: jest.fn() } as never,
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
      rows.find((r) => (r.workClass as string) === 'unattributed.tomtom'),
    ).toBeUndefined();
    expect(
      rows.find(
        (r) => (r.workClass as string) === 'unattributed.google_places',
      ),
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
      placesEvents: [],
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
      { emit: jest.fn() } as never,
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

  it('§24 Task 1: tomtom draws and google_places calls are now PRICED (vendor-pricing.ts rate table), not unattributed 0-priced rows', async () => {
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: { _sum: { requestCount: 12 }, _count: { _all: 4 } },
      placesEvents: [
        { skuTier: 'essentials', requestCount: 3 },
        { skuTier: 'enterprise', requestCount: 2 },
        { skuTier: null, requestCount: 1 },
      ],
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
      { emit: jest.fn() } as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);

    // ONE ROW PER PRICED OPERATION (2026-08-04). 'tomtom.searchFamily' folded
    // every draw into the scarce rate on the premise that the ledger could not
    // split cheap from scarce — it can, in the `operation` column.
    const tomtomRow = rows.find(
      (r) => r.workClass === 'tomtomDraw.additionalData',
    );
    expect(tomtomRow).toBeDefined();
    expect(tomtomRow!.sampleUnits).toBe(12);
    expect(tomtomRow!.microUsdPerUnit).toBe(3_240);
    expect(
      rows.some((r) => (r.workClass as string) === 'tomtom.searchFamily'),
    ).toBe(false);

    const essentialsRow = rows.find(
      (r) => r.workClass === 'google_places.essentials',
    );
    expect(essentialsRow).toBeDefined();
    expect(essentialsRow!.sampleUnits).toBe(3);
    expect(essentialsRow!.microUsdPerUnit).toBe(5_000);

    const enterpriseRow = rows.find(
      (r) => r.workClass === 'google_places.enterprise',
    );
    expect(enterpriseRow).toBeDefined();
    expect(enterpriseRow!.sampleUnits).toBe(2);
    // Operation-aware pricing (R3): a per-SKU unit-cost row aggregates
    // ACROSS operations, so it prices at the SKU ceiling (textSearch:
    // enterprise 35,000µ), not the old placeDetails-only 20,000µ that
    // under-metered every textSearch draw. Over-meter, never vanish.
    expect(enterpriseRow!.microUsdPerUnit).toBe(35_000);

    // Unknown/null SKU groups under 'unknown', priced at the highest rate.
    const unknownRow = rows.find(
      (r) => r.workClass === 'google_places.unknown',
    );
    expect(unknownRow).toBeDefined();
    expect(unknownRow!.sampleUnits).toBe(1);
    // Unknown SKU prices at the highest known rate, which is now the
    // textSearch:enterprise_atmosphere 40,000µ (was 25,000µ pre-R3).
    expect(unknownRow!.microUsdPerUnit).toBe(40_000);

    // The old zero-priced unattributed rows are gone.
    expect(
      rows.find((r) => (r.workClass as string) === 'unattributed.tomtom'),
    ).toBeUndefined();
    expect(
      rows.find(
        (r) => (r.workClass as string) === 'unattributed.google_places',
      ),
    ).toBeUndefined();
  });

  it('§24 Task 1: publishes a constant-rate floor row for tomtom even with zero ledger sample — at the CHEAP rate, since the mix is ~96% cheap', async () => {
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesEvents: [],
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
      { emit: jest.fn() } as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);
    const tomtomRow = rows.find((r) => r.workClass.startsWith('tomtomDraw.'));
    expect(tomtomRow).toBeDefined();
    expect(tomtomRow!.sampleUnits).toBe(0);
    // An EMPTY window should not imply the dearest rate. A real window is
    // priced per operation; this placeholder uses the cheap one deliberately.
    expect(tomtomRow!.microUsdPerUnit).toBe(1_080);
  });

  it('§24 Task 2: feeds joined per-source PER-LANE spend into CollectorSourceRegistryService.recordLaneCost, reading the lane off the document (chronological now attributed, not just keyword)', async () => {
    const keywordRow = {
      source_id: 'src-1',
      lane: 'keyword',
      input_tokens: 1_000_000n,
      output_tokens: 200_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
    };
    const chronologicalRow = {
      source_id: 'src-2',
      lane: 'chronological',
      input_tokens: 500_000n,
      output_tokens: 100_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
    };
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesEvents: [],
      laneJoinRows: [keywordRow, chronologicalRow],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
      { emit: jest.fn() } as never,
    );

    await service.refreshUnitCosts(WINDOW_END);

    expect(registry.recordLaneCost).toHaveBeenCalledTimes(2);
    const calls = registry.recordLaneCost.mock.calls as Array<
      [string, string, number]
    >;
    const bySource = new Map(
      calls.map(([sourceId, lane, cost]) => [sourceId, { lane, cost }]),
    );
    expect(bySource.get('src-1')?.lane).toBe('keyword');
    expect(bySource.get('src-1')!.cost).toBeGreaterThan(0);
    expect(bySource.get('src-2')?.lane).toBe('chronological');
    expect(bySource.get('src-2')!.cost).toBeGreaterThan(0);
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
      { emit: jest.fn() } as never,
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
      { emit: jest.fn() } as never,
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

/*
 * DELETED (D149, 2026-08-07): two describe blocks —
 * 'SpendAnalyticsService.refreshBackstop (§24.4 item 4 / §24.1 Tier 3)' (8
 * tests) and 'refreshBackstop BOUNDS (capacity red team RANK 5)' (its
 * floor/ceiling cases). They were thorough tests of a mechanism the owner
 * ruled out of existence: the nightly re-derivation of the Gemini ceiling as
 * 3x winsorized trailing spend, growth-clamped, floored by
 * GEMINI_MONTHLY_SPEND_FLOOR_USD and capped by GEMINI_BACKSTOP_MAX_USD. The
 * ceiling is now a fixed GEMINI_MONTHLY_SPEND_CAP_USD ($1,500 default) with
 * no derivation to clamp, so every assertion here described code that no
 * longer exists. What replaced their intent — "is this month's spend
 * abnormal" — is tested in spend-expectation-monitor.service.spec.ts.
 */

/**
 * §18.4 TomTom credit PROXY (checkTomtomPoolHot): RED-provable at the
 * fixture threshold (80% used before day 20) and NOT below it — both the
 * fraction boundary and the day-of-month boundary are exercised so the
 * check can be proven capable of firing, not a metric that only ever
 * reads green.
 */

describe('SpendAnalyticsService.checkTomtomPoolHot (§18.4 TomTom credit proxy)', () => {
  function buildService(governance: unknown, opsAlerts: { emit: jest.Mock }) {
    return new SpendAnalyticsService(
      {} as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      opsAlerts as never,
      governance as never,
    );
  }

  function callCheck(service: SpendAnalyticsService, now: Date): void {
    (
      service as unknown as { checkTomtomPoolHot(now: Date): void }
    ).checkTomtomPoolHot(now);
  }

  it('fires warn tomtom_pool_hot at >=80% used before day 20', () => {
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ used: 8_000, limit: 10_000 }), // 80%
      },
    };
    const opsAlerts = { emit: jest.fn() };
    const service = buildService(governance, opsAlerts);

    callCheck(service, new Date('2026-07-15T00:00:00Z')); // day 15 < 20

    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        kind: 'tomtom_pool_hot',
        dedupeKey: 'tomtom_pool_hot:2026-07',
      }),
    );
    // WHICH POOL is the whole substance of the 2026-08-04 fix: this check read
    // tomtom.scarcePolygons — reshaped to perMinute/300 — so it compared ONE
    // MINUTE of a rate window against a monthly threshold and could effectively
    // never fire. Without this assertion the mock answers any pool name and a
    // revert to scarcePolygons keeps every test above green. (F2071)
    expect(governance.pools.poolStatus).toHaveBeenCalledWith(
      'tomtom.monthlySpend',
    );
    // And the alert an operator reads must name the pool the code actually
    // queried, or it sends them to the wrong dashboard. (F2070)
    const emitted = (
      opsAlerts.emit.mock.calls as Array<[{ title: string; body: string }]>
    )[0][0];
    expect(emitted.title).toContain('monthlySpend');
    expect(emitted.body).toContain('monthlySpend');
    expect(`${emitted.title} ${emitted.body}`).not.toContain('scarcePolygons');
  });

  it('does NOT fire below the 80% fraction threshold (RED-proof: the band can read green too)', () => {
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ used: 7_999, limit: 10_000 }), // just under 80%
      },
    };
    const opsAlerts = { emit: jest.fn() };
    const service = buildService(governance, opsAlerts);

    callCheck(service, new Date('2026-07-15T00:00:00Z'));

    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('does NOT fire on/after day 20, even at 100% used (the day-of-month gate)', () => {
    const governance = {
      pools: {
        poolStatus: jest.fn().mockReturnValue({ used: 10_000, limit: 10_000 }),
      },
    };
    const opsAlerts = { emit: jest.fn() };
    const service = buildService(governance, opsAlerts);

    callCheck(service, new Date('2026-07-20T00:00:00Z'));

    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('no-ops (never throws) when no live GovernanceService is wired', () => {
    const opsAlerts = { emit: jest.fn() };
    const service = new SpendAnalyticsService(
      {} as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn() } as never,
      opsAlerts as never,
    );
    expect(() =>
      callCheck(service, new Date('2026-07-15T00:00:00Z')),
    ).not.toThrow();
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });
});

describe('SpendAnalyticsService.refreshPipelineClassRates (§24.2 all-in per-class rates)', () => {
  const mkEvent = (
    caller: string,
    inputTokens: number,
    outputTokens: number,
  ) => ({
    caller,
    inputTokens,
    outputTokens,
    cachedTokens: 0,
    model: MODEL,
    mode: 'interactive',
  });
  const cost = (e: { inputTokens: number; outputTokens: number }) =>
    geminiCostMicros({
      model: MODEL,
      mode: 'interactive',
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cachedTokens: 0,
    });

  function build(counts: {
    docsCollected: number;
    verdictsJudged: number;
    newPlaces: number;
    docsExtracted?: number;
    refreshDetailsCalls?: number;
  }) {
    const gateEvent = mkEvent('relevance-gate.judgeBatch', 2_000_000, 100_000);
    const embedEvent = mkEvent('embedding.embed', 1_000_000, 0);
    const blurEvent = mkEvent('llm.callGeminiApi', 3_000_000, 500_000);
    const searchEvent = mkEvent('query.interpret', 4_000_000, 200_000);
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [gateEvent, embedEvent, blurEvent, searchEvent],
      tomtomAgg: emptyAgg(),
      // Attribution-tagged (round-six honest denominators): 300 new-grounding
      // calls, 200 refresh details calls, and 50 LEGACY untagged calls that
      // must count in NEITHER numerator.
      placesEvents: [
        {
          skuTier: 'essentials',
          operation: 'textSearch',
          requestCount: 300,
          attribution: 'grounding.new',
        },
        {
          skuTier: 'essentials',
          operation: 'placeDetails',
          requestCount: counts.refreshDetailsCalls ?? 200,
          attribution: 'grounding.refresh',
        },
        {
          skuTier: 'essentials',
          operation: 'placeDetails',
          requestCount: 50,
          attribution: null,
        },
        // D29a: secondary-location expansion — a FULL-mask
        // (Enterprise+Atmosphere) read of an already-grounded place. It is
        // neither new grounding nor a lean refresh poll, and must land in
        // NEITHER rate; it used to be labelled 'grounding.refresh' and
        // silently inflated the regrounding numerator with a different SKU.
        {
          skuTier: 'enterprise_atmosphere',
          operation: 'placeDetails',
          requestCount: 400,
          attribution: 'grounding.expansion',
        },
      ],
      laneJoinRows: [],
      docsExtracted: counts.docsExtracted ?? counts.docsCollected,
      ...counts,
    });
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      { recordLaneCost: jest.fn().mockResolvedValue(undefined) } as never,
      { emit: jest.fn() } as never,
    );
    return { service, gateEvent, embedEvent, blurEvent };
  }

  it('publishes measured per-class rates: gate/doc, embedding/doc, interactive umbrella/doc (legacy blur IN, search OUT), places/restaurant, and the entities-per-kilodoc ratio', async () => {
    const { service, gateEvent, embedEvent, blurEvent } = build({
      docsCollected: 200,
      verdictsJudged: 120,
      newPlaces: 150,
    });
    const rows = await service.refreshUnitCosts(WINDOW_END);

    const gate = rows.find((r) => r.workClass === 'gemini.relevance_gate');
    expect(gate).toMatchObject({ unit: 'document', sampleUnits: 120 });
    expect(gate!.microUsdPerUnit).toBeCloseTo(cost(gateEvent) / 120);

    const embed = rows.find((r) => r.workClass === 'gemini.embedding');
    expect(embed).toMatchObject({ unit: 'document', sampleUnits: 200 });
    expect(embed!.microUsdPerUnit).toBeCloseTo(cost(embedEvent) / 200);

    // Umbrella: ONLY the legacy blur event — gate/embedding have their own
    // rows and query.interpret is user-search traffic, not pipeline spend.
    const interactive = rows.find(
      (r) => r.workClass === 'gemini.interactive_pipeline',
    );
    // Denominator is docs EXTRACTED (defaults to docsCollected in build()).
    expect(interactive).toMatchObject({ unit: 'document', sampleUnits: 200 });
    expect(interactive!.microUsdPerUnit).toBeCloseTo(cost(blurEvent) / 200);

    // ONLY 'grounding.new' spend in the numerator — the refresh calls and
    // the legacy untagged calls must not contaminate the rate (the July
    // $369 re-grounding lesson).
    const places = rows.find((r) => r.workClass === 'google_places.enrichment');
    expect(places).toMatchObject({ unit: 'restaurant', sampleUnits: 150 });
    expect(places!.microUsdPerUnit).toBeCloseTo(
      (placesCostMicrosPerCall('essentials', 'textSearch') * 300) / 150,
    );

    // The refresh cause gets its OWN rate over its own denominator — the
    // class a re-grounding campaign estimates against.
    const regrounding = rows.find(
      (r) => r.workClass === 'google_places.regrounding',
    );
    expect(regrounding).toMatchObject({ unit: 'location', sampleUnits: 200 });
    expect(regrounding!.microUsdPerUnit).toBeCloseTo(
      (placesCostMicrosPerCall('essentials', 'placeDetails') * 200) / 200,
    );

    const ratio = rows.find(
      (r) => r.workClass === 'pipeline.entities_per_kilodoc',
    );
    expect(ratio).toMatchObject({ unit: 'ratio', sampleUnits: 200 });
    // ENCODING: restaurants per 1000 docs — 150/200 × 1000 = 750; NOT $.
    expect(ratio!.microUsdPerUnit).toBeCloseTo(750);
  });

  it('RED-proof: denominators under MIN_SAMPLE_UNITS publish NO per-class row (never an invented rate)', async () => {
    const { service } = build({
      docsCollected: 50,
      verdictsJudged: 40,
      newPlaces: 30,
      // The regrounding denominator is the refresh-details CALL count itself
      // — shrink it below MIN_SAMPLE_UNITS too.
      refreshDetailsCalls: 40,
    });
    const rows = await service.refreshUnitCosts(WINDOW_END);
    // LIVENESS FIRST. Everything below is an ABSENCE assertion, and on an EMPTY
    // `rows` every one of them is vacuously true — a refreshUnitCosts that
    // published NOTHING AT ALL (proven: `return []` at the top keeps this test
    // green) satisfied the whole "never an invented rate" claim by inventing
    // nothing because it did nothing. The witness that the pass really ran is
    // the constant-rate FLOOR rows, which do not depend on sample size.
    expect(rows.map((r) => r.workClass)).toEqual(
      expect.arrayContaining([
        'google_places.essentials',
        'google_places.enterprise_atmosphere',
      ]),
    );
    for (const workClass of [
      'gemini.relevance_gate',
      'gemini.embedding',
      'gemini.interactive_pipeline',
      'google_places.enrichment',
      'google_places.regrounding',
      'pipeline.entities_per_kilodoc',
    ]) {
      expect(rows.find((r) => r.workClass === workClass)).toBeUndefined();
    }
  });
});
