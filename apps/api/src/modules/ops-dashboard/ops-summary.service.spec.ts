import { OPS_DASHBOARD_HTML } from './ops-dashboard.html';
import {
  OpsSummaryService,
  monthPositionColor,
  tomtomCreditRemainingMicros,
  medianOf,
  expectedByTodayMicrosV2,
} from './ops-summary.service';
import { PoolRegistry } from '../external-integrations/governance/pool-registry';

/**
 * §18.4 GET /ops/api/summary (V2): shape test over mocked services (every
 * documented top-level key present with the right nested shape), plus
 * RED-provable arithmetic tests for the TomTom prepaid-credit math and the
 * month-position color thresholds.
 */

// vendor-pricing tomtomCostMicrosPerDraw('additionalData') — the SCARCE rate.
// Cheap draws (geocode/reverseGeocode) are 1,080; the fixture below uses the
// scarce operation, so the arithmetic is unchanged from the blended era.
const TOMTOM_MICROS_PER_DRAW = 3_240;

interface PrismaOverrides {
  tomtomDailyRows?: Array<{
    requestCount: number;
    createdAt: Date;
    operation?: string;
  }>;
  tomtomAggregateRequestCount?: number;
  tomtomOperationGroups?: Array<{
    operation: string;
    _sum: { requestCount: number };
  }>;
  unitCostRows?: Array<{
    workClass: string;
    unit: string;
    microUsdPerUnit: number;
  }>;
  // Keyed by the query's SQL discriminator, NOT by call order. A positional
  // FIFO (`shift()`) fed a section's rows to whichever raw query happened to
  // resolve first, so any reorder inside a `Promise.all` silently handed a
  // section the wrong (or an empty) result. Keying by discriminator makes a
  // reorder a no-op and an UNRECOGNISED query a thrown failure.
  queryRawByFixture?: {
    sources?: unknown[];
    docs?: unknown[];
    entities?: unknown[];
    laneTimes?: unknown[];
  };
}

const buildLogger = () => {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger as never;
};

function buildPrisma(overrides: PrismaOverrides = {}) {
  const fixtures = overrides.queryRawByFixture ?? {};
  return {
    spendCampaign: { findMany: jest.fn(() => Promise.resolve([])) },
    spendUnitCost: {
      findMany: jest.fn(() => Promise.resolve(overrides.unitCostRows ?? [])),
    },
    apiUsageEvent: {
      findMany: jest.fn(
        (args: { where: { service: string; createdAt?: unknown } }) => {
          if (
            args.where.service === 'tomtom' &&
            overrides.tomtomDailyRows !== undefined
          ) {
            return Promise.resolve(overrides.tomtomDailyRows);
          }
          return Promise.resolve([]);
        },
      ),
      aggregate: jest.fn(() =>
        Promise.resolve({
          _sum: {
            requestCount: overrides.tomtomAggregateRequestCount ?? 0,
          },
        }),
      ),
      // TomTom cost is grouped BY OPERATION now — one blended rate charged the
      // scarce polygon price for a mix that is ~96% cheap geocodes, which
      // over-stated every TomTom figure on the dashboard ~2.8x.
      groupBy: jest.fn(() =>
        Promise.resolve(
          overrides.tomtomOperationGroups ?? [
            {
              operation: 'additionalData',
              _sum: {
                requestCount: overrides.tomtomAggregateRequestCount ?? 0,
              },
            },
          ],
        ),
      ),
    },
    sourceDocument: { count: jest.fn(() => Promise.resolve(3)) },
    restaurantEntityEvent: { count: jest.fn(() => Promise.resolve(7)) },
    extractionRun: {
      count: jest.fn((args: { where: { status?: string } }) =>
        Promise.resolve(args.where.status === 'failed' ? 1 : 4),
      ),
    },
    llmBatchJob: {
      count: jest.fn((args: { where: { ingestedAt: unknown } }) =>
        Promise.resolve(args.where.ingestedAt === null ? 2 : 5),
      ),
    },
    // Key by a discriminator in the SQL itself. An unrecognised query THROWS
    // rather than returning a wide `[]`, so a new/renamed raw read reds here
    // instead of silently feeding a dashboard section an empty result.
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = [...strings].join(' ');
      if (/FROM\s+sources\b/.test(sql)) {
        return Promise.resolve(fixtures.sources ?? []);
      }
      if (sql.includes('collection_source_documents')) {
        return Promise.resolve(fixtures.docs ?? []);
      }
      if (sql.includes('ev_scope.entity_id')) {
        return Promise.resolve(fixtures.entities ?? []);
      }
      if (sql.includes('source_collection_lanes')) {
        return Promise.resolve(fixtures.laneTimes ?? []);
      }
      throw new Error(
        `ops-summary spec: $queryRaw received a query no fixture discriminator matched:\n${sql}`,
      );
    }),
  };
}

function buildOpsAlerts() {
  return {
    list: jest.fn(() => Promise.resolve([{ alertId: 'a1' }])),
    unacknowledgedCount: jest.fn(() => Promise.resolve(1)),
  };
}

function buildRegistry(heartbeats: unknown[] = []) {
  return {
    collectorHeartbeats: jest.fn(() => Promise.resolve(heartbeats)),
  };
}

function buildGovernance() {
  const pools = new PoolRegistry();
  pools.register({
    name: 'gemini.monthlySpend',
    credential: 'default',
    window: {
      kind: 'perMonth',
      limit: 50_000_000,
      denomination: 'billedMicros',
    },
    reservationTtlMs: 60_000,
  });
  pools.register({
    name: 'campaign.c1',
    credential: 'default',
    window: { kind: 'grant', amount: 1_000, denomination: 'billedMicros' },
    reservationTtlMs: 60_000,
  });
  return {
    pools,
  } as unknown as import('../external-integrations/governance/governance.service').GovernanceService;
}

const NOW = new Date('2026-07-24T12:00:00Z');

const FULL_HEARTBEAT = {
  sourceId: 's1',
  handle: 'FoodNYC',
  lane: 'chronological',
  normalizedLateness: 0.2,
  outputCollapsed: false,
  lastOutputDocs: 40,
  outputDocsBaseline: 38.5,
  costBreached: false,
  lastCostMicros: 120_000,
  costBaselineMicros: 110_000,
  pendingWindowStale: false,
  expectedBatchesShortfall: null,
  coverageGapDetected: false,
};

describe('OpsSummaryService.summary (V2 shape test)', () => {
  const savedCredit = process.env.TOMTOM_PREPAID_CREDIT_USD;
  const savedDeclaredAt = process.env.TOMTOM_CREDIT_DECLARED_AT;
  afterEach(() => {
    if (savedCredit === undefined) delete process.env.TOMTOM_PREPAID_CREDIT_USD;
    else process.env.TOMTOM_PREPAID_CREDIT_USD = savedCredit;
    if (savedDeclaredAt === undefined)
      delete process.env.TOMTOM_CREDIT_DECLARED_AT;
    else process.env.TOMTOM_CREDIT_DECLARED_AT = savedDeclaredAt;
  });

  it('assembles every documented top-level key', async () => {
    delete process.env.TOMTOM_PREPAID_CREDIT_USD;
    delete process.env.TOMTOM_CREDIT_DECLARED_AT;
    const service = new OpsSummaryService(
      buildPrisma() as never,
      buildOpsAlerts() as never,
      buildRegistry([FULL_HEARTBEAT]) as never,
      buildLogger(),
      buildGovernance(),
    );
    const summary = await service.summary(NOW);

    expect(summary.spend.monthToDateByService).toEqual({
      gemini: 0,
      google_places: 0,
      tomtom: 0,
    });
    expect(summary.spend.totalMtdMicros).toBe(0);
    expect(summary.spend.last30DailyGeminiMicros).toHaveLength(30);
    expect(summary.spend.monthPosition).toEqual({
      dayOfMonth: 24,
      daysInMonth: 31,
      spentMtdMicros: 0,
      expectedByTodayMicros: null,
      percentOfExpected: null,
      color: null,
    });

    expect(summary.vendors.gemini).toEqual({
      mtdMicros: 0,
      backstopLimitMicros: 50_000_000,
      percentOfBackstop: 0,
    });
    expect(summary.vendors.tomtom.mtdMicros).toBe(0);
    expect(summary.vendors.tomtom.credit).toEqual({
      declared: false,
      creditMicros: null,
      declaredAt: null,
      burnSinceDeclaredMicros: null,
      remainingMicros: null,
      estDaysLeft: null,
    });
    expect(summary.vendors.googlePlaces).toEqual({ mtdMicros: 0 });
    expect(summary.vendors.anomalies).toEqual([]);

    expect(summary.places.ok).toBe(true);
    expect(summary.sources).toEqual({
      ok: true,
      data: [
        {
          handle: 'FoodNYC',
          lane: 'chronological',
          state: 'ok',
          normalizedLateness: 0.2,
          lastRanAt: null,
          nextDueAt: null,
          lastOutputDocs: 40,
          outputDocsBaseline: 38.5,
          lastCostMicros: 120_000,
        },
      ],
    });

    // Every runtime-failable count is a RESULT now, never a bare number: a
    // failed read must be distinguishable from a genuinely idle pipeline.
    expect(summary.pipeline).toEqual({
      docs24h: { ok: true, data: 3 },
      entities24h: { ok: true, data: 7 },
      extractionRuns24h: { ok: true, data: 4 },
      extractionFailed24h: { ok: true, data: 1 },
      batchJobsPending: { ok: true, data: 2 },
      batchJobsIngested24h: { ok: true, data: 5 },
      drainPending: null,
      unackedAlerts: 1,
    });

    expect(Array.isArray(summary.campaigns)).toBe(true);
    expect(summary.alerts.latest).toEqual([{ alertId: 'a1' }]);
    expect(summary.alerts.unacknowledgedCount).toBe(1);
  });

  it('runs without a live GovernanceService (slim script graphs) — no throw, no invented backstop', async () => {
    delete process.env.TOMTOM_PREPAID_CREDIT_USD;
    delete process.env.TOMTOM_CREDIT_DECLARED_AT;
    const service = new OpsSummaryService(
      buildPrisma() as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
    );
    const summary = await service.summary(NOW);
    expect(summary.vendors.gemini.backstopLimitMicros).toBeNull();
    expect(summary.vendors.anomalies).toEqual([]);
    expect(summary.sources).toEqual({ ok: true, data: [] });
  });

  // DELETED (D149, 2026-08-07): 'falls back to the persisted backstop.gemini
  // row when governance is absent'. It asserted a fallback to a
  // spend_unit_costs row written by the nightly backstop derivation, which
  // this rederivation deleted — the gemini ceiling is a fixed env-seeded
  // number now, so the row it read no longer exists and a stale one would
  // have displayed a ceiling that governs nothing.

  it('prices TomTom BY OPERATION — a cheap geocode is not charged the scarce polygon rate', async () => {
    // Every TomTom figure on this dashboard was ~2.8x over-stated because one
    // blended rate charged the scarce price for a mix that is ~96% cheap
    // (red team 2026-08-04). The justification — "the ledger cannot split
    // cheap from scarce" — was disproved by the ledger's own operation column.
    const make = (operation: string) =>
      new OpsSummaryService(
        buildPrisma({
          tomtomOperationGroups: [{ operation, _sum: { requestCount: 1_000 } }],
        }) as never,
        buildOpsAlerts() as never,
        buildRegistry() as never,
        buildLogger(),
      );
    const [cheapSummary, scarceSummary] = await Promise.all([
      make('reverseGeocode').summary(NOW),
      make('additionalData').summary(NOW),
    ]);
    const cheapMicros = cheapSummary.spend.monthToDateByService.tomtom;
    const scarceMicros = scarceSummary.spend.monthToDateByService.tomtom;
    expect(cheapMicros).toBe(1_000 * 1_080);
    expect(scarceMicros).toBe(1_000 * 3_240);
    expect(scarceMicros).toBe(cheapMicros * 3);
  });

  it('TomTom credit math: declared credit minus measured burn, days-left from trailing-7-day pace (RED-provable)', async () => {
    process.env.TOMTOM_PREPAID_CREDIT_USD = '100';
    process.env.TOMTOM_CREDIT_DECLARED_AT = '2026-07-01T00:00:00Z';
    // Trailing burn: 700 draws two days ago → 700 × 3,240 = 2,268,000 micros
    // over the last 7 days → 324,000 micros/day.
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    const service = new OpsSummaryService(
      buildPrisma({
        tomtomDailyRows: [{ requestCount: 700, createdAt: twoDaysAgo }],
        // Burn since declaredAt: 10,000 draws × 3,240 = 32,400,000 micros.
        tomtomAggregateRequestCount: 10_000,
      }) as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
    );
    const summary = await service.summary(NOW);
    const credit = summary.vendors.tomtom.credit;
    expect(credit.declared).toBe(true);
    expect(credit.creditMicros).toBe(100_000_000);
    expect(credit.burnSinceDeclaredMicros).toBe(
      10_000 * TOMTOM_MICROS_PER_DRAW,
    );
    // $100.00 − $32.40 = $67.60 remaining — a broken subtraction fails here.
    expect(credit.remainingMicros).toBe(67_600_000);
    // 67,600,000 ÷ 324,000/day = 208.64… → floor 208 days.
    expect(credit.estDaysLeft).toBe(208);
  });

  it('never invents a credit number when the envs are unset or unparseable', async () => {
    process.env.TOMTOM_PREPAID_CREDIT_USD = 'not-a-number';
    process.env.TOMTOM_CREDIT_DECLARED_AT = '2026-07-01T00:00:00Z';
    const service = new OpsSummaryService(
      buildPrisma({ tomtomAggregateRequestCount: 10_000 }) as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
    );
    const summary = await service.summary(NOW);
    expect(summary.vendors.tomtom.credit.declared).toBe(false);
    expect(summary.vendors.tomtom.credit.remainingMicros).toBeNull();
  });

  it('surfaces an exhausted campaign grant as an anomaly (and only then)', async () => {
    delete process.env.TOMTOM_PREPAID_CREDIT_USD;
    delete process.env.TOMTOM_CREDIT_DECLARED_AT;
    const governance = buildGovernance();
    // Drain the campaign grant fully: reserve + reconcile the whole amount.
    const admission = governance.pools.reserve('campaign.c1', 1_000, 'test');
    if (!admission.admitted) {
      throw new Error('expected grant reservation to be admitted');
    }
    await governance.pools.reconcile(admission.reservationId, 1_000);
    const service = new OpsSummaryService(
      buildPrisma() as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
      governance,
    );
    const summary = await service.summary(NOW);
    expect(summary.vendors.anomalies).toEqual([
      expect.objectContaining({ kind: 'grant_exhausted', name: 'campaign.c1' }),
    ]);
  });

  it('joins places cards from sources + doc/entity counts + measured unit cost', async () => {
    delete process.env.TOMTOM_PREPAID_CREDIT_USD;
    delete process.env.TOMTOM_CREDIT_DECLARED_AT;
    const service = new OpsSummaryService(
      buildPrisma({
        unitCostRows: [
          {
            workClass: 'gemini.reddit_extraction',
            unit: 'document',
            microUsdPerUnit: 150,
          },
        ],
        // Keyed by SQL discriminator, so the section each fixture feeds is
        // independent of the order the Promise.all awaits resolve in.
        queryRawByFixture: {
          sources: [{ handle: 'FoodNYC', anchor_place_name: 'New York City' }],
          docs: [{ community: 'foodnyc', docs_total: 24_000n, docs_24h: 120n }],
          entities: [{ community: 'foodnyc', entities: 1_800n }],
        },
      }) as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
    );
    const summary = await service.summary(NOW);
    expect(summary.places).toEqual({
      ok: true,
      data: [
        {
          community: 'FoodNYC',
          anchorPlaceName: 'New York City',
          docsTotal: 24_000,
          docs24h: 120,
          entitiesAttributed: 1_800,
          estLlmSpendMicros: 24_000 * 150,
        },
      ],
    });
  });
});

describe('monthPositionColor (RED-provable thresholds)', () => {
  it('is blue at or under 100% of the prorated expectation', () => {
    expect(monthPositionColor(0, 1_000_000)).toBe('blue');
    expect(monthPositionColor(999_999, 1_000_000)).toBe('blue');
    expect(monthPositionColor(1_000_000, 1_000_000)).toBe('blue');
  });

  it('is yellow between 100% and 130%', () => {
    expect(monthPositionColor(1_000_001, 1_000_000)).toBe('yellow');
    expect(monthPositionColor(1_300_000, 1_000_000)).toBe('yellow');
  });

  it('is red above 130%', () => {
    expect(monthPositionColor(1_300_001, 1_000_000)).toBe('red');
    expect(monthPositionColor(5_000_000, 1_000_000)).toBe('red');
  });
});

describe('tomtomCreditRemainingMicros (RED-provable)', () => {
  it('is the declared credit minus the measured burn', () => {
    expect(tomtomCreditRemainingMicros(100, 32_400_000)).toBe(67_600_000);
    expect(tomtomCreditRemainingMicros(10, 0)).toBe(10_000_000);
  });

  it('goes negative when burn exceeds the declared credit (overdraft is visible, not clamped)', () => {
    expect(tomtomCreditRemainingMicros(1, 2_000_000)).toBe(-1_000_000);
  });
});

describe('expectedByTodayMicrosV2 (expectation v2: median + approved campaigns, RED-provable)', () => {
  it('medianOf: middle value (odd), mean of middle two (even), 0 on empty', () => {
    expect(medianOf([5, 1, 9])).toBe(5);
    expect(medianOf([1, 2, 10, 100])).toBe(6);
    expect(medianOf([])).toBe(0);
  });

  it('RED-proof: under a burst fixture the median expectation PROVABLY differs from the old mean formula', () => {
    // 29 quiet days of 100 + one 30_000 campaign-burst day.
    const daily = [...Array<number>(29).fill(100), 30_000];
    const dayOfMonth = 10;
    const meanFormula = (daily.reduce((a, b) => a + b, 0) / 30) * dayOfMonth;
    const v2 = expectedByTodayMicrosV2(daily, dayOfMonth, 0);
    // Median ignores the burst entirely: 100 × 10.
    expect(v2).toBe(1_000);
    // The old mean formula was poisoned by the single burst day (~11× the
    // median baseline) — the exact ±20-30% disease being replaced.
    expect(meanFormula).toBeCloseTo(10_966.7, 0);
    expect(v2).not.toBeCloseTo(meanFormula);
  });

  it('adds the FULL envelope of campaigns approved this month once (never prorated)', () => {
    const daily = Array<number>(30).fill(100);
    expect(expectedByTodayMicrosV2(daily, 10, 0)).toBe(1_000);
    expect(expectedByTodayMicrosV2(daily, 10, 500_000)).toBe(501_000);
    // Same envelope on day 1 and day 28 — full amount, not prorated.
    expect(expectedByTodayMicrosV2(daily, 1, 500_000)).toBe(500_100);
    expect(expectedByTodayMicrosV2(daily, 28, 500_000)).toBe(502_800);
  });

  it('null when there is nothing measured to expect (no history, no campaigns)', () => {
    expect(expectedByTodayMicrosV2([], 10, 0)).toBeNull();
    expect(
      expectedByTodayMicrosV2(Array<number>(30).fill(0), 15, 0),
    ).toBeNull();
    // A campaign alone IS an expectation even with zero daily history.
    expect(expectedByTodayMicrosV2([], 10, 42)).toBe(42);
  });
});

/**
 * F206 — THE DASHBOARD CAN SAY "I DON'T KNOW".
 *
 * A failed read used to return `[]` / `0`, which on screen is an idle
 * pipeline — the reading most likely to be WRONG at the exact moment the
 * operator is looking, because the DB read failing IS the incident.
 */
describe('OpsSummaryService honest absence (F206)', () => {
  it('a failed Places/Sources read reports the failure, not an empty card', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw = jest.fn(() =>
      Promise.reject(new Error('connection reset by peer')),
    ) as never;
    const registry = buildRegistry();
    registry.collectorHeartbeats = jest.fn(() =>
      Promise.reject(new Error('registry unavailable')),
    ) as never;

    const service = new OpsSummaryService(
      prisma as never,
      buildOpsAlerts() as never,
      registry as never,
      buildLogger(),
      buildGovernance(),
    );
    const summary = await service.summary(NOW);

    expect(summary.places).toEqual({
      ok: false,
      reason: 'connection reset by peer',
    });
    expect(summary.sources).toEqual({
      ok: false,
      reason: 'registry unavailable',
    });
    // The distinction that matters: this is NOT the same payload a genuinely
    // empty deployment produces.
    expect(summary.places).not.toEqual({ ok: true, data: [] });
  });

  it('a failed pipeline count is "—", never 0', async () => {
    const prisma = buildPrisma();
    prisma.sourceDocument.count = jest.fn(() =>
      Promise.reject(new Error('statement timeout')),
    ) as never;

    const service = new OpsSummaryService(
      prisma as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildLogger(),
      buildGovernance(),
    );
    const summary = await service.summary(NOW);

    expect(summary.pipeline.docs24h).toEqual({
      ok: false,
      reason: 'statement timeout',
    });
    // Its neighbours are unaffected — one failed cell degrades one cell.
    expect(summary.pipeline.entities24h).toEqual({ ok: true, data: 7 });
  });

  it('the renderer prints the dash and the reason, and never treats a failure as a number', () => {
    const page = OPS_DASHBOARD_HTML;
    expect(page).toContain('function sectionOk(');
    expect(page).toContain('function numSection(');
    // Every runtime-failable pipeline cell goes through numSection, so no
    // cell can regress to num() on a result object (which renders "NaN"/"—"
    // by accident rather than by decision).
    for (const field of [
      'docs24h',
      'entities24h',
      'extractionRuns24h',
      'extractionFailed24h',
      'batchJobsPending',
      'batchJobsIngested24h',
    ]) {
      expect(page).toContain('numSection(pipeline.' + field + ')');
      expect(page).not.toContain('num(pipeline.' + field + ')');
    }
    expect(page).toContain('not zero');
  });
});
