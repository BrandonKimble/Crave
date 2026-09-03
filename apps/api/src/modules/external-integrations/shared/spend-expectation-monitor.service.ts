import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../../shared/completion-work-timer';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { OpsAlertsService } from './ops-alerts.service';
import { pricedGeminiRow } from './gemini-pricing';
import {
  placesCostMicrosPerCall,
  tomtomCostMicrosPerDraw,
  visionSafeSearchCostMicrosPerImage,
} from './vendor-pricing';
import {
  EXPECTED_MONTHLY_SPEND_USD,
  WATCHED_VENDORS,
  proratedExpectedUsd,
  type WatchedVendor,
} from './expected-monthly-spend';

/**
 * IS THIS MONTH NORMAL? — the surviving half of spend governance (D149,
 * owner-approved 2026-08-07).
 *
 * The system used to answer "are we spending too much?" by REFUSING work, and
 * the refusal could land on a person. Now it answers by TELLING THE OWNER,
 * every night, in an email he will actually see, while the work keeps
 * flowing. Two thresholds, chosen so each one means something a human can act
 * on without reading code:
 *
 *   >= 1x prorated expectation — "running hot". Warn, and EMAIL (the opt-in
 *     on OpsAlertsService.emit exists for exactly this): a dashboard row
 *     nobody opens is the failure this rederivation was called to fix. Often
 *     benign — a city onboarding, a re-extraction — and the owner will
 *     usually know why. Its job is to make sure he is never surprised later.
 *
 *   >= 2x prorated expectation — "something is wrong". CRITICAL, which
 *     already emails. At double the expected burn with no deliberate event,
 *     the likeliest explanation is a loop, and the surviving hard backstops
 *     (~10x) will not fire for weeks.
 *
 * Below 1x: SILENCE. An alert that fires on a normal month is an alert that
 * gets filtered.
 *
 * WHY NIGHTLY AND NOT PER-CALL: the question is about a month's trend, and a
 * trend cannot be read from one request. Riding a nightly cron also means the
 * detector cannot slow down the hot path it watches.
 *
 * DEDUPE: per vendor, per severity, on a window sized to how long the owner
 * can afford to hear nothing (F9601). It used to be per MONTH for both, which
 * reads as "tell him once" but behaves as "and then never again": ONE early
 * false positive — the 1x line is genuinely crossable on day 2 by a single
 * onboarding — silenced that vendor for the remaining 29 days, including the
 * day a real loop started. A detector that can be permanently disarmed by
 * being right early is not a detector.
 *
 *   critical (>= 2x) — DAILY. Two-times burn with no deliberate event is a
 *     loop, and a loop that is still running tomorrow is worth being told
 *     about again. Alert fatigue is the wrong worry here: at this severity the
 *     alert stops when the spend stops, so a repeat means it did not.
 *
 *   warn (>= 1x) — WEEKLY. This is a trend heads-up, usually explained by
 *     something the owner did on purpose. Daily would train him to filter it;
 *     monthly let it disappear. Four chances a month to notice August is hot,
 *     each carrying the current numbers, is the honest middle.
 */
@Injectable()
export class SpendExpectationMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private watchdogTimer: CompletionWorkTimerHandle | null = null;

  onModuleInit(): void {
    // Watchdogs are completion-truth infrastructure — self-owned timer,
    // never @Cron (red team 2026-09-03 governance #2: dead on staging).
    this.watchdogTimer = startCompletionWorkTimer({
      intervalMs: 6 * 60 * 60 * 1000,
      offSwitchEnv: 'SPEND_EXPECTATION_MONITOR_ENABLED',
      run: () => this.nightlyCheck(),
    });
  }

  onModuleDestroy(): void {
    this.watchdogTimer?.stop();
    this.watchdogTimer = null;
  }

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly opsAlerts: OpsAlertsService,
  ) {
    this.logger = loggerService.setContext('SpendExpectationMonitorService');
  }

  /**
   * 04:10 UTC — after SpendAnalyticsService's 03:40 nightly, so the ledger
   * has settled and the two spend crons don't contend. Gated implicitly:
   * ScheduleModule.forRoot() is only registered when isSchedulerRuntime()
   * (src/app.module.ts), so this @Cron is inert outside worker processes.
   */
  async nightlyCheck(now: Date = new Date()): Promise<void> {
    try {
      await this.compareToExpectation(now);
    } catch (error) {
      this.logger.error('Spend expectation comparison failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Compare month-to-date measured spend against the prorated expectation for
   * every watched vendor and alert on the two thresholds. Returns what it
   * found so a spec (and a future ops surface) can read the same numbers the
   * alert did rather than re-deriving them.
   */
  async compareToExpectation(now: Date = new Date()): Promise<
    Array<{
      vendor: WatchedVendor;
      spentUsd: number;
      proratedExpectedUsd: number;
      ratio: number;
    }>
  > {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const dayKey = now.toISOString().slice(0, 10);
    // Week-of-year for the warn window: any stable 7-day bucket works, and
    // days-since-epoch/7 is one that never disagrees with itself at a year
    // boundary the way a `YYYY-Wnn` string can.
    const weekKey = `w${Math.floor(now.getTime() / 604_800_000)}`;
    const results: Array<{
      vendor: WatchedVendor;
      spentUsd: number;
      proratedExpectedUsd: number;
      ratio: number;
    }> = [];

    for (const vendor of WATCHED_VENDORS) {
      const spentUsd =
        (await this.monthToDateMicros(vendor, monthStart, now)) / 1_000_000;
      const expected = proratedExpectedUsd(
        EXPECTED_MONTHLY_SPEND_USD[vendor].expectedMonthlyUsd,
        now,
      );
      // An expectation of zero has no ratio to speak of; treat it as "no
      // expectation declared" and say nothing rather than dividing by zero
      // into a permanent Infinity alert.
      const ratio = expected > 0 ? spentUsd / expected : 0;
      results.push({ vendor, spentUsd, proratedExpectedUsd: expected, ratio });

      this.logger.info('Vendor spend vs expectation', {
        vendor,
        spentUsd: Math.round(spentUsd * 100) / 100,
        proratedExpectedUsd: Math.round(expected * 100) / 100,
        ratio: Math.round(ratio * 100) / 100,
      });

      if (expected <= 0) {
        continue;
      }
      const money = (usd: number) =>
        `$${(Math.round(usd * 100) / 100).toFixed(2)}`;
      const shared =
        `${vendor} has spent ${money(spentUsd)} so far this month. By ` +
        `day ${now.getUTCDate()} we expect about ${money(expected)} ` +
        `(${money(EXPECTED_MONTHLY_SPEND_USD[vendor].expectedMonthlyUsd)}/mo ` +
        `prorated, from expected-monthly-spend.ts). That is ` +
        `${(Math.round(ratio * 100) / 100).toFixed(2)}x expected.`;

      if (ratio >= 2) {
        this.opsAlerts.emit({
          severity: 'critical',
          kind: 'spend_vs_expectation',
          title: `${vendor} spend is 2x+ expected this month`,
          body:
            `${shared} At double the expected burn, the likeliest cause is ` +
            `something running that shouldn't be — a retry loop or a job ` +
            `that didn't stop. Nothing is being refused: the hard backstop ` +
            `sits near 10x expected, so it will not stop this for weeks. ` +
            `Check api_usage_ledger by caller/operation for this month.`,
          dedupeKey: `spend_vs_expectation_critical:${vendor}:${dayKey}`,
        });
      } else if (ratio >= 1) {
        this.opsAlerts.emit({
          severity: 'warn',
          // The whole point of the opt-in: this one must reach an inbox.
          emailOnWarn: true,
          kind: 'spend_vs_expectation',
          title: `${vendor} spend is running hot this month`,
          body:
            `${shared} If you started a city onboarding or a re-extraction, ` +
            `this is that, and no action is needed. If you didn't, this is ` +
            `the early warning — nothing is being refused, and you have the ` +
            `rest of the month before it matters.`,
          dedupeKey: `spend_vs_expectation_warn:${vendor}:${weekKey}`,
        });
      }
    }
    return results;
  }

  /**
   * MEASURED month-to-date spend in micro-USD for one vendor, priced from
   * api_usage_ledger the same way ops-summary and spend-analytics price it —
   * the ledger rows carry counts, the pricing tables carry the vendor's
   * rates, and neither is ever hand-multiplied at a call site.
   */
  private async monthToDateMicros(
    vendor: WatchedVendor,
    start: Date,
    end: Date,
  ): Promise<number> {
    if (vendor === 'gemini') {
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
      return rows.reduce((total, row) => total + pricedGeminiRow(row), 0);
    }
    if (vendor === 'google_places') {
      const rows = await this.prisma.apiUsageEvent.findMany({
        where: {
          service: 'google_places',
          createdAt: { gte: start, lt: end },
        },
        select: { skuTier: true, operation: true, requestCount: true },
      });
      return rows.reduce(
        (total, row) =>
          total +
          placesCostMicrosPerCall(row.skuTier ?? null, row.operation) *
            (row.requestCount ?? 0),
        0,
      );
    }
    if (vendor === 'google_vision') {
      // Flat per-image rate, so a sum of request counts is the whole story.
      // NOTE this branch is EXPLICIT rather than left to fall through to the
      // TomTom tail below: that tail is a default, and a new vendor silently
      // priced at the TomTom polygon rate would be wrong by 2x with nothing
      // to notice it.
      const rows = await this.prisma.apiUsageEvent.findMany({
        where: { service: 'google_vision', createdAt: { gte: start, lt: end } },
        select: { requestCount: true },
      });
      return rows.reduce(
        (total, row) =>
          total + (row.requestCount ?? 0) * visionSafeSearchCostMicrosPerImage,
        0,
      );
    }
    // TomTom prices per OPERATION (polygons cost 3x a geocode), so group
    // rather than blending one rate across the month.
    const groups = await this.prisma.apiUsageEvent.groupBy({
      by: ['operation'],
      where: { service: 'tomtom', createdAt: { gte: start, lt: end } },
      _sum: { requestCount: true },
    });
    return groups.reduce(
      (total, group) =>
        total +
        (group._sum.requestCount ?? 0) *
          tomtomCostMicrosPerDraw(group.operation),
      0,
    );
  }
}
