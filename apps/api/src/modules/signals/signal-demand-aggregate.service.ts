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
 *   re-insert it from the ledger in one transaction.
 * - WHICH days rebuild is watermark-driven (red-team 1b): signals carry
 *   recorded_at (when the ledger learned of the act) beside occurred_at (when
 *   it happened). Each cron pass rebuilds every day that has ledger rows
 *   recorded since the last watermark. INVARIANT: any signal, whenever
 *   recorded — offline queue flush, collector backfill, cross-day retry —
 *   lands in its occurred-at day slice within one cron pass.
 * - Attribution is the §3 containment-TILING storage law (red-team 3a): each
 *   signal geo attributes to (i) the SMALLEST place CONTAINING it and (ii)
 *   the COARSEST catalog level(s) TILING the places contained in it (US-wide
 *   bbox → one US row; Texas bbox → one TX row; metro bbox → its towns).
 *   Containment, never intersection — storage is O(few) rows per signal; the
 *   "every place in view at weight 1" semantics is supplied at READ time by
 *   inheritance (own rows + descendants' rows + each distinct ancestor row
 *   once — SignalDemandReadService). Longitude is wrap-aware (min_lng >
 *   max_lng crosses the antimeridian): crossing geos split into two segments
 *   for the indexed containment probes; crossing PLACES (none in the current
 *   catalog) take explicit non-indexed branches over that tiny set.
 *   Additionally every signal lands EXACTLY ONCE on the GLOBAL tile
 *   (place_id NULL) so unscoped readers never see attribution fan-out.
 * - Redirects are applied AT READ (the aggregate stores raw subjectIds;
 *   history stays immutable under identity merges).
 * - Retry dedupe is WINDOW-wide, geo-free, and PER-KIND (red-team 1c +
 *   wave-5 F1): the FIRST occurrence of a (kind, client idempotency id)
 *   pair (meta.searchRequestId / meta.cacheRevealRequestId) wins — its day,
 *   its geo, its act weight. Later rows with the same (kind, id) (nudged-
 *   viewport retries, cross-midnight retries) never count: within a day the
 *   first row is picked by window function; across days an indexed anti-join
 *   excludes (kind, id) pairs first seen on an earlier day. The KIND is part
 *   of the act's identity by design: 'search' and 'autocomplete_selection'
 *   deliberately SHARE meta.searchRequestId (one submit = two distinct acts
 *   — search.service recordSearchSignals), so a kind-blind key would drop
 *   one act of every selected search. Backfilled legacy rows carry
 *   meta.eventCount (the old tables' pre-dedup counters); it weighs into
 *   signalCount.
 * - TIME ZONE LAW (red-team 1a): signals.occurred_at is a NAIVE-UTC
 *   timestamp; signal_demand_daily.last_occurred_at is timestamptz. Every
 *   rebuild transaction runs under SET LOCAL TIME ZONE 'UTC' so the coercion
 *   reads the wall-clock as the UTC instant it is. SET LOCAL (vs AT TIME
 *   ZONE 'UTC' per expression) fixes EVERY naive↔aware coercion in the
 *   statement at once, and — UTC having no DST — makes rebuild output
 *   byte-identical (stable checksums) no matter when or in which server
 *   timezone the rebuild runs.
 */

/** SQL: the per-signal act-dedupe key (§3 judge-at-read). Always paired with
 *  s.kind — an act's identity is (kind, request-id): 'search' and
 *  'autocomplete_selection' share meta.searchRequestId on purpose (wave-5
 *  F1) and must both survive dedupe. */
const DEDUPE_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.signal_id::text)`;

/** SQL: per-row act weight (backfilled legacy rows carry meta.eventCount). */
const EVENT_COUNT_SQL = Prisma.sql`GREATEST(1, COALESCE((s.meta->>'eventCount')::int, 1))`;

/** SQL: float8 envelope over a places-catalog bbox — matches the partial
 *  expression GiST index Place_bbox_envelope_gist_idx VERBATIM (red-team 3b);
 *  only non-crossing places are indexed, so every indexed branch restates the
 *  index predicate (bbox present, min_lng <= max_lng). */
const PLACE_ENVELOPE_SQL = Prisma.sql`ST_MakeEnvelope(p.bbox_min_lng::float8, p.bbox_min_lat::float8, p.bbox_max_lng::float8, p.bbox_max_lat::float8, 4326)`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Watermark safety lag: a signal INSERT evaluates recorded_at (now()) at
 *  statement time but becomes visible at commit; advancing the watermark a
 *  minute behind the clock guarantees no committed-late row is skipped.
 *  Overlap is free — day rebuilds are idempotent. */
const WATERMARK_LAG_SECONDS = 60;

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

  /**
   * Watermark-driven refresh (red-team 1b): rebuild every UTC day that has
   * ledger rows RECORDED since the last pass — not a fixed trailing window,
   * so late-arriving occurredAt values (offline queues, backfills) always
   * reach their own day slice. A NULL watermark (first pass ever) rebuilds
   * every day the ledger touches, exactly once.
   */
  @Cron('*/15 * * * *')
  async refreshFromWatermark(): Promise<void> {
    if (process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED === 'false') {
      return;
    }
    if (this.refreshInFlight) {
      this.logger.warn('Signal demand aggregate refresh already running');
      return;
    }
    this.refreshInFlight = true;
    try {
      const [cursor] = await this.prisma.$queryRaw<
        { watermark: Date | null; next_watermark: Date }[]
      >`
        SELECT
          (SELECT watermark FROM signal_demand_rebuild_state WHERE id = 1)
            AS watermark,
          now() - make_interval(secs => ${WATERMARK_LAG_SECONDS})
            AS next_watermark
      `;
      const watermark = cursor?.watermark ?? null;
      // Bind the watermark as an EXPLICIT-offset string: a bare Date binds as
      // a naive timestamp and would be re-read in the session time zone.
      const watermarkFilter = watermark
        ? Prisma.sql`WHERE s.recorded_at > ${watermark.toISOString()}::timestamptz`
        : Prisma.empty;
      // occurred_at is naive UTC; ::date is its UTC day in any session zone.
      const dayRows = await this.prisma.$queryRaw<{ day: string }[]>`
        SELECT DISTINCT (s.occurred_at::date)::text AS day
        FROM signals s
        ${watermarkFilter}
        ORDER BY day
      `;
      for (const row of dayRows) {
        await this.rebuildDay(new Date(`${row.day}T00:00:00.000Z`));
      }
      // GREATEST keeps the watermark monotone under concurrent passes: a
      // slower pass finishing later can only move it forward, never back.
      const nextWatermark = (
        cursor?.next_watermark ??
        new Date(Date.now() - WATERMARK_LAG_SECONDS * 1000)
      ).toISOString();
      await this.prisma.$executeRaw`
        INSERT INTO signal_demand_rebuild_state (id, watermark, updated_at)
        VALUES (1, ${nextWatermark}::timestamptz, now())
        ON CONFLICT (id) DO UPDATE
          SET watermark = GREATEST(
                signal_demand_rebuild_state.watermark,
                EXCLUDED.watermark
              ),
              updated_at = now()
      `;
      if (dayRows.length) {
        this.logger.info('Watermark refresh rebuilt day slices', {
          days: dayRows.map((row) => row.day),
        });
      }
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
        // Red-team 1a: naive-UTC occurred_at → timestamptz last_occurred_at
        // must coerce AS UTC, in every server/session time zone, DST-free.
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('signal_demand_aggregate'), hashtext(${dayKey}))
      `;
        const deletedRows = await tx.$executeRaw`
        DELETE FROM signal_demand_daily WHERE day = ${dayKey}::date
      `;
        // One statement, two tilings of the same day-slice of the ledger:
        //  - the GLOBAL tile (place_id NULL): every act exactly once;
        //  - place tiles: §3 containment-tiling (smallest containing place +
        //    coarsest contained tiling), O(few) rows per distinct geo.
        // Geo attribution is computed once per DISTINCT geo (zero-area
        // restaurant points and repeated viewports collapse), then joined
        // back to the deduped day acts.
        const insertedRows = await tx.$executeRaw`
        WITH day_first AS (
          SELECT
            s.actor_id, s.kind, s.subject_type, s.subject_id, s.subject_text,
            s.geo_min_lat, s.geo_min_lng, s.geo_max_lat, s.geo_max_lng,
            s.occurred_at,
            ${EVENT_COUNT_SQL} AS acts,
            COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId') AS request_id,
            ROW_NUMBER() OVER (
              PARTITION BY s.kind, ${DEDUPE_KEY_SQL}
              ORDER BY s.occurred_at ASC, s.signal_id ASC
            ) AS rn
          FROM signals s
          WHERE s.occurred_at >= ${dayKey}::date
            AND s.occurred_at < ${nextDayKey}::date
        ),
        day_signals AS (
          -- Red-team 1c + wave-5 F1: retry dedupe is window-wide, geo-free,
          -- and PER-KIND — the FIRST occurrence of a (kind, request-id) pair
          -- wins (rn = 1 within the day; the anti-join, one probe on
          -- Signal_dedupeRequestId_occurredAt_idx, excludes pairs first seen
          -- on an EARLIER day). Kind-blind matching would collapse the
          -- search + autocomplete_selection acts of one submit.
          SELECT d.*
          FROM day_first d
          WHERE d.rn = 1
            AND (
              d.request_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM signals p
                WHERE (p.meta->>'searchRequestId' IS NOT NULL
                       OR p.meta->>'cacheRevealRequestId' IS NOT NULL)
                  AND COALESCE(p.meta->>'searchRequestId', p.meta->>'cacheRevealRequestId') = d.request_id
                  AND p.kind = d.kind
                  AND p.occurred_at < ${dayKey}::date
              )
            )
        ),
        geos AS (
          SELECT DISTINCT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng
          FROM day_signals
        ),
        crossing_places AS MATERIALIZED (
          -- Antimeridian-crossing catalog rows (bbox_min_lng > bbox_max_lng):
          -- excluded from the GiST envelope index, handled by explicit
          -- branches. Materialized ONCE — a tiny set (currently the US row).
          SELECT place_id, parent_place_ids,
                 bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
          FROM places
          WHERE bbox_min_lat IS NOT NULL AND bbox_min_lng > bbox_max_lng
        ),
        segments AS (
          -- Wrap-normalize: an antimeridian-crossing geo (min_lng > max_lng)
          -- covers [min_lng, 180] ∪ [-180, max_lng]; split it so the indexed
          -- envelope probes only ever see non-crossing intervals.
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
                 geo_min_lng AS seg_min_lng, geo_max_lng AS seg_max_lng
          FROM geos WHERE geo_min_lng <= geo_max_lng
          UNION ALL
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
                 geo_min_lng, 180::numeric
          FROM geos WHERE geo_min_lng > geo_max_lng
          UNION ALL
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
                 (-180)::numeric, geo_max_lng
          FROM geos WHERE geo_min_lng > geo_max_lng
        ),
        containing AS (
          -- §3 (i): the SMALLEST place whose bbox CONTAINS the whole geo —
          -- at most ONE row per geo (read-time inheritance walks the
          -- ancestor chain; storing the chain would double-count).
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng, place_id
          FROM (
            SELECT x.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng
                     ORDER BY area ASC, place_id ASC
                   ) AS pick
            FROM (
              -- Indexed fast path: non-crossing geo × non-crossing place.
              SELECT g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng,
                     p.place_id,
                     ((p.bbox_max_lat - p.bbox_min_lat)
                       * (p.bbox_max_lng - p.bbox_min_lng))::float8 AS area
              FROM geos g
              JOIN places p
                ON p.bbox_min_lat IS NOT NULL
               AND p.bbox_min_lng <= p.bbox_max_lng
               AND ${PLACE_ENVELOPE_SQL}
                   ~ ST_MakeEnvelope(g.geo_min_lng::float8, g.geo_min_lat::float8,
                                     g.geo_max_lng::float8, g.geo_max_lat::float8, 4326)
              WHERE g.geo_min_lng <= g.geo_max_lng
              UNION ALL
              -- Crossing places (materialized tiny set): wrap-aware
              -- containment — a non-crossing geo fits one arm; a crossing
              -- geo needs both its arms covered.
              SELECT g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng,
                     p.place_id,
                     ((p.bbox_max_lat - p.bbox_min_lat)
                       * (360 - (p.bbox_min_lng - p.bbox_max_lng)))::float8 AS area
              FROM geos g
              JOIN crossing_places p
                ON p.bbox_min_lat <= g.geo_min_lat
               AND p.bbox_max_lat >= g.geo_max_lat
               AND CASE
                     WHEN g.geo_min_lng <= g.geo_max_lng
                       THEN g.geo_min_lng >= p.bbox_min_lng OR g.geo_max_lng <= p.bbox_max_lng
                     ELSE p.bbox_min_lng <= g.geo_min_lng AND g.geo_max_lng <= p.bbox_max_lng
                   END
            ) x
          ) ranked
          WHERE pick = 1
        ),
        contained AS (
          -- §3 (ii) step 1: every place whose bbox is CONTAINED in the geo.
          SELECT DISTINCT sg.geo_min_lat, sg.geo_min_lng, sg.geo_max_lat, sg.geo_max_lng,
                 p.place_id, p.parent_place_ids
          FROM segments sg
          JOIN places p
            ON p.bbox_min_lat IS NOT NULL
           AND p.bbox_min_lng <= p.bbox_max_lng
           AND ${PLACE_ENVELOPE_SQL}
               @ ST_MakeEnvelope(sg.seg_min_lng::float8, sg.geo_min_lat::float8,
                                 sg.seg_max_lng::float8, sg.geo_max_lat::float8, 4326)
          UNION
          -- Crossing place inside a crossing geo: both arms nested.
          SELECT g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng,
                 p.place_id, p.parent_place_ids
          FROM geos g
          JOIN crossing_places p
            ON g.geo_min_lng > g.geo_max_lng
           AND p.bbox_min_lat >= g.geo_min_lat
           AND p.bbox_max_lat <= g.geo_max_lat
           AND p.bbox_min_lng >= g.geo_min_lng
           AND p.bbox_max_lng <= g.geo_max_lng
        ),
        tiling AS (
          -- §3 (ii) step 2: keep only the COARSEST contained places — drop
          -- any place whose direct DAG parent is itself contained (US-wide
          -- geo → the US row survives; its states and towns fold away).
          -- Domination recomputes parent containment against places by PK
          -- (per-row unnest + index probe) — NEVER a contained×contained
          -- self-join, which the planner turns into an O(N²) merge on the
          -- low-cardinality geo columns (the 3b timeout, proven live).
          SELECT c.geo_min_lat, c.geo_min_lng, c.geo_max_lat, c.geo_max_lng, c.place_id
          FROM contained c
          WHERE NOT EXISTS (
            SELECT 1
            FROM unnest(c.parent_place_ids) AS parent(place_id)
            JOIN places pp ON pp.place_id = parent.place_id
            WHERE pp.bbox_min_lat IS NOT NULL
              AND pp.bbox_min_lat >= c.geo_min_lat
              AND pp.bbox_max_lat <= c.geo_max_lat
              AND CASE
                    -- parent and geo both non-crossing
                    WHEN c.geo_min_lng <= c.geo_max_lng AND pp.bbox_min_lng <= pp.bbox_max_lng
                      THEN pp.bbox_min_lng >= c.geo_min_lng AND pp.bbox_max_lng <= c.geo_max_lng
                    -- crossing geo, non-crossing parent: parent in one arm
                    WHEN c.geo_min_lng > c.geo_max_lng AND pp.bbox_min_lng <= pp.bbox_max_lng
                      THEN pp.bbox_min_lng >= c.geo_min_lng OR pp.bbox_max_lng <= c.geo_max_lng
                    -- both crossing: arms nested
                    WHEN c.geo_min_lng > c.geo_max_lng AND pp.bbox_min_lng > pp.bbox_max_lng
                      THEN pp.bbox_min_lng >= c.geo_min_lng AND pp.bbox_max_lng <= c.geo_max_lng
                    -- crossing parent can't fit a non-crossing geo
                    ELSE FALSE
                  END
          )
        ),
        attributed AS (
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng, place_id
          FROM containing
          UNION
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng, place_id
          FROM tiling
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
          ${dayKey}::date, a.place_id, d.actor_id, d.kind, d.subject_type,
          d.subject_id, d.subject_text,
          SUM(d.acts)::int, MAX(d.occurred_at)
        FROM day_signals d
        JOIN attributed a
          ON a.geo_min_lat = d.geo_min_lat AND a.geo_min_lng = d.geo_min_lng
         AND a.geo_max_lat = d.geo_max_lat AND a.geo_max_lng = d.geo_max_lng
        GROUP BY a.place_id, d.actor_id, d.kind, d.subject_type, d.subject_id, d.subject_text
      `;
        return { deletedRows, insertedRows };
      },
      // A day rebuild probes the places GiST index per distinct geo; real
      // headroom for backfill-sized days.
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
