import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * §3 signals aggregate (§22 item 6): day × actor × place × subject × kind — a
 * DERIVED read model over the append-only signals ledger.
 *
 * Laws (master plan §3):
 * - The LEDGER is the source of truth; every aggregate row is re-derivable
 *   from it. The rebuild unit is a WHOLE UTC DAY: delete the day slice,
 *   re-insert it from the ledger in one transaction. "Incremental" IS
 *   "rebuild recent days" — a closed day's slice never changes again
 *   (append-only ledger), so incremental maintenance and a from-scratch
 *   rebuild produce identical rows by construction.
 * - Attribution is weight-1 to every place whose bbox INTERSECTS the signal
 *   geo (§22 item 4 wording), wrap-aware in longitude (min_lng > max_lng
 *   crosses the antimeridian — the canonical predicate is
 *   lngIntervalsIntersect in polls/supply/demand-mass.reader.ts; the SQL here
 *   implements exactly it). Additionally every signal lands EXACTLY ONCE on
 *   the GLOBAL tile (place_id NULL) so unscoped readers never multiply a
 *   signal by its attribution fan-out.
 * - Redirects are applied AT READ (the aggregate stores raw subjectIds;
 *   history stays immutable under identity merges).
 * - Retry dedupe is judged at read (§3): client-suppliable idempotency ids
 *   (meta.searchRequestId / meta.cacheRevealRequestId) collapse duplicate
 *   rows WITHIN a day at rebuild time — signalCount counts distinct acts,
 *   not distinct rows. Backfilled legacy events carry meta.eventCount (the
 *   old tables' pre-dedup counters); it weighs into signalCount.
 */

/** SQL: the per-signal act-dedupe key (§3 judge-at-read). */
const DEDUPE_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.signal_id::text)`;

/** SQL: per-row act weight (backfilled legacy rows carry meta.eventCount). */
const EVENT_COUNT_SQL = Prisma.sql`GREATEST(1, COALESCE((s.meta->>'eventCount')::int, 1))`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Cron refresh window: today + yesterday (late writes near the UTC day
 *  boundary land in yesterday's slice; older days are closed by the
 *  append-at-now ledger write path). */
const REFRESH_TRAILING_DAYS = 2;

export interface SignalDemandRebuildResult {
  startDay: string;
  endDayExclusive: string;
  deletedRows: number;
  insertedRows: number;
}

@Injectable()
export class SignalDemandAggregateService {
  private readonly logger: LoggerService;
  private refreshInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SignalDemandAggregateService');
  }

  @Cron('*/15 * * * *')
  async refreshRecentDays(): Promise<void> {
    if (process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED === 'false') {
      return;
    }
    if (this.refreshInFlight) {
      this.logger.warn('Signal demand aggregate refresh already running');
      return;
    }
    this.refreshInFlight = true;
    try {
      const endExclusive = this.startOfUtcDay(
        new Date(Date.now() + MS_PER_DAY),
      );
      const start = new Date(
        endExclusive.getTime() - REFRESH_TRAILING_DAYS * MS_PER_DAY,
      );
      await this.rebuildRange({
        startDay: start,
        endDayExclusive: endExclusive,
      });
    } catch (error) {
      this.logger.error('Failed to refresh signal demand aggregate', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.refreshInFlight = false;
    }
  }

  /**
   * From-scratch rebuild: every day from the ledger's first signal through
   * today. The aggregate is a pure derivation — this is always safe and
   * always converges to the same rows as incremental maintenance.
   */
  async rebuildAll(): Promise<SignalDemandRebuildResult | null> {
    const [row] = await this.prisma.$queryRaw<
      { min_occurred: Date | null }[]
    >`SELECT MIN(occurred_at) AS min_occurred FROM signals`;
    if (!row?.min_occurred) {
      return null;
    }
    const startDay = this.startOfUtcDay(new Date(row.min_occurred));
    const endDayExclusive = this.startOfUtcDay(
      new Date(Date.now() + MS_PER_DAY),
    );
    return this.rebuildRange({ startDay, endDayExclusive });
  }

  /**
   * Rebuild [startDay, endDayExclusive) one UTC day at a time. Each day is a
   * transaction under an advisory lock (idempotent delete-and-reinsert; a
   * concurrent rebuild of the same day serializes).
   */
  async rebuildRange(params: {
    startDay: Date;
    endDayExclusive: Date;
  }): Promise<SignalDemandRebuildResult> {
    const startDay = this.startOfUtcDay(params.startDay);
    const endDayExclusive = this.startOfUtcDay(params.endDayExclusive);
    if (endDayExclusive <= startDay) {
      throw new Error('endDayExclusive must be after startDay');
    }
    let deletedRows = 0;
    let insertedRows = 0;
    for (
      let day = startDay;
      day < endDayExclusive;
      day = new Date(day.getTime() + MS_PER_DAY)
    ) {
      const result = await this.rebuildDay(day);
      deletedRows += result.deletedRows;
      insertedRows += result.insertedRows;
    }
    const summary = {
      startDay: this.formatDay(startDay),
      endDayExclusive: this.formatDay(endDayExclusive),
      deletedRows,
      insertedRows,
    };
    this.logger.info('Rebuilt signal demand aggregate range', summary);
    return summary;
  }

  /** Rebuild one UTC day slice: delete + re-derive from the ledger. */
  async rebuildDay(
    dayInput: Date,
  ): Promise<{ deletedRows: number; insertedRows: number }> {
    const day = this.startOfUtcDay(dayInput);
    const dayKey = this.formatDay(day);
    const nextDayKey = this.formatDay(new Date(day.getTime() + MS_PER_DAY));
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('signal_demand_aggregate'), hashtext(${dayKey}))
      `;
        const deletedRows = await tx.$executeRaw`
        DELETE FROM signal_demand_daily WHERE day = ${dayKey}::date
      `;
        // One statement, two tilings of the same day-slice of the ledger:
        //  - the GLOBAL tile (place_id NULL): every act exactly once;
        //  - place tiles: weight-1 per intersecting place (wrap-aware).
        // acts = per-dedupe-key act weight (client retries collapse; backfilled
        // rows carry their legacy event_count).
        const insertedRows = await tx.$executeRaw`
        WITH day_signals AS (
          SELECT
            s.actor_id,
            s.kind,
            s.subject_type,
            s.subject_id,
            s.subject_text,
            s.geo_min_lat, s.geo_min_lng, s.geo_max_lat, s.geo_max_lng,
            ${DEDUPE_KEY_SQL} AS dedupe_key,
            MAX(${EVENT_COUNT_SQL}) AS acts,
            MAX(s.occurred_at) AS occurred_at
          FROM signals s
          WHERE s.occurred_at >= ${dayKey}::date
            AND s.occurred_at < ${nextDayKey}::date
          GROUP BY
            s.actor_id, s.kind, s.subject_type, s.subject_id, s.subject_text,
            s.geo_min_lat, s.geo_min_lng, s.geo_max_lat, s.geo_max_lng,
            ${DEDUPE_KEY_SQL}
        )
        INSERT INTO signal_demand_daily (
          day, place_id, actor_id, kind, subject_type, subject_id,
          subject_text, signal_count, last_occurred_at
        )
        SELECT
          ${dayKey}::date, NULL, d.actor_id, d.kind, d.subject_type,
          d.subject_id, d.subject_text,
          SUM(d.acts)::int, MAX(d.occurred_at)
        FROM day_signals d
        GROUP BY d.actor_id, d.kind, d.subject_type, d.subject_id, d.subject_text
        UNION ALL
        SELECT
          ${dayKey}::date, p.place_id, d.actor_id, d.kind, d.subject_type,
          d.subject_id, d.subject_text,
          SUM(d.acts)::int, MAX(d.occurred_at)
        FROM day_signals d
        JOIN places p
          ON p.bbox_min_lat IS NOT NULL
         AND d.geo_min_lat <= p.bbox_max_lat
         AND d.geo_max_lat >= p.bbox_min_lat
         AND (
           CASE
             WHEN d.geo_min_lng <= d.geo_max_lng AND p.bbox_min_lng <= p.bbox_max_lng
               THEN d.geo_min_lng <= p.bbox_max_lng AND d.geo_max_lng >= p.bbox_min_lng
             WHEN d.geo_min_lng > d.geo_max_lng AND p.bbox_min_lng > p.bbox_max_lng
               THEN TRUE
             WHEN d.geo_min_lng > d.geo_max_lng
               THEN d.geo_min_lng <= p.bbox_max_lng OR d.geo_max_lng >= p.bbox_min_lng
             ELSE p.bbox_min_lng <= d.geo_max_lng OR p.bbox_max_lng >= d.geo_min_lng
           END
         )
        GROUP BY p.place_id, d.actor_id, d.kind, d.subject_type, d.subject_id, d.subject_text
      `;
        return { deletedRows, insertedRows };
      },
      // A day rebuild joins the full places catalog; give it real headroom.
      { timeout: 120_000 },
    );
  }

  private startOfUtcDay(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Invalid date');
    }
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private formatDay(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
