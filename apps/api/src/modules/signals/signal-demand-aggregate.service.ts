import { isEnvFlagExplicitlyDisabled } from '../../shared/config/env-flag';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { geoEnvelopeSql } from './ground-containment';
import { DEDUPE_KEY_SQL, EVENT_COUNT_SQL } from './act-identity';
import { utcDayStart } from './occurred-at';
import { UserTasteProfileBuilder } from './user-taste-profile.builder';

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
 *   lands in its occurred-at day slice within one cron pass. The watermark
 *   is also the GEOMETRY-UPGRADE seam (coherence red-team 2026-07-23): the
 *   promotion drain pulls it back past the oldest signal touching an
 *   upgraded place's ground (places-promotion.service
 *   pullDemandWatermarkBack), so old days re-attribute against the true
 *   polygon on the next pass.
 * - Attribution is the §3 containment-TILING storage law (red-team 3a): each
 *   signal geo attributes to (i) the SMALLEST place CONTAINING it and (ii)
 *   the COARSEST catalog level(s) TILING the places contained in it (US-wide
 *   bbox → one US row; Texas bbox → one TX row; metro bbox → its towns).
 *   Containment, never intersection — storage is O(few) rows per signal; the
 *   "every place in view at weight 1" semantics is supplied at READ time by
 *   inheritance (own rows + descendants' rows + each distinct ancestor row
 *   once — SignalDemandReadService). Containment is judged on THE ONE GROUND
 *   (§2.6 GROUND UNIFICATION: every place's ground lives in
 *   place_geometries.geometry — a sketch-grade row holds its bbox envelope
 *   as a rectangular polygon; §2.5(c): bbox = index/prefilter only): the
 *   `containing` pick requires ST_Covers(ground, geo) and ranks by ground
 *   area; the `contained` tiling is ground-⊆-geo through the geometry GiST
 *   index. No fallback arms — no code path branches on which representation
 *   exists. Longitude is wrap-aware (min_lng > max_lng crosses the
 *   antimeridian): a crossing geo's envelope is the ST_Union of its two
 *   arms; crossing PLACES need no branch (P2, 2026-07-30) — ST_Covers/
 *   ST_CoveredBy ride the geometry GiST directly, a crossing row's cached
 *   bbox admits it broadly and the exact test judges (the P4a pattern).
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
    private readonly opsAlerts: OpsAlertsService,
    private readonly tasteProfile: UserTasteProfileBuilder,
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
    if (
      isEnvFlagExplicitlyDisabled(
        process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED,
      )
    ) {
      return;
    }
    if (this.refreshInFlight) {
      this.logger.warn('Signal demand aggregate refresh already running');
      return;
    }
    this.refreshInFlight = true;
    try {
      // READ the invalidation floor; do NOT clear it here. Clearing on read
      // meant a crash mid-rebuild lost the request entirely — strictly worse
      // than the design this replaced, where the pulled-back watermark
      // survived a crash. The floor is retired at the END, and only if it
      // still holds the value this pass actually rebuilt for, so a promotion
      // landing mid-pass (raising an EARLIER floor) is never swallowed.
      // Over-rebuilding is safe by design — each day is delete+reinsert.
      const [cursor] = await this.prisma.$queryRaw<
        {
          watermark: Date | null;
          floor: Date | null;
          floor_seq: bigint;
          next_watermark: Date;
        }[]
      >`
        SELECT
          watermark,
          rebuild_floor AS floor,
          rebuild_floor_seq AS floor_seq,
          now() - make_interval(secs => ${WATERMARK_LAG_SECONDS})
            AS next_watermark
        FROM signal_demand_rebuild_state
        WHERE id = 1
      `;
      // The pass rebuilds from the EARLIER of the two: how far we had built,
      // and how far back the ground changed under us.
      const cursorAt = cursor?.watermark ?? null;
      const floorAt = cursor?.floor ?? null;
      const floorSeq = cursor?.floor_seq ?? BigInt(0);
      const watermark =
        floorAt && cursorAt
          ? floorAt < cursorAt
            ? floorAt
            : cursorAt
          : (floorAt ?? cursorAt);
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
              -- RETIRE the floor only if NOTHING has asked for a rebuild
              -- since this pass read it. Comparing the SEQUENCE, not the
              -- value: a ms-truncated timestamp round-trip could never match
              -- a us-precision floor (28% of signals carry sub-ms times), and
              -- LEAST can leave the value byte-identical for a DIFFERENT
              -- request. A crash before this point leaves the floor pending.
              rebuild_floor = CASE
                WHEN signal_demand_rebuild_state.rebuild_floor_seq = ${floorSeq}
                THEN NULL
                ELSE signal_demand_rebuild_state.rebuild_floor
              END,
              updated_at = now()
      `;
      if (dayRows.length) {
        this.logger.info('Watermark refresh rebuilt day slices', {
          days: dayRows.map((row) => row.day),
        });
      }
      // D40 §3 — the derived taste profile rides THIS pass, immediately after
      // the aggregate it is derived from, for the actors this pass touched.
      // One write path: nothing else ever writes user_taste_profile, so the
      // profile cannot drift from the aggregate behind it. A throw here is
      // caught below with the rest of the pass — a stale profile is a stale
      // read model, not a reason to lose the watermark advance (which already
      // committed).
      await this.tasteProfile.rebuildForDays(dayRows.map((row) => row.day));
    } catch (error) {
      // Swallow AND tell someone (audit 2026-08-02, F205). A silently frozen
      // aggregate leaves the collector's territory read deciding what to
      // enrich — i.e. what to SPEND on — from stale demand.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to refresh signal demand aggregate', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'signal_demand_aggregate_refresh_failed',
        title: 'Signal demand aggregate refresh failed',
        body: [
          'The 15-minute watermark refresh threw; the aggregate is frozen at its last successful pass.',
          `Error: ${message}`,
          'Downstream: demand reads (and the collector spend decisions derived from them) are served from stale day slices until this recovers.',
        ].join('\n'),
        dedupeKey: `signal_demand_aggregate_refresh_failed:${new Date().toISOString().slice(0, 10)}`,
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
            -- P5b place anchor: NULL for geo-shaped acts (viewports, points).
            s.place_id,
            s.geo_min_lat, s.geo_min_lng, s.geo_max_lat, s.geo_max_lng,
            s.occurred_at,
            ${EVENT_COUNT_SQL} AS acts,
            COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId') AS request_id,
            ROW_NUMBER() OVER (
              PARTITION BY s.kind, ${DEDUPE_KEY_SQL}
              ORDER BY s.occurred_at ASC, s.signal_id ASC
            ) AS rn
          FROM signals s
          -- UTC day boundaries, explicitly. A bare ::date literal against a
          -- timestamptz column resolves in the SESSION timezone — measured at
          -- 9 / 0 / 12 rows for one day under UTC / Chicago / Tokyo.
          WHERE s.occurred_at >= ${utcDayStart(dayKey)}
            AND s.occurred_at < ${utcDayStart(nextDayKey)}
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
                  AND p.occurred_at < ${utcDayStart(dayKey)}
              )
            )
        ),
        geos AS (
          -- P5b (one-ground charter): PLACE-ANCHORED signals never enter the
          -- geometric path. A poll act's WHERE is a place, so its attribution
          -- is that place — read-time inheritance supplies the ancestors, the
          -- same as for a geometric verdict. Letting an anchored signal tile
          -- was the measured defect: its geo used to be the place's bounding
          -- RECTANGLE, and "contained" then matched every ground that fitted
          -- inside it (Austin: 31 other places). Excluding them here is also
          -- why their geo columns can stay a harmless centroid point.
          SELECT DISTINCT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng
          FROM day_signals
          -- Docket #3: stated POSITIVELY — the geometric path is for acts
          -- whose WHERE is a geometry. Anchored acts carry NULL geo now
          -- (nullable columns, anchor-or-geo CHECK), so the two filters are
          -- the same set; this one says what it means.
          WHERE geo_min_lat IS NOT NULL
        ),
        containing AS (
          -- §3 (i) under §2.6 GROUND UNIFICATION: the SMALLEST place whose
          -- GROUND contains the whole geo — at most ONE row per geo
          -- (read-time inheritance walks the ancestor chain; storing the
          -- chain would double-count).
          --
          -- P2 (one-ground charter, 2026-07-30): ONE arm, mirroring the
          -- "contained" CTE below. ST_Covers is itself index-accelerated —
          -- PostGIS expands it to && on the geometry GiST plus the exact
          -- test — so the hand-built candidate machinery this replaces (a
          -- bbox-envelope expression index, a materialized crossing-place
          -- catch-all, and a UNION of wrap-arm prefilter branches) was
          -- re-implementing the index by hand on a DERIVED rectangle. The
          -- named abstraction, exactly: geometry answers this geometric
          -- question directly. Crossing rows need no branch — their cached
          -- geometry bbox admits them broadly and the exact test judges,
          -- the same documented behavior as placesInView (P4a).
          SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng, place_id
          FROM (
            SELECT g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng,
                   pg.place_id,
                   ROW_NUMBER() OVER (
                     PARTITION BY g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng
                     ORDER BY ST_Area(pg.geometry) ASC,
                              pg.place_id ASC
                   ) AS pick
            FROM geos g
            JOIN place_geometries pg
              ON ST_Covers(pg.geometry, ${geoEnvelopeSql('g')})
            -- Red-team F1 (2026-07-30): place_geometries has NO FK to places,
            -- so an orphan ground (test teardown, a deleted place) could WIN
            -- the smallest-area pick and store a ghost uuid the readers then
            -- silently drop. The join to places is the existence check.
            JOIN places pl ON pl.place_id = pg.place_id
          ) ranked
          WHERE pick = 1
        ),
        contained AS MATERIALIZED (
          -- §3 (ii) step 1 under §2.6: every place whose GROUND sits inside
          -- the geo — ONE arm, ground ⊆ geo through the place_geometries
          -- GiST index (a place whose bbox overhangs the geo but whose
          -- ground sits inside is FOUND, and an overhanging ground under a
          -- contained bbox is REFUSED). Crossing geos are handled by the
          -- wrap-aware envelope (union of arms), so no bbox arms remain.
          -- MATERIALIZED: referenced three times below (dominated ×2 +
          -- tiling); one evaluation.
          SELECT g.geo_min_lat, g.geo_min_lng, g.geo_max_lat, g.geo_max_lng,
                 p.place_id, p.parent_place_ids
          FROM geos g
          JOIN place_geometries pg
            ON ST_CoveredBy(pg.geometry, ${geoEnvelopeSql('g')})
          JOIN places p ON p.place_id = pg.place_id
        ),
        dominated AS MATERIALIZED (
          -- §3 (ii) step 2a: contained rows whose direct DAG parent is
          -- ITSELF contained in the same geo. Under §2.6 the parent's
          -- containment verdict is ALREADY IN "contained" (every place has
          -- exactly one ground and "contained" judged them all), so parent
          -- domination reuses those verdicts — never a per-row geometry
          -- re-probe (a continental-viewport geo contains ~20k grounds;
          -- 40k exact ST_CoveredBy re-probes on stored outlines took
          -- minutes, proven live 2026-07-22). The row-constructor IN forces
          -- a HASHED SubPlan regardless of the planner's (unknowable) CTE
          -- row estimates — a JOIN form was planned as a 390M-loop nested
          -- loop on this exact data, and a geo-only merge is the old 3b
          -- O(N²) trap; both proven live.
          SELECT DISTINCT c.geo_min_lat, c.geo_min_lng, c.geo_max_lat,
                 c.geo_max_lng, c.place_id
          FROM contained c
          JOIN unnest(c.parent_place_ids) AS parent(place_id) ON TRUE
          WHERE (c.geo_min_lat, c.geo_min_lng, c.geo_max_lat, c.geo_max_lng,
                 parent.place_id) IN
                (SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
                        place_id FROM contained)
        ),
        tiling AS (
          -- §3 (ii) step 2b: keep only the COARSEST contained places — drop
          -- the dominated ones (US-wide geo → the US row survives; its
          -- states and towns fold away). NOT IN is NULL-safe here (every
          -- column is NOT NULL by construction) and hashes like the IN
          -- above.
          SELECT c.geo_min_lat, c.geo_min_lng, c.geo_max_lat, c.geo_max_lng, c.place_id
          FROM contained c
          WHERE (c.geo_min_lat, c.geo_min_lng, c.geo_max_lat, c.geo_max_lng,
                 c.place_id) NOT IN
                (SELECT geo_min_lat, geo_min_lng, geo_max_lat, geo_max_lng,
                        place_id FROM dominated)
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
        -- P5b: two disjoint sources of the place tile, selected by whether the
        -- act carries an anchor. Anchored -> the anchor place itself, no
        -- geometry consulted. Unanchored -> the geometric verdict, keyed by
        -- geo tuple exactly as before. The WHERE clauses are mutually
        -- exclusive on d.place_id, so a signal takes exactly one branch.
        JOIN LATERAL (
          SELECT d.place_id AS place_id
          WHERE d.place_id IS NOT NULL
          UNION ALL
          SELECT a.place_id
          FROM attributed a
          WHERE d.place_id IS NULL
            AND a.geo_min_lat = d.geo_min_lat AND a.geo_min_lng = d.geo_min_lng
            AND a.geo_max_lat = d.geo_max_lat AND a.geo_max_lng = d.geo_max_lng
        ) a ON TRUE
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
