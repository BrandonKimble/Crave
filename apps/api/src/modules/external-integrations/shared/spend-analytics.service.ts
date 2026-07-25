import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { geminiCostMicros } from './gemini-pricing';
import { CollectorSourceRegistryService } from '../../content-processing/reddit-collector/collector-source-registry.service';

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

@Injectable()
export class SpendAnalyticsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly registry: CollectorSourceRegistryService,
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
      JOIN sources s ON s.platform = 'reddit' AND s.handle = d.community
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
}
