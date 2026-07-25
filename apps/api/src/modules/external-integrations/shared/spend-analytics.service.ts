import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { pricedGeminiRow } from './gemini-pricing';
import {
  placesCostMicrosPerCall,
  tomtomBlendedCostMicrosPerDraw,
} from './vendor-pricing';
import { CollectorSourceRegistryService } from '../../content-processing/reddit-collector/collector-source-registry.service';
import { GovernanceService } from '../governance/governance.service';
import { OpsAlertsService } from './ops-alerts.service';

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

/**
 * §18.4/§24.3 TomTom credit PROXY (comment discipline, §16): we cannot see
 * the prepaid balance via the TomTom API at all — no endpoint exposes it —
 * so this nightly check is a PROXY signal only: "the scarcePolygons pool
 * used ≥80% of its monthly limit before day 20 of the month" is unusually
 * fast burn, worth an owner glance at the vendor portal balance. Both
 * numbers are §16 K2-SHAPED PRIORS WITH AN EXPLICIT ERASURE NOTE — a stand-
 * in for "burn rate exceeds what the remaining days in the month can
 * absorb at the historical pace," which needs a measured burn-rate model
 * (multiple months of scarcePolygons draw history) that doesn't exist yet.
 * ERASED the moment that measured model lands; until then, 80%-by-day-20
 * (≈2/3 of the days having used ≥4/5 of the budget) stands as a documented
 * placeholder, not a ratified permanent knob. A TRUE balance alert needs
 * the vendor portal (no API) — this is the closest observable proxy today.
 */
const TOMTOM_POOL_HOT_FRACTION = 0.8;
const TOMTOM_POOL_HOT_DAY_OF_MONTH = 20;

/** Median of a numeric array (even-length: mean of the two middle values).
 *  Used by refreshBackstop instead of a mean so a run of ~15 runaway days
 *  cannot single-handedly drag the trailing baseline up with them.
 *  Exported as THE one median: ops-summary re-exports it as `medianOf` for
 *  its expectation math + RED-provable specs. */
export function median(values: number[]): number {
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
    private readonly opsAlerts: OpsAlertsService,
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
    // Constant-rate floor rows FIRST — sample-derived rows below overwrite
    // them (same workClass+unit key, later upsert wins) the moment real
    // ledger history exists; see constantRateFloorRows's doc comment.
    results.push(...this.constantRateFloorRows(windowStart, windowEnd));
    results.push(...(await this.refreshTomtomDraws(windowStart, windowEnd)));
    results.push(...(await this.refreshPlacesCalls(windowStart, windowEnd)));
    results.push(
      ...(await this.refreshPipelineClassRates(windowStart, windowEnd)),
    );

    await this.attributeLaneCosts(windowStart, windowEnd);
    await this.refreshBackstop(windowStart, windowEnd, now);
    await this.logSpendTelemetry(now);
    this.checkTomtomPoolHot(now);
    await this.checkLaneReds(now);

    // Dedupe by (workClass, unit), LAST occurrence wins — a constant-rate
    // floor row pushed before a sample-derived row for the same key must
    // not shadow it in the RETURNED array either (the DB upsert loop below
    // already applies last-wins per key; this keeps the in-memory result
    // the caller sees consistent with what lands in spend_unit_costs).
    const dedupedByKey = new Map<string, UnitCostRow>();
    for (const row of results) {
      dedupedByKey.set(`${row.workClass}\u0000${row.unit}`, row);
    }
    const deduped = [...dedupedByKey.values()];

    for (const row of deduped) {
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
    return deduped;
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
      const costMicros = pricedGeminiRow(row);
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
      costMicros += pricedGeminiRow(row);
    }
    return { costMicros, eventCount: rows.length };
  }

  /**
   * §24.2(b) tomtom-per-draw, now PRICED (vendor-pricing.ts's
   * tomtomBlendedCostMicrosPerDraw, K1-sourced $2.50/1,000 requests — "VERIFY
   * AGAINST FIRST TOMTOM INVOICE"). The ledger does not yet distinguish
   * which pool (cheapGeocode vs scarcePolygons) a tomtom draw belongs to —
   * no recording site threads a pool-specific operation/caller today — so
   * every tomtom request in the window is one work class,
   * 'tomtom.searchFamily' (both draws are Search-family calls at the same
   * rate). sampleUnits = actual request counts; microUsdPerUnit is the
   * PER-REQUEST rate, not derived from spend — if TomTom ever meters
   * differently (e.g. per-draw-type pricing), this table's per-service join
   * is the path to replace it with a real ledger-derived rate.
   */
  private async refreshTomtomDraws(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnitCostRow[]> {
    const agg = await this.prisma.apiUsageEvent.aggregate({
      where: {
        service: 'tomtom',
        createdAt: { gte: windowStart, lt: windowEnd },
      },
      _sum: { requestCount: true },
      _count: { _all: true },
    });
    const sampleUnits = agg._sum.requestCount ?? 0;
    if (sampleUnits === 0 && agg._count._all === 0) {
      return [];
    }
    return [
      {
        workClass: 'tomtom.searchFamily',
        unit: 'draw',
        microUsdPerUnit: tomtomBlendedCostMicrosPerDraw,
        sampleUnits,
        windowStart,
        windowEnd,
      },
    ];
  }

  /**
   * §24.2(c) google_places-per-call, now PRICED per SKU tier
   * (vendor-pricing.ts's placesCostMicrosPerCall — K4 entry-tier rates,
   * fetched 2026-07-25). One work class per SKU actually observed in the
   * window ('google_places.<sku>'), sampleUnits = request counts grouped
   * by sku_tier (classifyPlacesSku's exact output strings). A null/unknown
   * sku_tier groups under 'google_places.unknown', priced at the highest
   * known rate (same over-meter-never-vanish principle as gemini-pricing's
   * unknown model) — spend never vanishes, it just falls into the loudest
   * bucket.
   */
  private async refreshPlacesCalls(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnitCostRow[]> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: {
        service: 'google_places',
        createdAt: { gte: windowStart, lt: windowEnd },
      },
      select: { skuTier: true, requestCount: true },
    });
    const bySku = new Map<string, number>();
    for (const row of rows) {
      const skuLabel = row.skuTier ?? 'unknown';
      bySku.set(skuLabel, (bySku.get(skuLabel) ?? 0) + (row.requestCount ?? 0));
    }
    const out: UnitCostRow[] = [];
    for (const [skuLabel, sampleUnits] of bySku) {
      if (sampleUnits === 0) {
        continue;
      }
      out.push({
        workClass: `google_places.${skuLabel}`,
        unit: 'call',
        microUsdPerUnit: placesCostMicrosPerCall(
          skuLabel === 'unknown' ? null : skuLabel,
        ),
        sampleUnits,
        windowStart,
        windowEnd,
      });
    }
    return out;
  }

  /**
   * §24.2 all-in per-class rates (2026-07-25, owner directive: "everything
   * that costs us money from Google should be known and accounted for").
   * All MEASURED from the ledger over the trailing window — never invented;
   * each rate publishes only when its denominator clears MIN_SAMPLE_UNITS.
   *
   * - gemini.relevance_gate / document: gate spend (caller
   *   'relevance-gate.judgeBatch') ÷ relevance verdicts judged in the
   *   window (one verdict per document gated). Refines automatically as
   *   the Job-1 caller taxonomy accumulates richer tags.
   * - gemini.embedding / document: embedding spend (caller
   *   'embedding.embed') ÷ documents collected in the window.
   * - gemini.interactive_pipeline / document: the honest UMBRELLA rate —
   *   TOTAL non-batch, non-search gemini spend (everything interactive
   *   except the gate, embeddings, and 'query.interpret' user-search
   *   traffic; legacy blur-tagged 'llm.callGeminiApi' rows count here)
   *   ÷ documents collected. Per-class tagged rates refine this split as
   *   tagged data accrues, but the umbrella keeps estimates all-in today.
   * - google_places.enrichment / restaurant: total places spend (SKU-priced
   *   per K4 rate table) ÷ NEW restaurant entities created in the window.
   * - pipeline.entities_per_kilodoc / ratio: measured doc→restaurant-entity
   *   conversion. ENCODING: microUsdPerUnit here is NOT currency — it
   *   stores restaurants-created-per-1000-documents-collected directly
   *   (unit 'ratio' marks the row); estimates use it to turn a doc count
   *   into an expected entity count for the places-enrichment line.
   */
  private async refreshPipelineClassRates(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<UnitCostRow[]> {
    const out: UnitCostRow[] = [];
    const createdWindow = { gte: windowStart, lt: windowEnd };

    const docsCollected = await this.prisma.sourceDocument.count({
      where: { collectedAt: createdWindow },
    });

    // gemini.relevance_gate / document
    const verdictCount = await this.prisma.collectionRelevanceVerdict.count({
      where: { judgedAt: createdWindow },
    });
    if (verdictCount >= MIN_SAMPLE_UNITS) {
      const gateSpend = await this.geminiSpendMicrosForCallers(
        windowStart,
        windowEnd,
        { in: ['relevance-gate.judgeBatch'] },
      );
      out.push({
        workClass: 'gemini.relevance_gate',
        unit: 'document',
        microUsdPerUnit: gateSpend / verdictCount,
        sampleUnits: verdictCount,
        windowStart,
        windowEnd,
      });
    }

    if (docsCollected >= MIN_SAMPLE_UNITS) {
      // gemini.embedding / document
      const embedSpend = await this.geminiSpendMicrosForCallers(
        windowStart,
        windowEnd,
        { in: ['embedding.embed'] },
      );
      out.push({
        workClass: 'gemini.embedding',
        unit: 'document',
        microUsdPerUnit: embedSpend / docsCollected,
        sampleUnits: docsCollected,
        windowStart,
        windowEnd,
      });

      // gemini.interactive_pipeline / document — non-batch, non-search,
      // non-gate, non-embedding umbrella (legacy blur rows included).
      const interactiveSpend = await this.geminiSpendMicrosForCallers(
        windowStart,
        windowEnd,
        {
          notIn: [
            'gemini-batch.collection_extraction',
            'relevance-gate.judgeBatch',
            'embedding.embed',
            'query.interpret',
          ],
        },
        { excludeBatchMode: true },
      );
      out.push({
        workClass: 'gemini.interactive_pipeline',
        unit: 'document',
        microUsdPerUnit: interactiveSpend / docsCollected,
        sampleUnits: docsCollected,
        windowStart,
        windowEnd,
      });
    }

    // google_places.enrichment / restaurant + entities_per_kilodoc
    const newRestaurants = await this.prisma.entity.count({
      where: { type: 'restaurant', createdAt: createdWindow },
    });
    if (newRestaurants >= MIN_SAMPLE_UNITS) {
      const placesRows = await this.prisma.apiUsageEvent.findMany({
        where: { service: 'google_places', createdAt: createdWindow },
        select: { skuTier: true, requestCount: true },
      });
      let placesSpend = 0;
      for (const row of placesRows) {
        placesSpend +=
          placesCostMicrosPerCall(row.skuTier ?? null) *
          (row.requestCount ?? 0);
      }
      out.push({
        workClass: 'google_places.enrichment',
        unit: 'restaurant',
        microUsdPerUnit: placesSpend / newRestaurants,
        sampleUnits: newRestaurants,
        windowStart,
        windowEnd,
      });
    }
    if (docsCollected >= MIN_SAMPLE_UNITS) {
      out.push({
        workClass: 'pipeline.entities_per_kilodoc',
        unit: 'ratio',
        // NOT currency: restaurants created per 1,000 documents collected.
        microUsdPerUnit: (newRestaurants / docsCollected) * 1000,
        sampleUnits: docsCollected,
        windowStart,
        windowEnd,
      });
    }
    return out;
  }

  /** Ledger-priced gemini spend (micro-USD) for a caller filter over
   *  [start, end). `excludeBatchMode` drops mode='batch' rows (used by the
   *  interactive-pipeline umbrella). */
  private async geminiSpendMicrosForCallers(
    start: Date,
    end: Date,
    caller: { in?: string[]; notIn?: string[] },
    opts: { excludeBatchMode?: boolean } = {},
  ): Promise<number> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: {
        service: 'gemini',
        createdAt: { gte: start, lt: end },
        caller,
        ...(opts.excludeBatchMode ? { NOT: { mode: 'batch' } } : {}),
      },
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

  /**
   * §24.3 Leg C wiring gap: prepareEstimate reads spend_unit_costs, but
   * that table is populated by the NIGHTLY refresh above — a work class
   * with zero ledger history (e.g. a first-ever tomtom/places campaign)
   * would have no row to estimate against until tomorrow night, even
   * though the RATE is already known (it's rate-table-priced, not
   * sample-derived). Publish the constant-rate rows immediately whenever
   * refreshUnitCosts runs, with sampleUnits = 0 when no ledger sample
   * exists yet (never invented — 0 documents "no measured sample", not
   * "measured zero-cost"), so a same-day estimate always has a row to
   * read. Sample-derived rows (refreshTomtomDraws/refreshPlacesCalls
   * above) still overwrite these with a REAL sampleUnits the moment ledger
   * history exists — this is a floor, not a competing source of truth.
   */
  private constantRateFloorRows(
    windowStart: Date,
    windowEnd: Date,
  ): UnitCostRow[] {
    return [
      {
        workClass: 'tomtom.searchFamily',
        unit: 'draw',
        microUsdPerUnit: tomtomBlendedCostMicrosPerDraw,
        sampleUnits: 0,
        windowStart,
        windowEnd,
      },
    ];
  }

  /**
   * §24 Task 2 (Leg B wiring point, now CHRONOLOGICAL-AWARE): for every
   * reddit source with joinable extraction spend in the window
   * (gemini-batch.collection_extraction, joined via run_key -> extraction
   * run -> document -> community = source.handle), feed the window's total
   * attributed cost into that source's lane cost baseline via
   * CollectorSourceRegistryService.recordLaneCost — the same EWMA + breach
   * primitive Leg B specifies, ticked nightly (see refreshUnitCosts's doc
   * comment for why "nightly" is this architecture's honest analogue of
   * "per tick" for LLM spend).
   *
   * The lane is now read off the document's own `lane` column (stamped at
   * collection time by collection-evidence.service.ts's
   * persistSourceDocuments — see mapPipelineToLane), grouped
   * (source_id, lane). Only 'chronological' and 'keyword' rows are fed into
   * recordLaneCost — those are the two lanes source_collection_lanes
   * tracks; documents with lane NULL (archive/poll-thread pipelines, or
   * legacy rows collected before this column existed) are SKIPPED for lane
   * attribution (their cost still counts in the per-document unit cost
   * above; it just has no lane to attribute to). Legacy rows self-heal:
   * every future collection tick stamps a real lane, so the skipped share
   * shrinks over time without a backfill migration.
   */
  private async attributeLaneCosts(
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_id: string;
        lane: string;
        input_tokens: bigint | null;
        output_tokens: bigint | null;
        cached_tokens: bigint | null;
        model: string | null;
        mode: string | null;
      }>
    >`
      SELECT s.source_id, d.lane, e.input_tokens, e.output_tokens,
             e.cached_tokens, e.model, e.mode
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
        AND d.lane IN ('chronological', 'keyword')
    `;

    const bySourceLane = new Map<string, number>();
    for (const row of rows) {
      const costMicros = pricedGeminiRow(row);
      const key = `${row.source_id}\u0000${row.lane}`;
      bySourceLane.set(key, (bySourceLane.get(key) ?? 0) + costMicros);
    }

    for (const [key, costMicros] of bySourceLane) {
      const [sourceId, lane] = key.split('\u0000');
      await this.registry
        .recordLaneCost(sourceId, lane, Math.round(costMicros))
        .catch((error: unknown) => {
          this.logger.warn('Lane cost attribution write failed', {
            sourceId,
            lane,
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
      total += pricedGeminiRow(row);
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
      const dayKey = now.toISOString().slice(0, 10);
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'spend_above_expectation',
        title: 'Gemini spend running above the trailing baseline',
        body: `Month-to-date spend is $${logFields.monthToDateUsd} vs. a prorated expectation of $${logFields.proratedExpectationUsd} (day ${dayOfMonth} of month, daily mean $${logFields.dailyMeanUsd} ± $${logFields.dailyStddevUsd}). Informational only — no gate.`,
        dedupeKey: `spend_above_expectation:${dayKey}`,
      });
    } else {
      this.logger.info('Gemini spend telemetry', logFields);
    }
  }

  /**
   * §18.4 TomTom credit PROXY (see TOMTOM_POOL_HOT_FRACTION's doc comment):
   * the tomtom.scarcePolygons pool used ≥80% of its monthly limit before
   * day 20 — unusually early burn, worth checking the vendor portal
   * balance/top-up. No-ops when no live GovernanceService is wired (slim
   * script graphs) since there is no pool to read.
   */
  private checkTomtomPoolHot(now: Date): void {
    if (!this.governance) {
      return;
    }
    const dayOfMonth = now.getUTCDate();
    if (dayOfMonth >= TOMTOM_POOL_HOT_DAY_OF_MONTH) {
      return;
    }
    let status: { used: number; limit: number };
    try {
      status = this.governance.pools.poolStatus('tomtom.scarcePolygons');
    } catch {
      return;
    }
    if (status.limit <= 0) {
      return;
    }
    const usedFraction = status.used / status.limit;
    if (usedFraction < TOMTOM_POOL_HOT_FRACTION) {
      return;
    }
    const monthKey = now.toISOString().slice(0, 7);
    this.logger.warn(
      'TomTom scarcePolygons pool unusually hot for the day of month',
      {
        dayOfMonth,
        used: status.used,
        limit: status.limit,
        usedFraction,
      },
    );
    this.opsAlerts.emit({
      severity: 'warn',
      kind: 'tomtom_pool_hot',
      title: 'TomTom scarcePolygons pool running hot',
      body: `TomTom scarcePolygons used ${Math.round(usedFraction * 1000) / 10}% of its monthly limit (${status.used}/${status.limit}) by day ${dayOfMonth} of the month — check TomTom balance/top-up. (Proxy signal — the vendor API exposes no true prepaid balance.)`,
      dedupeKey: `tomtom_pool_hot:${monthKey}`,
    });
  }

  /**
   * §18.4 lane RED persistence: surface any enabled lane whose heartbeat
   * currently shows RED (output collapsed, a fetched-but-uncommitted
   * window gone stale, or an expected-batches shortfall) so it appears on
   * the ops dashboard without waiting for a human to query
   * collectorHeartbeats by hand. Dedupe per (lane, day) — a persistently
   * RED lane pages once a day, not once per nightly tick's specific cause.
   */
  /**
   * DELIBERATELY NARROWER than the ops-summary dashboard's red predicate
   * (ops-summary.service.ts, the `red` computation in its sources mapping):
   * this ALERT path fires only on durable conditions — output collapse,
   * stale fetched window, expected-batches shortfall. Transient lateness
   * (normalizedLateness) and coverage-gap detection stay dashboard-only:
   * they self-heal on the next run and would spam the owner as alerts.
   */
  private async checkLaneReds(now: Date): Promise<void> {
    let heartbeats: Awaited<
      ReturnType<CollectorSourceRegistryService['collectorHeartbeats']>
    >;
    try {
      heartbeats = await this.registry.collectorHeartbeats(now);
    } catch (error) {
      this.logger.warn('Lane RED check failed to read heartbeats', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    const dayKey = now.toISOString().slice(0, 10);
    for (const beat of heartbeats) {
      const reasons: string[] = [];
      if (beat.outputCollapsed) {
        reasons.push('output collapsed vs. baseline');
      }
      if (beat.pendingWindowStale) {
        reasons.push('fetched window stale with no run committed');
      }
      if (
        beat.expectedBatchesShortfall !== null &&
        beat.expectedBatchesShortfall > 0
      ) {
        reasons.push(
          `expected-batches shortfall ${beat.expectedBatchesShortfall}`,
        );
      }
      if (reasons.length === 0) {
        continue;
      }
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'lane_red',
        title: `Lane RED: ${beat.handle} / ${beat.lane}`,
        body: `Source ${beat.handle} (${beat.sourceId}) lane ${beat.lane} is RED: ${reasons.join('; ')}.`,
        dedupeKey: `lane_red:${beat.sourceId}:${beat.lane}:${dayKey}`,
      });
    }
  }
}
