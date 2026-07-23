/**
 * §4 demand-mass reader — the AGGREGATE-BACKED poll-supply demand read
 * (owner-ratified docket item 7, 2026-07-19: containment + ancestors at
 * weight 1 is THE territory read algebra; the old intersection reader retired
 * in this swap — ONE read surface for demand).
 *
 * Demand mass per (place[, subject]) at the current instant:
 *   Σ over actors of log2(1 + Σ over that actor's acts of
 *     kindWeight · recencyWeight)
 * read as TWO ARMS (mirroring SignalDemandReadService):
 * - CLOSED DAYS from signal_demand_daily — the §3 containment-tiling
 *   aggregate. A place's tiles are its LINEAGE: itself + DAG descendants
 *   (a signal contained in a neighborhood is stored there and belongs to the
 *   city) + DAG ancestors at weight 1 (a coarse West-Texas-wide search stored
 *   at TX reaches Austin through the TX row — ratified as self-healing
 *   imprecision). MAX set-semantics across the lineage tiles per
 *   (actor, day, kind, subject): a signal stored at both a member and an
 *   ancestor counts ONCE (§3 SET semantics at aggregate grain — the same law
 *   territoryEntityDemand reads by).
 * - FRESH TODAY from the ledger (flat weight — day age 0 is inside the flat
 *   cycle), with TRUE act-grain dedupe (the wave-5 F2 COALESCE including
 *   askSearchRequestId) and the aggregate's OWN attribution law
 *   (freshSignalAttributionSql: containment in either direction, judged on
 *   the place's ONE ground — §2.6 single representation; the canonical
 *   wrap-aware lng predicate survives as the prefilter); a cross-midnight
 *   retry is excluded by a first-occurrence anti-join (the aggregate already
 *   counted the act on its first day).
 *
 * ACT IDENTITY ON THE AGGREGATE (the core subtlety of the swap): the
 * post-wave-5 aggregate deliberately keeps ALL kinds, and one user act writes
 * several rows — 'search' + 'autocomplete_selection' + 'on_demand_ask' echoes
 * sharing one request id. Summing aggregate rows would weigh that act 2–6×.
 * The aggregate-compatible statement of the act-grain law is the ECHO-KIND
 * RULE (ECHO_SIGNAL_KINDS, signals.service): kinds that are by construction
 * echoes of a parent 'search' act weigh 0 in mass reads — the parent row
 * carries the act's weight 1 AND both subject halves (the search row stores
 * subjectId + subjectText on ONE row; the ledger never fans one act's subject
 * across rows, and the aggregate's per-(kind, request-id) first-occurrence
 * dedupe keeps exactly one base act per (kind, act) per window). Standalone
 * kinds — search (cached reveals count, docket item 8), entity_view,
 * favorite_added, poll_vote, poll_comment, poll_created, viewport_dwell —
 * weigh 1.
 *
 * DAY QUANTIZATION (documented delta): closed days weight at DAY grain —
 * recency(todayKey − day) instead of the old per-signal fractional age. A
 * signal 7.5 days old used to weigh 0.976 and now weighs by its day bucket
 * (flat 1.0 at day-age ≤ 7, then halving). Bounded by one day of kernel
 * drift; the supply estimators re-learn conversion/yield through the
 * re-based mass (K2 self-erasing priors).
 *
 * Kernel facts (§16 classifications) are unchanged: flat RECENCY_FLAT_DAYS,
 * DEMAND_HALF_LIFE_DAYS halving, kernel-derived horizon, K2 kind-weight prior
 * 1.0 (self-provisioning — a NEW kind participates automatically; only the
 * documented echo kinds are excluded, and only because they are restatements
 * of an already-counted act, not because of a kind-weight judgment), and §4
 * per-actor log2 saturation before actors sum.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  lngIntersectSql,
  placeLngColumns,
  SIGNAL_LNG_COLUMNS,
} from '../../signals/lng-intersect';
import { freshSignalAttributionSql } from '../../signals/ground-containment';
import { ECHO_SIGNAL_KINDS } from '../../signals/signals.service';
import { utcInstantSql } from '../../signals/sql-instant';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  DEMAND_HALF_LIFE_DAYS,
  DEMAND_KERNEL_HORIZON_DAYS,
  MS_PER_DAY,
  RECENCY_FLAT_DAYS,
} from './poll-supply.constants';

/** K2 prior: all signal kinds weigh 1.0 at launch (see module doc). */
export const KIND_WEIGHT_PRIOR = 1.0;

/** SQL: the per-actor ACT identity key (wave-5 F2) for the FRESH ledger arm.
 *  The ask's key value = the originating searchRequestId, so the echo rows of
 *  one act collapse into one group for free. */
const ACT_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId', s.signal_id::text)`;

/** SQL: per-act weight (backfilled legacy rows carry meta.eventCount). */
const EVENT_COUNT_SQL = Prisma.sql`GREATEST(1, COALESCE((s.meta->>'eventCount')::int, 1))`;

/** The echo kinds as a bindable text[] (see ECHO_SIGNAL_KINDS doc). */
const ECHO_KINDS: string[] = [...ECHO_SIGNAL_KINDS];

/**
 * The recency curve, stated once in TS as the CANONICAL kernel (the SQL
 * day-grain statement implements exactly this over integer day ages): flat
 * 1.0 through the current 7d cycle, then halving every 14 days. Negative ages
 * (future signals / clock skew) clamp to flat.
 */
export function recencyWeight(ageDays: number): number {
  if (ageDays <= RECENCY_FLAT_DAYS) {
    return 1;
  }
  return Math.pow(0.5, (ageDays - RECENCY_FLAT_DAYS) / DEMAND_HALF_LIFE_DAYS);
}

/**
 * §4 per-actor saturation + cross-actor sum, canonical TS statement:
 * mass = Σ over actors of log2(1 + that actor's Σ kindWeight·recencyWeight).
 * R6 in math: no single actor is loud (log saturation); influence
 * accumulates across DISTINCT people (the outer sum).
 */
export function demandMassFromActorActs(actsPerActor: number[]): number {
  return actsPerActor.reduce(
    (sum, acts) => sum + Math.log2(1 + Math.max(0, acts)),
    0,
  );
}

export interface PlaceDemandMass {
  placeId: string;
  mass: number;
}

export interface SubjectDemandMass {
  placeId: string;
  subjectId: string;
  entityType: 'food' | 'restaurant';
  entityName: string;
  /** Full-kernel demand mass (ranking input). */
  mass: number;
  /** Flat current-cycle mass (last RECENCY_FLAT_DAYS). */
  currentMass: number;
  /** Per-week baseline mass over the trailing COOLDOWN_GAUSSIAN_DAYS window
   *  that PRECEDES the current cycle (28d ÷ 4 weekly cycles — reuses the K1
   *  horizon, no new number). */
  baselineWeeklyMass: number;
}

@Injectable()
export class DemandMassReader {
  constructor(private readonly prisma: PrismaService) {}

  /** The §4 recency kernel at DAY granularity over an integer age-in-days
   *  expression (the same statement SignalDemandReadService uses). */
  private dayRecencySql(ageDays: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      CASE
        WHEN GREATEST(0, ${ageDays}) <= ${RECENCY_FLAT_DAYS} THEN 1.0
        ELSE power(0.5, (GREATEST(0, ${ageDays}) - ${RECENCY_FLAT_DAYS}) / ${DEMAND_HALF_LIFE_DAYS}::float8)
      END`;
  }

  /** The canonical wrap-aware intersect (signals lng-intersect.ts) for
   *  signal row s vs place-box row pb — the FRESH arm's geo predicate. */
  private lngIntersectSql(): Prisma.Sql {
    return lngIntersectSql(SIGNAL_LNG_COLUMNS, placeLngColumns('pb'));
  }

  /**
   * FRESH-arm first-occurrence gate at ACT grain (mirrors the aggregate's
   * window-wide dedupe): exclude today's rows of an act whose request id
   * FIRST occurred before today — the aggregate already counted that act on
   * its first day. The prior-probe matches on the 2-way parent key
   * (searchRequestId / cacheRevealRequestId — the indexed expression): an
   * ask's 3-way key IS its parent's searchRequestId, and by the echo
   * invariant the parent 'search' row exists whenever any prior echo does,
   * so the 2-way probe is complete at act grain.
   */
  private freshActFirstOccurrenceSql(todayStart: Date): Prisma.Sql {
    return Prisma.sql`AND (
        COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM signals prior
          WHERE (prior.meta->>'searchRequestId' IS NOT NULL
                 OR prior.meta->>'cacheRevealRequestId' IS NOT NULL)
            AND COALESCE(prior.meta->>'searchRequestId', prior.meta->>'cacheRevealRequestId')
                = COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId')
            AND prior.occurred_at < ${utcInstantSql(todayStart)}
        )
      )`;
  }

  /**
   * The LINEAGE CTE chain (§3 containment read): per requested root place,
   * every aggregate tile whose rows belong to it — itself, its DAG
   * DESCENDANTS (own + descendants' rows), and its DAG ANCESTORS at weight 1
   * (each distinct ancestor row once; the MAX at the consumer supplies the
   * count-once set semantics). Emitted as the leading CTEs of a
   * WITH RECURSIVE statement: roots(root), up/down walks, lineage(root, tile).
   */
  private lineageCtesSql(placeIds: string[]): Prisma.Sql {
    return Prisma.sql`
      roots AS (
        SELECT unnest(${placeIds}::uuid[]) AS root
      ),
      up AS (
        SELECT r.root, r.root AS tile FROM roots r
        UNION
        SELECT u.root, parent.place_id
        FROM up u
        JOIN places p ON p.place_id = u.tile
        CROSS JOIN LATERAL unnest(p.parent_place_ids) AS parent(place_id)
      ),
      down AS (
        SELECT r.root, r.root AS tile FROM roots r
        UNION
        SELECT d.root, p.place_id
        FROM down d
        JOIN places p ON d.tile = ANY(p.parent_place_ids)
      ),
      lineage AS (
        SELECT root, tile FROM up
        UNION
        SELECT root, tile FROM down
      )`;
  }

  private windowKeys(now: Date): {
    todayKey: string;
    horizonKey: string;
    todayStart: Date;
  } {
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const horizon = new Date(
      todayStart.getTime() - DEMAND_KERNEL_HORIZON_DAYS * MS_PER_DAY,
    );
    return {
      todayKey: todayStart.toISOString().slice(0, 10),
      horizonKey: horizon.toISOString().slice(0, 10),
      todayStart,
    };
  }

  /**
   * Place-level (subjectless) demand mass at the CURRENT instant for each
   * requested place — aggregate closed days (echo kinds weigh 0; lineage
   * tiles MAX-deduped) + fresh-today ledger arm (act-grain dedupe; wrap-aware
   * intersect against the place bbox). Places with no acts return no row.
   */
  async placeDemandMass(
    placeIds: string[],
    now: Date = new Date(),
  ): Promise<PlaceDemandMass[]> {
    if (!placeIds.length) {
      return [];
    }
    const { todayKey, horizonKey, todayStart } = this.windowKeys(now);
    const rows = await this.prisma.$queryRaw<
      { place_id: string; mass: number }[]
    >`
      WITH RECURSIVE ${this.lineageCtesSql(placeIds)},
      day_acts AS (
        -- Closed days over the containment tiles. Echo kinds weigh 0 (the
        -- act-grain law at kind granularity — ECHO_SIGNAL_KINDS); MAX across
        -- a root's lineage tiles counts a signal stored at both a member and
        -- an ancestor ONCE (§3 set semantics at aggregate grain).
        SELECT
          l.root,
          a.actor_id,
          a.day,
          a.kind,
          a.subject_type,
          a.subject_id,
          a.subject_text,
          MAX(a.signal_count) AS acts
        FROM lineage l
        JOIN signal_demand_daily a ON a.place_id = l.tile
        WHERE a.day >= ${horizonKey}::date
          AND a.day < ${todayKey}::date
          AND a.kind <> ALL(${ECHO_KINDS}::text[])
        GROUP BY l.root, a.actor_id, a.day, a.kind,
                 a.subject_type, a.subject_id, a.subject_text
      ),
      agg_actor AS (
        SELECT
          root,
          actor_id,
          SUM(
            acts * ${this.dayRecencySql(Prisma.sql`(${todayKey}::date - day)`)}
              * ${KIND_WEIGHT_PRIOR}
          )::float8 AS acts
        FROM day_acts
        GROUP BY 1, 2
      ),
      fresh_acts AS (
        -- TODAY from the ledger: true act-grain dedupe (echo rows collapse
        -- into their parent act's key group), first-occurrence gate against
        -- earlier days. Attribution speaks the aggregate's §2.6 law
        -- (freshSignalAttributionSql): CONTAINMENT in either direction,
        -- judged on the place's ONE ground (sketch envelope or outline) —
        -- the wrap-aware lng intersect stays as the cheap PREFILTER
        -- (containment implies intersection). AT TIME
        -- ZONE 'UTC' law: occurred_at is naive UTC (live-proven wave-5).
        SELECT
          pb.place_id AS root,
          s.actor_id,
          ${ACT_KEY_SQL} AS act_key,
          MAX(${EVENT_COUNT_SQL})::float8 AS acts
        FROM places pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND (${this.lngIntersectSql()})
         AND (${freshSignalAttributionSql('pb')})
        WHERE pb.place_id = ANY(${placeIds}::uuid[])
          AND pb.bbox_min_lat IS NOT NULL
          AND s.occurred_at >= ${utcInstantSql(todayStart)}
          ${this.freshActFirstOccurrenceSql(todayStart)}
        GROUP BY 1, 2, 3
      ),
      fresh_actor AS (
        SELECT root, actor_id, SUM(acts * ${KIND_WEIGHT_PRIOR}) AS acts
        FROM fresh_acts
        GROUP BY 1, 2
      ),
      by_actor AS (
        SELECT root, actor_id, SUM(acts) AS acts
        FROM (
          SELECT * FROM agg_actor
          UNION ALL
          SELECT * FROM fresh_actor
        ) u
        GROUP BY 1, 2
      )
      SELECT root AS place_id, SUM(ln(1 + acts) / ln(2))::float8 AS mass
      FROM by_actor
      GROUP BY 1
    `;
    return rows.map((row) => ({
      placeId: row.place_id,
      mass: Number(row.mass),
    }));
  }

  /**
   * Per-(place, subject) demand mass for entity subjects — the §4 subject-
   * choice input, over the same two arms and the same lineage/echo/dedupe
   * laws as placeDemandMass. Subject identity resolves through
   * entity_redirects AT READ (the aggregate stores raw ids); only rankable
   * poll subjects (food | restaurant entities) survive the final join.
   *
   * Echo note for subjects: the parent 'search' row carries the act's
   * resolved entity (the writer stores the selected/primary entity ON the
   * search row), so excluding echo kinds keeps one act = one unit of subject
   * attention. An ask's NON-primary entity (a low-result secondary term)
   * reaches collection through the kind-filtered territoryUnmetAsks reader —
   * mass follows the act's primary subject by law.
   */
  async subjectDemandMass(
    placeIds: string[],
    now: Date = new Date(),
  ): Promise<SubjectDemandMass[]> {
    if (!placeIds.length) {
      return [];
    }
    const { todayKey, horizonKey, todayStart } = this.windowKeys(now);
    const baselineEndDays = RECENCY_FLAT_DAYS;
    const baselineStartDays = RECENCY_FLAT_DAYS + COOLDOWN_GAUSSIAN_DAYS;
    const baselineWeeks = COOLDOWN_GAUSSIAN_DAYS / RECENCY_FLAT_DAYS;
    const dayAge = Prisma.sql`(${todayKey}::date - day)`;
    const rows = await this.prisma.$queryRaw<
      {
        place_id: string;
        subject_id: string;
        entity_type: string;
        entity_name: string;
        mass: number;
        current_mass: number;
        baseline_weekly_mass: number;
      }[]
    >`
      WITH RECURSIVE ${this.lineageCtesSql(placeIds)},
      day_acts AS (
        -- Tile MAX first, at RAW subject grain (two raw ids folding into one
        -- survivor are distinct acts and must SUM, not MAX).
        SELECT
          l.root,
          a.actor_id,
          a.day,
          a.kind,
          a.subject_id,
          MAX(a.signal_count) AS acts
        FROM lineage l
        JOIN signal_demand_daily a ON a.place_id = l.tile
        WHERE a.day >= ${horizonKey}::date
          AND a.day < ${todayKey}::date
          AND a.subject_type = 'entity'
          AND a.subject_id IS NOT NULL
          AND a.kind <> ALL(${ECHO_KINDS}::text[])
        GROUP BY l.root, a.actor_id, a.day, a.kind, a.subject_id
      ),
      resolved AS (
        SELECT
          d.root,
          COALESCE(r.to_entity_id, d.subject_id) AS subject_id,
          d.actor_id,
          d.day,
          SUM(d.acts) AS acts
        FROM day_acts d
        LEFT JOIN entity_redirects r ON r.from_entity_id = d.subject_id
        GROUP BY 1, 2, 3, 4
      ),
      agg_actor AS (
        SELECT
          root,
          subject_id,
          actor_id,
          SUM(
            acts * ${this.dayRecencySql(dayAge)} * ${KIND_WEIGHT_PRIOR}
          )::float8 AS acts,
          COALESCE(
            SUM(acts) FILTER (WHERE ${dayAge} <= ${baselineEndDays}), 0
          )::float8 AS current_acts,
          COALESCE(
            SUM(acts) FILTER (
              WHERE ${dayAge} > ${baselineEndDays}
                AND ${dayAge} <= ${baselineStartDays}
            ), 0
          )::float8 AS baseline_acts
        FROM resolved
        GROUP BY 1, 2, 3
      ),
      fresh_acts AS (
        -- Same §2.5(c) fresh-arm attribution law as placeDemandMass
        -- (containment, polygon-first; lng intersect = prefilter only).
        SELECT
          pb.place_id AS root,
          COALESCE(r.to_entity_id, s.subject_id) AS subject_id,
          s.actor_id,
          ${ACT_KEY_SQL} AS act_key,
          MAX(${EVENT_COUNT_SQL})::float8 AS acts
        FROM places pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND (${this.lngIntersectSql()})
         AND (${freshSignalAttributionSql('pb')})
        LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
        WHERE pb.place_id = ANY(${placeIds}::uuid[])
          AND pb.bbox_min_lat IS NOT NULL
          AND s.subject_type = 'entity'
          AND s.subject_id IS NOT NULL
          AND s.occurred_at >= ${utcInstantSql(todayStart)}
          ${this.freshActFirstOccurrenceSql(todayStart)}
        GROUP BY 1, 2, 3, 4
      ),
      fresh_actor AS (
        -- Today is inside the flat cycle: full weight AND current-cycle acts.
        SELECT
          root,
          subject_id,
          actor_id,
          SUM(acts * ${KIND_WEIGHT_PRIOR}) AS acts,
          SUM(acts) AS current_acts,
          0::float8 AS baseline_acts
        FROM fresh_acts
        GROUP BY 1, 2, 3
      ),
      by_actor AS (
        SELECT
          root,
          subject_id,
          actor_id,
          SUM(acts) AS acts,
          SUM(current_acts) AS current_acts,
          SUM(baseline_acts) AS baseline_acts
        FROM (
          SELECT * FROM agg_actor
          UNION ALL
          SELECT * FROM fresh_actor
        ) u
        GROUP BY 1, 2, 3
      ),
      per_subject AS (
        SELECT
          root AS place_id,
          subject_id,
          SUM(ln(1 + acts) / ln(2)) AS mass,
          SUM(ln(1 + current_acts) / ln(2)) AS current_mass,
          SUM(ln(1 + baseline_acts) / ln(2)) / ${baselineWeeks} AS baseline_weekly_mass
        FROM by_actor
        GROUP BY 1, 2
      )
      SELECT
        ps.place_id,
        ps.subject_id,
        e.type::text AS entity_type,
        e.name AS entity_name,
        ps.mass::float8 AS mass,
        ps.current_mass::float8 AS current_mass,
        ps.baseline_weekly_mass::float8 AS baseline_weekly_mass
      FROM per_subject ps
      JOIN core_entities e
        ON e.entity_id = ps.subject_id
       AND e.type IN ('food', 'restaurant')
      ORDER BY ps.mass DESC
    `;
    return rows.map((row) => ({
      placeId: row.place_id,
      subjectId: row.subject_id,
      entityType: row.entity_type as 'food' | 'restaurant',
      entityName: row.entity_name,
      mass: Number(row.mass),
      currentMass: Number(row.current_mass),
      baselineWeeklyMass: Number(row.baseline_weekly_mass),
    }));
  }

  /**
   * placeIds that can carry ANY demand mass under the containment algebra —
   * the ritual's cheap candidate filter, aggregate-backed: the distinct PLACE
   * tiles with rows inside the kernel's derived horizon (the GLOBAL tile —
   * place_id NULL — deliberately does NOT seed candidates: mass needs
   * place-attributed rows), expanded to every place whose lineage reaches a
   * tile (ancestors of a tile read it as a descendant row; descendants read
   * it as an ancestor row at weight 1).
   *
   * Freshness note: today's slice of the aggregate rebuilds every 15 minutes
   * (watermark cron), so a signal younger than the cron lag may miss ONE
   * hourly ritual pass — the ≥-hour Sunday window catches it on the next
   * tick. The mass reads themselves still see it through their fresh arm.
   */
  async placesWithAnySignal(now: Date = new Date()): Promise<string[]> {
    const { horizonKey } = this.windowKeys(now);
    const rows = await this.prisma.$queryRaw<{ place_id: string }[]>`
      WITH RECURSIVE tiles AS (
        SELECT DISTINCT a.place_id
        FROM signal_demand_daily a
        WHERE a.place_id IS NOT NULL
          AND a.day >= ${horizonKey}::date
      ),
      up AS (
        SELECT t.place_id FROM tiles t
        UNION
        SELECT parent.place_id
        FROM up u
        JOIN places p ON p.place_id = u.place_id
        CROSS JOIN LATERAL unnest(p.parent_place_ids) AS parent(place_id)
      ),
      down AS (
        SELECT t.place_id FROM tiles t
        UNION
        SELECT p.place_id
        FROM down d
        JOIN places p ON d.place_id = ANY(p.parent_place_ids)
      )
      SELECT place_id FROM up
      UNION
      SELECT place_id FROM down
    `;
    return rows.map((row) => row.place_id);
  }
}
