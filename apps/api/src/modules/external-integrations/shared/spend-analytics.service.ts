import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { geminiCostMicros } from './gemini-pricing';
import { CollectorSourceRegistryService } from '../../content-processing/reddit-collector/collector-source-registry.service';
import { GovernanceService } from '../governance/governance.service';

/**
 * §24.2 the measured unit-cost table (plans/geo-demand-foundation-rebuild.md
 * §24). ONE derived row per (work_class, unit), computed nightly from
 * api_usage_ledger joined to the work it produced — NEVER hand-seeded
 * (§16 no-fake-estimates law). Unjoinable spend still gets a row
 * (work_class 'unattributed.<service>') so spend is never silently lost —
 * mirroring gemini-pricing's unknown-model rule.
 */
export interface UnitCostRow {
  workClass: string;
  unit: string;
  microUsdPerUnit: number;
  sampleUnits: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * §16 K2-shaped prior WITH AN EXPLICIT ERASURE NOTE (§24.2's "insufficient
 * sample" floor): the intended definition is "enough units that the
 * estimate's own variance is below the drift tolerance" (§14.2's
 * measureDrift instrument), but that instrument doesn't exist for spend
 * yet. Until it does, 100 units stands in as a documented placeholder — it
 * is ERASED (replaced by the variance-derived floor) the moment the
 * drift instrument lands, not ratified as a permanent knob. What changes
 * this: landing §14.2 measureDrift for spend work classes.
 */
const MIN_SAMPLE_UNITS = 100;

/**
 * §16 K3-shaped operational bound: how far back the nightly refresh looks
 * for joinable ledger rows. 30 days is sized to comfortably exceed the
 * slowest honest gemini-batch turnaround (§K4: 24h SLA) many times over,
 * so a full window's asynchronous completions are almost always captured.
 * What changes this: the vendor's batch SLA, if it moves materially past
 * a day (K4-linked, not a tuned knob).
 */
const UNIT_COST_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * §24.6 K1 — the ONE owner-ratified constant of §24 (master plan §24.1
 * Tier 3): the gemini.monthlySpend catastrophe backstop's limit is
 * BACKSTOP_MULTIPLE × the trailing measured monthly spend. Initial value 3
 * ratified 2026-07-24 — "a bug may cost at most two extra months" (the
 * multiple minus the one month it already spent). Changing this number is
 * an owner re-ratification, exactly like any other K1 price-tag; it is NOT
 * re-derived from data (only the trailing spend it multiplies is).
 */
const BACKSTOP_MULTIPLE = 3;

/** work_class the derived gemini backstop is written under (spend_unit_costs,
 *  unit='month') — governance.service.ts reads this exact pair at boot. */
const GEMINI_BACKSTOP_WORK_CLASS = 'backstop.gemini';

/**
 * §24.4 item 6 replacement for the removed 80%-of-cap warn: warn when
 * month-to-date spend exceeds the prorated trailing-baseline expectation by
 * more than this many standard deviations of the last 30 daily totals,
 * scaled by sqrt(days-elapsed) — the standard random-walk aggregation
 * scaling (variance of a sum of N i.i.d. days = N × per-day variance, so
 * stddev scales as sqrt(N)). Reuses the same K=3 "three-sigma" convention
 * as COST_BREACH_K-family constants elsewhere in this codebase, applied to
 * the monthly aggregate rather than a per-tick lane cost.
 */
const SPEND_TELEMETRY_WARN_K = 3;

/** Median of a numeric array (even-length: mean of the two middle values).
 *  Used by refreshBackstop instead of a mean so a run of ~15 runaway days
 *  cannot single-handedly drag the trailing baseline up with them. */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

@Injectable()
export class SpendAnalyticsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly registry: CollectorSourceRegistryService,
    // Optional: slim script graphs may lack the governance module; the
    // unit-cost/backstop-row refresh must never depend on live pool access
    // (governance.service.ts re-reads the written row at its OWN boot).
    @Optional() private readonly governance?: GovernanceService,
  ) {
    this.logger = loggerService.setContext('SpendAnalyticsService');
  }

  /**
   * Nightly off-peak refresh (03:40 UTC-ish server local — outside the
   * signals-partition 03:10 and other worker-cron slots so they don't pile
   * up on the same tick). Gated implicitly: ScheduleModule.forRoot() is
   * only registered when isSchedulerRuntime() (src/app.module.ts), so this
   * @Cron is inert outside worker processes — the same mechanism every
   * other worker cron in this codebase relies on.
   */
  @Cron('40 3 * * *')
  async nightlyRefresh(now: Date = new Date()): Promise<void> {
    try {
      await this.refreshUnitCosts(now);
    } catch (error) {
      this.logger.error('Spend analytics nightly refresh failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Read: the current unit-cost table (§24.2's "queryable live" leg). */
  async unitCosts(): Promise<UnitCostRow[]> {
    const rows = await this.prisma.spendUnitCost.findMany();
    return rows.map((row) => ({
      workClass: row.workClass,
      unit: row.unit,
      microUsdPerUnit: row.microUsdPerUnit,
      sampleUnits: Number(row.sampleUnits),
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
    }));
  }

  /**
   * Derive micro-USD-per-unit for every joinable work class over the
   * trailing window and upsert the table. Also folds gemini spend that
   * DOES join to a documented reddit source (community = source handle)
   * into that source's 'keyword' lane cost baseline via
   * CollectorSourceRegistryService.recordLaneCost — the Leg B wiring point.
   * Architecture note (see final report): LLM spend for reddit extraction
   * lands ASYNCHRONOUSLY (gemini batch, hours later) with no lane tag on
   * the resulting documents (SourceDocument carries `community`, not
   * `lane`) — so per-lane cost cannot be attributed at a single synchronous
   * tick the way §12.4's output count can. This nightly pass is the
   * boundary where the (community -> source -> lane) join first becomes
   * possible; it is the honest "same tick" for cost that §24.1 Tier 2
   * describes, given the current schema. Attributed to 'keyword' (the lane
   * whose selection scope covers the community broadly); chronological
   * remains unwired pending a lane tag on collected documents.
   */
  async refreshUnitCosts(now: Date = new Date()): Promise<UnitCostRow[]> {
    const windowEnd = now;
    const windowStart = new Date(
      now.getTime() - UNIT_COST_WINDOW_DAYS * MS_PER_DAY,
    );

    const results: UnitCostRow[] = [];
    results.push(
      ...(await this.refreshGeminiPerDocument(windowStart, windowEnd)),
    );
    results.push(
      ...(await this.refreshUnattributed(
        'tomtom',
        'draw',
        windowStart,
        windowEnd,
      )),
    );
    results.push(
      ...(await this.refreshUnattributed(
        'google_places',
        'call',
        windowStart,
        windowEnd,
      )),
    );

    await this.attributeLaneCosts(windowStart, windowEnd);
    await this.refreshBackstop(windowStart, windowEnd, now);
    await this.logSpendTelemetry(now);

    for (const row of results) {
      await this.prisma.spendUnitCost.upsert({
        where: { workClass_unit: { workClass: row.workClass, unit: row.unit } },
        create: {
          workClass: row.workClass,
          unit: row.unit,
          microUsdPerUnit: row.microUsdPerUnit,
          sampleUnits: row.sampleUnits,
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
        },
        update: {
          microUsdPerUnit: row.microUsdPerUnit,
          sampleUnits: row.sampleUnits,
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
          refreshedAt: now,
        },
      });
    }
    return results;
  }

  /**
   * gemini per-DOCUMENT for reddit batch processing (§24.2a): join
   * api_usage_ledger (service='gemini', caller='gemini-batch.
   * collection_extraction' — the only caller that carries a runKey tying
   * back to an extraction run, per gemini-batch.service.ts) to
   * collection_source_documents counts via
   *   runKey (=llm_batch_jobs.job_id)
   *     -> llm_batch_jobs.resume_context->>'extractionRunId'
   *     -> collection_extraction_input_documents.input_id
   *        (via collection_extraction_inputs.extraction_run_id)
   *     -> DISTINCT document_id
   * This is the run_key join the instructions call out — no time-window
   * heuristic needed for this work class since every batch-extraction
   * ledger row carries a run_key that resolves to an extraction run.
   */
  private async refreshGeminiPerDocument(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnitCostRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        input_tokens: bigint | null;
        output_tokens: bigint | null;
        cached_tokens: bigint | null;
        model: string | null;
        mode: string | null;
        doc_count: bigint | null;
      }>
    >`
      SELECT e.input_tokens, e.output_tokens, e.cached_tokens, e.model,
             e.mode,
             (
               SELECT COUNT(DISTINCT eid.document_id)
               FROM collection_extraction_input_documents eid
               JOIN collection_extraction_inputs ei
                 ON ei.input_id = eid.input_id
               WHERE ei.extraction_run_id = (j.resume_context ->> 'extractionRunId')::uuid
             ) AS doc_count
      FROM api_usage_ledger e
      JOIN llm_batch_jobs j ON j.job_id::text = e.run_key
      WHERE e.service = 'gemini'
        AND e.caller = 'gemini-batch.collection_extraction'
        AND e.created_at >= ${windowStart}
        AND e.created_at < ${windowEnd}
        AND j.resume_context ->> 'extractionRunId' IS NOT NULL
    `;

    let totalCostMicros = 0;
    let totalDocs = 0;
    let unjoinedCostMicros = 0;
    for (const row of rows) {
      const costMicros = geminiCostMicros({
        model: row.model ?? undefined,
        mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
        inputTokens: row.input_tokens === null ? 0 : Number(row.input_tokens),
        outputTokens:
          row.output_tokens === null ? 0 : Number(row.output_tokens),
        cachedTokens:
          row.cached_tokens === null ? 0 : Number(row.cached_tokens),
      });
      const docCount = row.doc_count === null ? 0 : Number(row.doc_count);
      if (docCount > 0) {
        totalCostMicros += costMicros;
        totalDocs += docCount;
      } else {
        // Batch completed but the extraction run's document join produced
        // zero rows (e.g. all-drop chunk) — spend never vanishes.
        unjoinedCostMicros += costMicros;
      }
    }

    const out: UnitCostRow[] = [];
    if (totalDocs >= MIN_SAMPLE_UNITS) {
      out.push({
        workClass: 'gemini.reddit_extraction',
        unit: 'document',
        microUsdPerUnit: totalCostMicros / totalDocs,
        sampleUnits: totalDocs,
        windowStart,
        windowEnd,
      });
    } else {
      // Sample too thin to publish a rate yet — the whole window's cost
      // still needs a home so it doesn't disappear from the ledger's story.
      unjoinedCostMicros += totalCostMicros;
    }

    // Everything else on the gemini service (interactive relevance-gate
    // judging, embeddings, any caller without a resolvable run_key, plus
    // the thin-sample carry-forward above) is real spend with no per-unit
    // join today — surfaced, never dropped.
    const unattributed = await this.unattributedGeminiMicros(
      windowStart,
      windowEnd,
    );
    const totalUnattributed = unjoinedCostMicros + unattributed.costMicros;
    if (totalUnattributed > 0 || unattributed.eventCount > 0) {
      out.push({
        workClass: 'unattributed.gemini',
        unit: 'event',
        microUsdPerUnit:
          unattributed.eventCount > 0
            ? totalUnattributed / unattributed.eventCount
            : totalUnattributed,
        sampleUnits: unattributed.eventCount,
        windowStart,
        windowEnd,
      });
    }
    return out;
  }

  private async unattributedGeminiMicros(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{ costMicros: number; eventCount: number }> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: {
        service: 'gemini',
        createdAt: { gte: windowStart, lt: windowEnd },
        NOT: { caller: 'gemini-batch.collection_extraction' },
      },
      select: {
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        model: true,
        mode: true,
      },
    });
    let costMicros = 0;
    for (const row of rows) {
      costMicros += geminiCostMicros({
        model: row.model ?? undefined,
        mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cachedTokens: row.cachedTokens ?? 0,
      });
    }
    return { costMicros, eventCount: rows.length };
  }

  /**
   * §24.2 (b)/(c) tomtom-per-draw and places-per-call: no vendor $-per-call
   * price table exists in this repo yet (unlike gemini's gemini-pricing.ts
   * K4 table) — inventing one here would violate the §16 no-fake-estimates
   * law (a number may only be a FACT, an owner choice, or a derivation; a
   * guessed vendor rate is none of those). Until a K4 price table for these
   * vendors lands, their spend is honestly surfaced as
   * 'unattributed.<service>' — request-COUNTED (sampleUnits = request
   * count), priced at 0 micro-USD/unit rather than a fabricated rate. Spend
   * never vanishes; it just isn't priced yet.
   */
  private async refreshUnattributed(
    service: 'tomtom' | 'google_places',
    unit: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnitCostRow[]> {
    const agg = await this.prisma.apiUsageEvent.aggregate({
      where: { service, createdAt: { gte: windowStart, lt: windowEnd } },
      _sum: { requestCount: true },
      _count: { _all: true },
    });
    const sampleUnits = agg._sum.requestCount ?? 0;
    if (sampleUnits === 0 && agg._count._all === 0) {
      return [];
    }
    return [
      {
        workClass: `unattributed.${service}`,
        unit,
        microUsdPerUnit: 0,
        sampleUnits,
        windowStart,
        windowEnd,
      },
    ];
  }

  /**
   * Leg B wiring point: for every reddit source with joinable extraction
   * spend in the window (gemini-batch.collection_extraction, joined via
   * run_key -> extraction run -> document -> community = source.handle),
   * feed the window's total attributed cost into that source's 'keyword'
   * lane cost baseline via CollectorSourceRegistryService.recordLaneCost —
   * the same EWMA + breach primitive Leg B specifies, ticked nightly
   * (see refreshUnitCosts's doc comment for why "nightly" is this
   * architecture's honest analogue of "per tick" for LLM spend).
   */
  private async attributeLaneCosts(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        input_tokens: bigint | null;
        output_tokens: bigint | null;
        cached_tokens: bigint | null;
        model: string | null;
        mode: string | null;
      }>
    >`
      SELECT s.source_id, e.input_tokens, e.output_tokens, e.cached_tokens,
             e.model, e.mode
      FROM api_usage_ledger e
      JOIN llm_batch_jobs j ON j.job_id::text = e.run_key
      JOIN collection_extraction_inputs ei
        ON ei.extraction_run_id = (j.resume_context ->> 'extractionRunId')::uuid
      JOIN collection_extraction_input_documents eid ON eid.input_id = ei.input_id
      JOIN collection_source_documents d ON d.document_id = eid.document_id
      JOIN sources s ON s.platform = 'reddit' AND lower(s.handle) = lower(d.community)
      WHERE e.service = 'gemini'
        AND e.caller = 'gemini-batch.collection_extraction'
        AND e.created_at >= ${windowStart}
        AND e.created_at < ${windowEnd}
        AND j.resume_context ->> 'extractionRunId' IS NOT NULL
    `;

    const bySource = new Map<string, number>();
    for (const row of rows) {
      const costMicros = geminiCostMicros({
        model: row.model ?? undefined,
        mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
        inputTokens: row.input_tokens === null ? 0 : Number(row.input_tokens),
        outputTokens:
          row.output_tokens === null ? 0 : Number(row.output_tokens),
        cachedTokens:
          row.cached_tokens === null ? 0 : Number(row.cached_tokens),
      });
      bySource.set(
        row.source_id,
        (bySource.get(row.source_id) ?? 0) + costMicros,
      );
    }

    for (const [sourceId, costMicros] of bySource) {
      await this.registry
        .recordLaneCost(sourceId, 'keyword', Math.round(costMicros))
        .catch((error: unknown) => {
          this.logger.warn('Lane cost attribution write failed', {
            sourceId,
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        });
    }
  }

  /** Total ACTUAL gemini spend (micro-USD, K4 rates) over [start, end) — the
   *  same currency the gemini.monthlySpend pool meters, computed straight
   *  from the ledger so the backstop/telemetry never depend on the unit-cost
   *  join succeeding. */
  private async totalGeminiSpendMicros(
    start: Date,
    end: Date,
  ): Promise<number> {
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
      total += geminiCostMicros({
        model: row.model ?? undefined,
        mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cachedTokens: row.cachedTokens ?? 0,
      });
    }
    return total;
  }

  /**
   * §24.4 item 4 / §24.1 Tier 3: re-derive the gemini.monthlySpend
   * catastrophe backstop from trailing-30d MEASURED spend and publish it as
   * a visible spend_unit_costs row (work_class='backstop.gemini',
   * unit='month', sample_units=30 — the window length in days, standing in
   * for the measured sample size per §24.2's row shape). If a live
   * GovernanceService is present in this process, also apply it immediately
   * via PoolRegistry.resetLimit (logging old -> new); otherwise the row
   * alone is enough — governance.service.ts's own boot reads it next
   * restart. §16: BACKSTOP_MULTIPLE is the only owner number here; the
   * trailing spend it multiplies is 100% measured.
   *
   * RED-TEAM FIX 2026-07-24 (§24 red team finding 3 — "the backstop must not
   * chase a runaway"): the trailing baseline is the MEDIAN of the last 30
   * daily spend totals × 30, not their mean/sum — a median resists up to
   * ~15 runaway days skewing the base (a mean would already have "learned"
   * the runaway as normal by the time it derives). Growth is additionally
   * CLAMPED: newLimit = min(derived, previousLimit × BACKSTOP_MULTIPLE) —
   * the backstop may grow at most ×3 (the SAME K1 that prices the multiple
   * itself) per night, so a sustained runaway raises the backstop
   * geometrically SLOWER than it raises spend, and the §24.1 promise ("a bug
   * costs at most two extra months") degrades gracefully instead of
   * silently tracking the runaway upward. Shrinking is unclamped — safety
   * tightens freely, only growth is bounded.
   */
  private async refreshBackstop(
    windowStart: Date,
    windowEnd: Date,
    now: Date,
  ): Promise<void> {
    const dailyTotals: number[] = [];
    for (let i = 0; i < UNIT_COST_WINDOW_DAYS; i++) {
      const start = new Date(windowStart.getTime() + i * MS_PER_DAY);
      const end = new Date(start.getTime() + MS_PER_DAY);
      dailyTotals.push(await this.totalGeminiSpendMicros(start, end));
    }
    const medianDailyMicros = median(dailyTotals);
    const trailingSpendMicros = medianDailyMicros * UNIT_COST_WINDOW_DAYS;
    const derivedLimitMicros = Math.round(
      trailingSpendMicros * BACKSTOP_MULTIPLE,
    );
    if (derivedLimitMicros <= 0) {
      // No measured spend yet in the trailing window — nothing to derive;
      // the env-seeded boot value stands (§24.4 item 4).
      return;
    }
    const priorRow = await this.prisma.spendUnitCost.findUnique({
      where: {
        workClass_unit: {
          workClass: GEMINI_BACKSTOP_WORK_CLASS,
          unit: 'month',
        },
      },
    });
    const previousLimitMicros =
      priorRow !== null ? Math.round(priorRow.microUsdPerUnit) : null;
    const clampedLimitMicros =
      previousLimitMicros !== null
        ? Math.min(derivedLimitMicros, previousLimitMicros * BACKSTOP_MULTIPLE)
        : derivedLimitMicros;
    await this.prisma.spendUnitCost.upsert({
      where: {
        workClass_unit: {
          workClass: GEMINI_BACKSTOP_WORK_CLASS,
          unit: 'month',
        },
      },
      create: {
        workClass: GEMINI_BACKSTOP_WORK_CLASS,
        unit: 'month',
        microUsdPerUnit: clampedLimitMicros,
        sampleUnits: UNIT_COST_WINDOW_DAYS,
        windowStart,
        windowEnd,
      },
      update: {
        microUsdPerUnit: clampedLimitMicros,
        sampleUnits: UNIT_COST_WINDOW_DAYS,
        windowStart,
        windowEnd,
        refreshedAt: now,
      },
    });
    if (this.governance) {
      try {
        const before = this.governance.pools.poolStatus(
          'gemini.monthlySpend',
        ).limit;
        if (before !== clampedLimitMicros) {
          this.governance.pools.resetLimit(
            'gemini.monthlySpend',
            clampedLimitMicros,
          );
          this.logger.info(
            'gemini.monthlySpend backstop re-derived (live process)',
            {
              beforeUsd: Math.round(before / 10_000) / 100,
              afterUsd: Math.round(clampedLimitMicros / 10_000) / 100,
              derivedUsd: Math.round(derivedLimitMicros / 10_000) / 100,
              trailingSpendMedianBasisUsd:
                Math.round(trailingSpendMicros / 10_000) / 100,
              backstopMultiple: BACKSTOP_MULTIPLE,
              growthClamped: clampedLimitMicros < derivedLimitMicros,
            },
          );
        }
      } catch (error) {
        this.logger.warn(
          'Live backstop resetLimit failed (row still written)',
          {
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          },
        );
      }
    }
  }

  /**
   * §24.4 item 6 replacement for the removed 80%-of-cap warn: info-log
   * month-to-date gemini spend vs. the trailing-baseline expectation
   * prorated to the day of month, and WARN (not error — this is telemetry,
   * not a gate) when it exceeds prorated-mean + SPEND_TELEMETRY_WARN_K ×
   * stddev × sqrt(days-elapsed). Mean/stddev come from the last 30 daily
   * spend totals (a real distribution, never invented). Never gates
   * anything — Tier 1/2/3 already do that; this is purely visibility into
   * "is this month tracking normal" (percent of PROJECTION, not percent of
   * a dollar cap, per §24.4 item 6).
   */
  private async logSpendTelemetry(now: Date): Promise<void> {
    const dayStarts: Date[] = [];
    for (let i = UNIT_COST_WINDOW_DAYS; i >= 1; i--) {
      dayStarts.push(new Date(now.getTime() - i * MS_PER_DAY));
    }
    const dailyTotals: number[] = [];
    for (let i = 0; i < dayStarts.length; i++) {
      const start = dayStarts[i];
      const end = new Date(start.getTime() + MS_PER_DAY);
      dailyTotals.push(await this.totalGeminiSpendMicros(start, end));
    }
    const n = dailyTotals.length;
    if (n === 0) {
      return;
    }
    const mean = dailyTotals.reduce((a, b) => a + b, 0) / n;
    const variance = dailyTotals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);

    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const dayOfMonth = Math.max(
      1,
      Math.floor((now.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1,
    );
    const monthToDateMicros = await this.totalGeminiSpendMicros(
      monthStart,
      now,
    );
    const proratedExpectationMicros = mean * dayOfMonth;
    const warnThresholdMicros =
      proratedExpectationMicros +
      SPEND_TELEMETRY_WARN_K * stddev * Math.sqrt(dayOfMonth);

    const logFields = {
      monthToDateUsd: Math.round(monthToDateMicros / 10_000) / 100,
      proratedExpectationUsd:
        Math.round(proratedExpectationMicros / 10_000) / 100,
      dailyMeanUsd: Math.round(mean / 10_000) / 100,
      dailyStddevUsd: Math.round(stddev / 10_000) / 100,
      dayOfMonth,
      percentOfProjection:
        proratedExpectationMicros > 0
          ? Math.round((monthToDateMicros / proratedExpectationMicros) * 1000) /
            10
          : null,
    };

    if (
      monthToDateMicros > warnThresholdMicros &&
      proratedExpectationMicros > 0
    ) {
      this.logger.warn(
        'Gemini spend telemetry: month-to-date is running hot vs. the trailing measured baseline (informational — no gate)',
        logFields,
      );
    } else {
      this.logger.info('Gemini spend telemetry', logFields);
    }
  }
}
