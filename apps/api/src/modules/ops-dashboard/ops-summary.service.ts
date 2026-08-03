import { activeEntityEventsSourceSql } from '../content-processing/reddit-collector/extraction-scope.service';
import { Injectable, Inject, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { GovernanceService } from '../external-integrations/governance/governance.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import {
  CollectorSourceRegistryService,
  type CollectorHeartbeat,
} from '../content-processing/reddit-collector/collector-source-registry.service';
import { pricedGeminiRow } from '../external-integrations/shared/gemini-pricing';
import {
  median,
  UNIT_COST_WINDOW_DAYS,
} from '../external-integrations/shared/spend-analytics.service';
import {
  placesCostMicrosPerCall,
  tomtomBlendedCostMicrosPerDraw,
} from '../external-integrations/shared/vendor-pricing';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** §16 K3-shaped operational bound: the daily-spend window length — long
 *  enough to see a trend, short enough to stay a glance-able chart.
 *
 *  ONE HORIZON, ONE DECLARATION (audit 2026-08-02, F213). This was a second
 *  copy of 30 whose comment justified itself with "this module has no
 *  dependency on that service's internal constant" — which was not true: the
 *  file already imports `median` and `pricedGeminiRow` from that very module.
 *  The chart window and the unit-cost window drifting apart would make the
 *  displayed "expected" line quietly incomparable to the governance numbers
 *  derived from the other, so the horizon belongs to whichever module owns
 *  the concept. */
const DAILY_WINDOW_DAYS = UNIT_COST_WINDOW_DAYS;

/** Trailing window for the TomTom credit burn-rate derivation (est. days
 *  left) — a derivation of measured ledger data, never an invented number. */
const TRAILING_BURN_DAYS = 7;

/** Month-position color thresholds (dashboard readability bands, not gates —
 *  Tier 1/2/3 governance does the gating): fill is blue while month-to-date
 *  spend tracks at-or-under the prorated trailing-baseline expectation,
 *  yellow to 130% of it, red beyond. */
const MONTH_POSITION_WARN_RATIO = 1.0;
const MONTH_POSITION_HOT_RATIO = 1.3;

export type MonthPositionColor = 'blue' | 'yellow' | 'red';

/**
 * Payload-edge BigInt sanitizer (CRAVE-1B): Prisma returns BIGINT/COUNT
 * columns as BigInt, which JSON.stringify rejects — the first prod row in
 * any such column 500s the whole dashboard (spend_campaigns did exactly
 * this; a spot-mapped fix at one call site cannot protect the next column).
 * Every summary payload passes through here ONCE, so no future BigInt can
 * take the dashboard down. Exported pure for RED-provable tests.
 */
export function sanitizeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      sanitizeBigInts(item),
    ) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeBigInts(entry),
      ]),
    ) as unknown as T;
  }
  return value;
}

/** Median (even length: mean of middle two). The ONE implementation lives
 *  in spend-analytics.service.ts; re-exported here under the name the
 *  expectation math's RED-provable tests use. */
export const medianOf = median;

/**
 * Expectation v2 (2026-07-25 — the owner's ±20-30% complaint): expected
 * month-to-date spend = trailing-30d MEDIAN daily spend × day of month,
 * PLUS the full envelope of every campaign approved inside the current
 * month (counted once, never prorated — an approved campaign is explicitly
 * expected spend). The old mean-based line let one bursty campaign day
 * poison the baseline in BOTH directions: the burst inflated the mean going
 * forward AND the burst's own spend looked like an overrun on the day. A
 * median ignores the burst; the campaign term explains it instead. Pure and
 * exported for RED-provable tests (must differ from the mean formula under
 * a burst fixture). Returns null when there is nothing measured to expect.
 */
export function expectedByTodayMicrosV2(
  dailyTotalMicros: number[],
  dayOfMonth: number,
  approvedCampaignEnvelopesThisMonthMicros: number,
): number | null {
  const baseline = medianOf(dailyTotalMicros) * dayOfMonth;
  const total = baseline + approvedCampaignEnvelopesThisMonthMicros;
  return total > 0 ? total : null;
}

/** Pure month-position banding — exported so the thresholds are RED-provably
 *  testable without a service graph. */
export function monthPositionColor(
  spentMicros: number,
  expectedMicros: number,
): MonthPositionColor {
  if (expectedMicros <= 0) {
    return 'blue';
  }
  const ratio = spentMicros / expectedMicros;
  if (ratio <= MONTH_POSITION_WARN_RATIO) {
    return 'blue';
  }
  if (ratio <= MONTH_POSITION_HOT_RATIO) {
    return 'yellow';
  }
  return 'red';
}

/** Pure TomTom prepaid-credit math: owner-declared credit (a fact from the
 *  vendor top-up receipt) minus measured priced burn since the declaration.
 *  Exported for RED-provable tests. */
export function tomtomCreditRemainingMicros(
  creditUsd: number,
  burnSinceDeclaredMicros: number,
): number {
  return Math.round(creditUsd * 1_000_000) - burnSinceDeclaredMicros;
}

/**
 * A DASHBOARD CELL IS {MEASURED VALUE, NOT MEASURED} — AND A ZERO IS A
 * MEASUREMENT (audit 2026-08-02, F206).
 *
 * `warnSwallowed` was a good seam with the right rule ("degrade the card, but
 * NEVER silently — every swallow logs"), but logging is not the payload: a
 * failed Places read returned `[]`, a failed Sources read returned `[]`, and
 * each failed pipeline count returned `0`. On screen an empty Sources card and
 * `docs24h: 0` are indistinguishable from a genuinely idle pipeline — the
 * reading most likely to be WRONG at the exact moment the operator is looking,
 * because the DB read failing IS the incident.
 *
 * The honest shape was already in this file twice — `drainPending: null`
 * rendering "—" ("an honest '—' beats a fabricated number") and the TomTom
 * credit block's `declared: false` — applied to the fields whose absence was
 * known at DESIGN time and not to the fields whose absence arrives at RUNTIME.
 * This is that same rule, at runtime.
 */
export type SectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

function sectionFailed(error: unknown): { ok: false; reason: string } {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

export interface OpsSummary {
  spend: {
    monthToDateByService: Record<string, number>;
    totalMtdMicros: number;
    last30DailyGeminiMicros: number[];
    monthPosition: {
      dayOfMonth: number;
      daysInMonth: number;
      spentMtdMicros: number;
      /** Expectation v2: (trailing-30d MEDIAN daily spend × day of month)
       *  + full envelopes of campaigns approved this month (counted once,
       *  never prorated) — null when there is nothing measured to expect. */
      expectedByTodayMicros: number | null;
      percentOfExpected: number | null;
      color: MonthPositionColor | null;
    };
  };
  vendors: {
    gemini: {
      mtdMicros: number;
      /** gemini.monthlySpend Tier-3 backstop ceiling (measured-derived). */
      backstopLimitMicros: number | null;
      percentOfBackstop: number | null;
    };
    tomtom: {
      mtdMicros: number;
      credit: {
        /** Both TOMTOM_PREPAID_CREDIT_USD + TOMTOM_CREDIT_DECLARED_AT set
         *  and parseable. When false every other field is null — the
         *  dashboard says "not declared", never invents a balance. */
        declared: boolean;
        creditMicros: number | null;
        declaredAt: string | null;
        burnSinceDeclaredMicros: number | null;
        remainingMicros: number | null;
        /** Derived from trailing-7-day measured burn; null when no recent
         *  burn exists to derive a rate from. */
        estDaysLeft: number | null;
      };
    };
    googlePlaces: { mtdMicros: number };
    /** ONLY currently-broken governance facts (poisoned pool / exhausted
     *  campaign grant) — empty means nothing to say. */
    anomalies: Array<{
      kind: 'pool_poisoned' | 'grant_exhausted';
      name: string;
      detail: string;
    }>;
  };
  places: SectionResult<
    Array<{
      community: string;
      anchorPlaceName: string | null;
      docsTotal: number;
      docs24h: number;
      entitiesAttributed: number;
      /** Measured gemini per-document unit cost × this community's docs —
       *  null (rendered "—") when no unit-cost row exists yet. */
      estLlmSpendMicros: number | null;
    }>
  >;
  sources: SectionResult<
    Array<{
      handle: string;
      lane: string;
      state: 'ok' | 'cost_paused' | 'red';
      normalizedLateness: number;
      lastRanAt: string | null;
      nextDueAt: string | null;
      lastOutputDocs: number | null;
      outputDocsBaseline: number | null;
      lastCostMicros: number | null;
    }>
  >;
  pipeline: {
    docs24h: SectionResult<number>;
    entities24h: SectionResult<number>;
    extractionRuns24h: SectionResult<number>;
    extractionFailed24h: SectionResult<number>;
    batchJobsPending: SectionResult<number>;
    batchJobsIngested24h: SectionResult<number>;
    /** NOT a failure: no drain-backlog instrument exists yet. Absence known
     *  at design time keeps its design-time shape. */
    drainPending: number | null;
    unackedAlerts: number;
  };
  campaigns: unknown[];
  alerts: {
    latest: unknown[];
    unacknowledgedCount: number;
  };
}

/** The row shapes the two list sections carry, named so the SectionResult
 *  wrapper does not have to be indexed through twice. */
export type PlacesRow = (OpsSummary['places'] & { ok: true })['data'][number];
export type SourcesRows = (OpsSummary['sources'] & { ok: true })['data'];

interface SpendCore {
  monthToDateByService: Record<string, number>;
  totalMtdMicros: number;
  dailyGeminiMicros: number[];
  dailyTotalMicros: number[];
  dailyTomtomMicros: number[];
  monthPosition: OpsSummary['spend']['monthPosition'];
}

interface UnitCostRowLite {
  workClass: string;
  unit: string;
  microUsdPerUnit: number;
}

/**
 * §18.4 GET /ops/api/summary assembly (V2). Reads existing tables/services
 * directly (api_usage_ledger priced via the shared vendor/gemini price
 * tables — the same pricing spend-analytics.service.ts uses — plus
 * spend_unit_costs, spend_campaigns, ops_alerts, governance pool status,
 * collector heartbeats, and the collection pipeline tables). No new
 * derivation logic beyond arithmetic on measured data — a read-side shape
 * for the dashboard, honest to the no-fake-estimates law.
 */
@Injectable()
export class OpsSummaryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    private readonly registry: CollectorSourceRegistryService,
    @Inject(LoggerService) loggerService: LoggerService,
    @Optional() private readonly governance?: GovernanceService,
  ) {
    this.logger = loggerService.setContext('OpsSummaryService');
  }

  /** Data-honesty rule: a dashboard read failure may degrade its own card to
   *  empty/zero, but NEVER silently — every swallow logs the real error so a
   *  DB regression can't hide behind a quietly-empty card. */
  private warnSwallowed(section: string, error: unknown): void {
    this.logger.warn('Ops dashboard read failed — section degraded', {
      operation: 'ops_summary_section_read',
      section,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  /** One count, one honest answer: the number, or the reason there isn't one. */
  private async countSection(
    section: string,
    read: () => Promise<number>,
  ): Promise<SectionResult<number>> {
    try {
      return { ok: true, data: await read() };
    } catch (error) {
      this.warnSwallowed(section, error);
      return sectionFailed(error);
    }
  }

  async summary(now: Date = new Date()): Promise<OpsSummary> {
    return sanitizeBigInts(await this.assembleSummary(now));
  }

  private async assembleSummary(now: Date): Promise<OpsSummary> {
    const [
      spendCore,
      campaigns,
      unitCostRows,
      alerts,
      unacknowledgedCount,
      placesBase,
      sources,
      pipelineCore,
    ] = await Promise.all([
      this.spendCore(now),
      this.prisma.spendCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.spendUnitCost.findMany().catch((error: unknown) => {
        this.warnSwallowed('spendUnitCost', error);
        return [] as UnitCostRowLite[];
      }),
      this.opsAlerts.list(50),
      this.opsAlerts.unacknowledgedCount(),
      this.placesSection(now),
      this.sourcesSection(now),
      this.pipelineCore(now),
    ]);

    const vendors = await this.vendorsSection(now, spendCore, unitCostRows);

    const perDocRow = unitCostRows.find(
      (row) =>
        row.workClass === 'gemini.reddit_extraction' && row.unit === 'document',
    );
    // The unit-cost decoration rides on the section RESULT: a failed Places
    // read stays a failure all the way to the renderer (F206).
    const places: OpsSummary['places'] = placesBase.ok
      ? {
          ok: true,
          data: placesBase.data.map((entry) => ({
            ...entry,
            estLlmSpendMicros:
              perDocRow !== undefined
                ? Math.round(perDocRow.microUsdPerUnit * entry.docsTotal)
                : null,
          })),
        }
      : placesBase;

    return {
      spend: {
        monthToDateByService: spendCore.monthToDateByService,
        totalMtdMicros: spendCore.totalMtdMicros,
        last30DailyGeminiMicros: spendCore.dailyGeminiMicros,
        monthPosition: spendCore.monthPosition,
      },
      vendors,
      places,
      sources,
      pipeline: {
        ...pipelineCore,
        unackedAlerts: unacknowledgedCount,
      },
      // Prisma returns BIGINT columns as BigInt, which JSON.stringify
      // rejects — surfaced by the first real spend_campaigns row (an empty
      // table serialized fine). Map to plain numbers at the payload edge.
      campaigns: campaigns.map((row) => ({
        ...row,
        spentMicros: row.spentMicros === null ? null : Number(row.spentMicros),
        estimateMicros:
          row.estimateMicros === null ? null : Number(row.estimateMicros),
      })),
      alerts: { latest: alerts, unacknowledgedCount },
    };
  }

  // ---------------------------------------------------------------- spend

  private async spendCore(now: Date): Promise<SpendCore> {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const windowStart = new Date(
      now.getTime() - DAILY_WINDOW_DAYS * MS_PER_DAY,
    );

    const [
      geminiMtd,
      placesMtd,
      tomtomMtd,
      dailyGemini,
      dailyPlaces,
      dailyTomtom,
    ] = await Promise.all([
      this.geminiMicros(monthStart, now),
      this.placesMicros(monthStart, now),
      this.tomtomMicros(monthStart, now),
      this.dailyGeminiMicros(windowStart, now),
      this.dailyPlacesMicros(windowStart, now),
      this.dailyTomtomMicros(windowStart, now),
    ]);

    const totalMtdMicros = geminiMtd + placesMtd + tomtomMtd;
    const dailyTotalMicros = dailyGemini.map(
      (value, i) => value + dailyPlaces[i] + dailyTomtom[i],
    );

    const dayOfMonth = Math.max(
      1,
      Math.floor((now.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1,
    );
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    // Expectation v2 (see expectedByTodayMicrosV2's doc comment): median
    // baseline + full envelopes of campaigns APPROVED this month. Pilots
    // (estimateMicros null) have no envelope and contribute nothing.
    const approvedThisMonth = await this.prisma.spendCampaign.findMany({
      where: {
        approvedAt: { gte: monthStart, lte: now },
        estimateMicros: { not: null },
      },
      select: { estimateMicros: true, toleranceFraction: true },
    });
    const campaignEnvelopesMicros = approvedThisMonth.reduce(
      (sum, row) =>
        sum +
        Math.round(
          Number(row.estimateMicros) * (1 + (row.toleranceFraction ?? 0)),
        ),
      0,
    );
    // Leading zero-days are ABSENCE of measurement (the ledger simply didn't
    // exist yet — e.g. right after the prod cutover), not measured zero
    // spend; feeding them to the median reads "expected = $0" for weeks.
    // Trim to the first day with any recorded spend; genuine zero days
    // AFTER activity began still count.
    const firstActive = dailyTotalMicros.findIndex((v) => v > 0);
    const measuredDays =
      firstActive >= 0 ? dailyTotalMicros.slice(firstActive) : [];
    const expectedByTodayMicros = expectedByTodayMicrosV2(
      measuredDays,
      dayOfMonth,
      campaignEnvelopesMicros,
    );

    return {
      monthToDateByService: {
        gemini: geminiMtd,
        google_places: placesMtd,
        tomtom: tomtomMtd,
      },
      totalMtdMicros,
      dailyGeminiMicros: dailyGemini,
      dailyTotalMicros,
      dailyTomtomMicros: dailyTomtom,
      monthPosition: {
        dayOfMonth,
        daysInMonth,
        spentMtdMicros: totalMtdMicros,
        expectedByTodayMicros,
        percentOfExpected:
          expectedByTodayMicros !== null
            ? Math.round((totalMtdMicros / expectedByTodayMicros) * 1000) / 10
            : null,
        color:
          expectedByTodayMicros !== null
            ? monthPositionColor(totalMtdMicros, expectedByTodayMicros)
            : null,
      },
    };
  }

  private dayBucket(createdAt: Date, windowStart: Date): number {
    const index = Math.floor(
      (createdAt.getTime() - windowStart.getTime()) / MS_PER_DAY,
    );
    return Math.min(DAILY_WINDOW_DAYS - 1, Math.max(0, index));
  }

  private async dailyGeminiMicros(
    windowStart: Date,
    now: Date,
  ): Promise<number[]> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'gemini', createdAt: { gte: windowStart, lt: now } },
      select: {
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        model: true,
        mode: true,
        createdAt: true,
      },
    });
    const buckets = new Array<number>(DAILY_WINDOW_DAYS).fill(0);
    for (const row of rows) {
      buckets[this.dayBucket(row.createdAt, windowStart)] +=
        pricedGeminiRow(row);
    }
    return buckets;
  }

  private async dailyPlacesMicros(
    windowStart: Date,
    now: Date,
  ): Promise<number[]> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: {
        service: 'google_places',
        createdAt: { gte: windowStart, lt: now },
      },
      select: {
        skuTier: true,
        operation: true,
        requestCount: true,
        createdAt: true,
      },
    });
    const buckets = new Array<number>(DAILY_WINDOW_DAYS).fill(0);
    for (const row of rows) {
      buckets[this.dayBucket(row.createdAt, windowStart)] +=
        placesCostMicrosPerCall(row.skuTier ?? null, row.operation) *
        (row.requestCount ?? 0);
    }
    return buckets;
  }

  private async dailyTomtomMicros(
    windowStart: Date,
    now: Date,
  ): Promise<number[]> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'tomtom', createdAt: { gte: windowStart, lt: now } },
      select: { requestCount: true, createdAt: true },
    });
    const buckets = new Array<number>(DAILY_WINDOW_DAYS).fill(0);
    for (const row of rows) {
      buckets[this.dayBucket(row.createdAt, windowStart)] +=
        (row.requestCount ?? 0) * tomtomBlendedCostMicrosPerDraw;
    }
    return buckets;
  }

  private async geminiMicros(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'gemini', createdAt: { gte: start, lt: end } },
      select: {
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        model: true,
        mode: true,
      },
    });
    let total = 0;
    for (const row of rows) {
      total += pricedGeminiRow(row);
    }
    return total;
  }

  private async placesMicros(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'google_places', createdAt: { gte: start, lt: end } },
      select: { skuTier: true, operation: true, requestCount: true },
    });
    let total = 0;
    for (const row of rows) {
      total +=
        placesCostMicrosPerCall(row.skuTier ?? null, row.operation) *
        (row.requestCount ?? 0);
    }
    return total;
  }

  private async tomtomMicros(start: Date, end: Date): Promise<number> {
    const agg = await this.prisma.apiUsageEvent.aggregate({
      where: { service: 'tomtom', createdAt: { gte: start, lt: end } },
      _sum: { requestCount: true },
    });
    return (agg._sum.requestCount ?? 0) * tomtomBlendedCostMicrosPerDraw;
  }

  // -------------------------------------------------------------- vendors

  private async vendorsSection(
    now: Date,
    spendCore: SpendCore,
    unitCostRows: UnitCostRowLite[],
  ): Promise<OpsSummary['vendors']> {
    const geminiMtd = spendCore.monthToDateByService.gemini ?? 0;
    const backstopLimitMicros = this.geminiBackstopLimitMicros(unitCostRows);

    return {
      gemini: {
        mtdMicros: geminiMtd,
        backstopLimitMicros,
        percentOfBackstop:
          backstopLimitMicros !== null && backstopLimitMicros > 0
            ? Math.round((geminiMtd / backstopLimitMicros) * 1000) / 10
            : null,
      },
      tomtom: {
        mtdMicros: spendCore.monthToDateByService.tomtom ?? 0,
        credit: await this.tomtomCredit(now, spendCore.dailyTomtomMicros),
      },
      googlePlaces: {
        mtdMicros: spendCore.monthToDateByService.google_places ?? 0,
      },
      anomalies: this.governanceAnomalies(now),
    };
  }

  /** Tier-3 ceiling: the live gemini.monthlySpend pool limit when a
   *  governance graph is present, else the persisted measured-derived
   *  backstop row (workClass 'backstop.gemini', unit 'month') — the same
   *  number governance itself boots from. Null when neither exists. */
  private geminiBackstopLimitMicros(
    unitCostRows: UnitCostRowLite[],
  ): number | null {
    if (this.governance) {
      try {
        return this.governance.pools.poolStatus('gemini.monthlySpend').limit;
      } catch {
        // Pool not registered in this graph — fall through to the row.
      }
    }
    const row = unitCostRows.find(
      (r) => r.workClass === 'backstop.gemini' && r.unit === 'month',
    );
    return row !== undefined ? Math.round(row.microUsdPerUnit) : null;
  }

  /** Prepaid credit is invisible to the TomTom API, so the balance is an
   *  owner-declared fact (env, set from the top-up receipt) minus MEASURED
   *  priced burn since the declaration — never an invented number. Unset
   *  env = "not declared", full stop. */
  private async tomtomCredit(
    now: Date,
    dailyTomtomMicros: number[],
  ): Promise<OpsSummary['vendors']['tomtom']['credit']> {
    const creditUsd = Number(process.env.TOMTOM_PREPAID_CREDIT_USD);
    const declaredAtRaw = process.env.TOMTOM_CREDIT_DECLARED_AT;
    const declaredAt =
      declaredAtRaw !== undefined && declaredAtRaw !== ''
        ? new Date(declaredAtRaw)
        : null;
    const declared =
      Number.isFinite(creditUsd) &&
      creditUsd > 0 &&
      declaredAt !== null &&
      !Number.isNaN(declaredAt.getTime());
    if (!declared || declaredAt === null) {
      return {
        declared: false,
        creditMicros: null,
        declaredAt: null,
        burnSinceDeclaredMicros: null,
        remainingMicros: null,
        estDaysLeft: null,
      };
    }

    const burnSinceDeclaredMicros = await this.tomtomMicros(declaredAt, now);
    const remainingMicros = tomtomCreditRemainingMicros(
      creditUsd,
      burnSinceDeclaredMicros,
    );
    const trailingBurnMicros = dailyTomtomMicros
      .slice(-TRAILING_BURN_DAYS)
      .reduce((a, b) => a + b, 0);
    const dailyRateMicros = trailingBurnMicros / TRAILING_BURN_DAYS;
    const estDaysLeft =
      dailyRateMicros > 0
        ? Math.max(0, Math.floor(remainingMicros / dailyRateMicros))
        : null;

    return {
      declared: true,
      creditMicros: Math.round(creditUsd * 1_000_000),
      declaredAt: declaredAt.toISOString(),
      burnSinceDeclaredMicros,
      remainingMicros,
      estDaysLeft,
    };
  }

  /** Only currently-broken governance facts: a poisoned pool window, or a
   *  campaign grant pool fully exhausted. Healthy pools contribute nothing
   *  (no bars — the caps are backstops, not a dashboard centerpiece). */
  private governanceAnomalies(now: Date): OpsSummary['vendors']['anomalies'] {
    if (!this.governance) {
      return [];
    }
    const anomalies: OpsSummary['vendors']['anomalies'] = [];
    for (const pool of this.governance.pools.listRegistered()) {
      let status: {
        used: number;
        limit: number;
        poisonedForMs: number | null;
      };
      try {
        status = this.governance.pools.poolStatus(pool.name, now);
      } catch {
        continue;
      }
      if (status.poisonedForMs !== null && status.poisonedForMs > 0) {
        anomalies.push({
          kind: 'pool_poisoned',
          name: pool.name,
          detail: `pool poisoned for another ${Math.ceil(
            status.poisonedForMs / 60_000,
          )}m (vendor 429 honored globally)`,
        });
      }
      if (
        pool.window.kind === 'grant' &&
        status.limit > 0 &&
        status.used >= status.limit
      ) {
        anomalies.push({
          kind: 'grant_exhausted',
          name: pool.name,
          detail: `grant exhausted (${status.used}/${status.limit} micro-USD consumed)`,
        });
      }
    }
    return anomalies;
  }

  // --------------------------------------------------------------- places

  private async placesSection(
    now: Date,
  ): Promise<SectionResult<Array<Omit<PlacesRow, 'estLlmSpendMicros'>>>> {
    const since = new Date(now.getTime() - MS_PER_DAY);
    let sources: Array<{ handle: string; anchor_place_name: string | null }>;
    let docs: Array<{
      community: string;
      docs_total: bigint;
      docs_24h: bigint;
    }>;
    let entities: Array<{ community: string; entities: bigint }>;
    try {
      [sources, docs, entities] = await Promise.all([
        this.prisma.$queryRaw<
          Array<{ handle: string; anchor_place_name: string | null }>
        >`
          SELECT s.handle, p.name AS anchor_place_name
          FROM sources s
          LEFT JOIN places p ON p.place_id = s.anchor_place_id
          WHERE s.platform = 'reddit'
          ORDER BY s.handle
        `,
        this.prisma.$queryRaw<
          Array<{ community: string; docs_total: bigint; docs_24h: bigint }>
        >`
          SELECT lower(community) AS community,
                 COUNT(*) AS docs_total,
                 COUNT(*) FILTER (WHERE collected_at >= ${since}) AS docs_24h
          FROM collection_source_documents
          WHERE community IS NOT NULL
          GROUP BY lower(community)
        `,
        this.prisma.$queryRaw<Array<{ community: string; entities: bigint }>>`
          SELECT lower(d_scope.community) AS community,
                 COUNT(DISTINCT ev_scope.entity_id) AS entities
          FROM ${Prisma.raw(activeEntityEventsSourceSql())}
          WHERE d_scope.community IS NOT NULL
          GROUP BY lower(d_scope.community)
        `,
      ]);
    } catch (error) {
      // A read failure must never take the whole dashboard down — but it must
      // not be reported as an EMPTY Places card either. Empty is a
      // measurement; this is the absence of one (F206).
      this.warnSwallowed('places', error);
      return sectionFailed(error);
    }

    const docsByCommunity = new Map<
      string,
      { total: number; last24h: number }
    >();
    for (const row of docs) {
      docsByCommunity.set(row.community, {
        total: Number(row.docs_total),
        last24h: Number(row.docs_24h),
      });
    }
    const entitiesByCommunity = new Map<string, number>();
    for (const row of entities) {
      entitiesByCommunity.set(row.community, Number(row.entities));
    }

    const data = sources.map((source) => {
      const key = source.handle.toLowerCase();
      const docCounts = docsByCommunity.get(key) ?? { total: 0, last24h: 0 };
      return {
        community: source.handle,
        anchorPlaceName: source.anchor_place_name,
        docsTotal: docCounts.total,
        docs24h: docCounts.last24h,
        entitiesAttributed: entitiesByCommunity.get(key) ?? 0,
      };
    });
    return { ok: true, data };
  }

  // -------------------------------------------------------------- sources

  private async sourcesSection(now: Date): Promise<SectionResult<SourcesRows>> {
    let heartbeats: CollectorHeartbeat[];
    let laneTimes: Array<{
      source_id: string;
      lane: string;
      due_at: Date;
      last_ran_at: Date | null;
    }>;
    try {
      [heartbeats, laneTimes] = await Promise.all([
        this.registry.collectorHeartbeats(now),
        this.prisma.$queryRaw<
          Array<{
            source_id: string;
            lane: string;
            due_at: Date;
            last_ran_at: Date | null;
          }>
        >`
          SELECT l.source_id, l.lane, l.due_at, l.last_ran_at
          FROM source_collection_lanes l
          WHERE l.enabled
        `,
      ]);
    } catch (error) {
      // Same rule as Places: an empty Sources card means "no enabled lanes",
      // which is a claim this read is in no position to make (F206).
      this.warnSwallowed('sources', error);
      return sectionFailed(error);
    }
    const timesByKey = new Map<
      string,
      { due_at: Date; last_ran_at: Date | null }
    >();
    for (const row of laneTimes) {
      timesByKey.set(`${row.source_id} ${row.lane}`, row);
    }

    const data = heartbeats.map((beat): SourcesRows[number] => {
      const times = timesByKey.get(`${beat.sourceId} ${beat.lane}`);
      // Broader than spend-analytics' checkLaneReds ALERT predicate on
      // purpose: the dashboard also shows transient lateness + coverage
      // gaps; alerts stay restricted to durable conditions (see the
      // checkLaneReds doc comment).
      const red =
        beat.normalizedLateness > 1 ||
        beat.outputCollapsed ||
        beat.pendingWindowStale ||
        (beat.expectedBatchesShortfall ?? 0) > 0 ||
        beat.coverageGapDetected;
      return {
        handle: beat.handle,
        lane: beat.lane,
        state: beat.costBreached ? 'cost_paused' : red ? 'red' : 'ok',
        normalizedLateness: beat.normalizedLateness,
        lastRanAt: times?.last_ran_at ? times.last_ran_at.toISOString() : null,
        nextDueAt: times?.due_at ? times.due_at.toISOString() : null,
        lastOutputDocs: beat.lastOutputDocs,
        outputDocsBaseline: beat.outputDocsBaseline,
        lastCostMicros: beat.lastCostMicros,
      };
    });
    return { ok: true, data };
  }

  // ------------------------------------------------------------- pipeline

  private async pipelineCore(
    now: Date,
  ): Promise<Omit<OpsSummary['pipeline'], 'unackedAlerts'>> {
    const since = new Date(now.getTime() - MS_PER_DAY);
    const [
      docs24h,
      entities24h,
      extractionRuns24h,
      extractionFailed24h,
      batchJobsPending,
      batchJobsIngested24h,
    ] = await Promise.all([
      // A COUNT THAT FAILED IS NOT A COUNT OF ZERO (F206). Each of these used
      // to `return 0` on error, which renders as a genuinely idle pipeline —
      // the single most misleading thing the card could say at the exact
      // moment an operator is looking at it.
      this.countSection('pipeline.docs24h', () =>
        this.prisma.sourceDocument.count({
          where: { collectedAt: { gte: since } },
        }),
      ),
      this.countSection('pipeline.entities24h', () =>
        this.prisma.restaurantEntityEvent.count({
          where: { createdAt: { gte: since } },
        }),
      ),
      this.countSection('pipeline.extractionRuns24h', () =>
        this.prisma.extractionRun.count({
          where: { startedAt: { gte: since } },
        }),
      ),
      this.countSection('pipeline.extractionFailed24h', () =>
        this.prisma.extractionRun.count({
          where: { status: 'failed', startedAt: { gte: since } },
        }),
      ),
      // Terminal failures are not "pending" — without this filter the
      // July-11-era failed relics inflate the card forever.
      this.countSection('pipeline.batchJobsPending', () =>
        this.prisma.llmBatchJob.count({
          where: { ingestedAt: null, status: { not: 'failed' } },
        }),
      ),
      this.countSection('pipeline.batchJobsIngested24h', () =>
        this.prisma.llmBatchJob.count({
          where: { ingestedAt: { gte: since } },
        }),
      ),
    ]);
    return {
      docs24h,
      entities24h,
      extractionRuns24h,
      extractionFailed24h,
      batchJobsPending,
      batchJobsIngested24h,
      // V1 behavior kept: no drain-backlog instrument exists yet — an honest
      // "—" beats a fabricated number (no-fake-estimates law).
      drainPending: null,
    };
  }
}
