/**
 * §4 demand-mass reader — the minimal DIRECT read over the signals ledger
 * (the incremental tiled rollup is §22 item 6; this reader is deliberately a
 * straight SQL derivation so the rollup can replace it without changing any
 * consumer).
 *
 * Demand mass per (place[, subject], window ending at `at`):
 *   Σ over actors of log2(1 + Σ over that actor's signals of
 *     kindWeight · recencyWeight)
 * for signals whose geo bbox INTERSECTS the place bbox (§22 item 4 wording;
 * weight-1 attribution — every intersecting signal counts at full weight).
 *
 * Kernel facts (§16 classifications):
 * - recencyWeight: flat for RECENCY_FLAT_DAYS (K1: 7d cycle), then halving
 *   every DEMAND_HALF_LIFE_DAYS (K1: 14d demand half-life). The kernel
 *   itself extinguishes old signals; the occurred_at scan is bounded by the
 *   kernel's OWN derived horizon (DEMAND_KERNEL_HORIZON_DAYS: flat + 10
 *   half-lives ⇒ weight < epsilon, sub-resolution for every consumer) — an
 *   efficiency bound derived from the kernel, not a new behavior constant.
 * - kindWeight: uniformly 1.0 — the K2 per-reader kind-weight PRIOR
 *   (sourceClassInfluence launch default 1.0, §8: a poll vote ≈ a mention).
 *   Applying one prior to ALL kinds is deliberate self-provisioning: a new
 *   signal kind automatically participates at the prior (no hardcoded kind
 *   list to rot — type-list disease guard). Per-kind measurement arrives via
 *   the estimator registry when the aggregate readers land (item 6).
 * - per-actor log2 saturation: §4's "no single act is loud" (R6) — an
 *   actor's acts saturate logarithmically before actors sum.
 *
 * Longitude is WRAP-AWARE (red-team 3c, mirroring places-catalog): a bbox
 * with minLng > maxLng CROSSES the antimeridian and covers
 * [minLng, 180] ∪ [-180, maxLng]; the SQL intersect OR-splits crossing rows
 * instead of range-testing them (a btree range test on a crossing row is
 * meaningless). The canonical predicate lives in the signals module
 * (lng-intersect.ts, wave-5 F4 convergence) — one statement, every consumer.
 *
 * ACT-GRAIN DEDUPE (wave-5 F2): one user act can write SEVERAL ledger rows
 * that deliberately share an idempotency id — a selected search writes
 * 'search' + 'autocomplete_selection' under meta.searchRequestId, and a
 * failing search ALSO writes 'on_demand_ask' rows whose
 * meta.askSearchRequestId carries the SAME originating searchRequestId.
 * For MASS purposes those are ONE act of attention: the subjectless /
 * kind-unfiltered mass reads below collapse rows to act grain on
 * COALESCE(searchRequestId, cacheRevealRequestId, askSearchRequestId,
 * signal_id) per actor BEFORE the kernel sums (the ask's key value = the
 * originating searchRequestId, so the echo collapses for free). Kind-
 * FILTERED readers (e.g. territoryUnmetAsks) keep reading ask rows directly
 * — there the ask IS the act. First occurrence wins (MIN occurred_at),
 * matching the aggregate's dedupe law.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  lngIntervalsIntersect,
  lngIntersectSql,
  placeLngColumns,
  SIGNAL_LNG_COLUMNS,
} from '../../signals/lng-intersect';
import { utcInstantSql } from '../../signals/sql-instant';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  DEMAND_HALF_LIFE_DAYS,
  DEMAND_KERNEL_HORIZON_DAYS,
  MS_PER_DAY,
  RECENCY_FLAT_DAYS,
} from './poll-supply.constants';

/** Canonical TS predicate re-exported for existing consumers/specs. */
export { lngIntervalsIntersect };

/** K2 prior: all signal kinds weigh 1.0 at launch (see module doc). */
export const KIND_WEIGHT_PRIOR = 1.0;

/** SQL: the per-actor ACT identity key (wave-5 F2 — see module doc). */
const ACT_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId', s.signal_id::text)`;

/**
 * The recency curve, stated once in TS as the CANONICAL kernel (the SQL below
 * implements exactly this; the item-6 incremental rollup consumes the TS
 * kernel directly): flat 1.0 through the current 7d cycle, then halving
 * every 14 days. Negative ages (future signals) clamp to flat.
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

export interface PlaceDemandMassAt extends PlaceDemandMass {
  at: Date;
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

  /** The recency kernel as a SQL fragment over an `age_days` expression. */
  private recencyKernel(ageDays: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      CASE
        WHEN ${ageDays} <= ${RECENCY_FLAT_DAYS} THEN 1.0
        ELSE power(0.5, (${ageDays} - ${RECENCY_FLAT_DAYS}) / ${DEMAND_HALF_LIFE_DAYS}::float8)
      END`;
  }

  /** The canonical wrap-aware intersect (signals lng-intersect.ts) for
   *  signal row s vs place-box row pb. */
  private lngIntersectSql(): Prisma.Sql {
    return lngIntersectSql(SIGNAL_LNG_COLUMNS, placeLngColumns('pb'));
  }

  /**
   * Place-level (subjectless) demand mass, each request at its OWN `at`
   * (batched — the harvest reads every cohort's launch-time mass in one
   * query, red-team 3b). Places without a sketched bbox return no row.
   */
  async placeDemandMassAt(
    requests: { placeId: string; at: Date }[],
  ): Promise<PlaceDemandMassAt[]> {
    if (!requests.length) {
      return [];
    }
    const placeIds = requests.map((request) => request.placeId);
    const ats = requests.map((request) => request.at.toISOString());
    const actAge = Prisma.sql`(EXTRACT(EPOCH FROM (pa.at - pa.occurred_at)) / 86400.0)`;
    const rows = await this.prisma.$queryRaw<
      { place_id: string; at: Date; mass: number }[]
    >`
      WITH req AS (
        SELECT * FROM unnest(${placeIds}::uuid[], ${ats}::timestamptz[]) AS r(place_id, at)
      ),
      place_box AS (
        -- AT TIME ZONE 'UTC': signals.occurred_at is NAIVE-UTC (aggregate
        -- red-team 1a); coerce the request instant to naive UTC ONCE so
        -- every comparison/age below is naive-vs-naive in every session
        -- time zone (live-proven wave-5: the bare timestamptz comparison
        -- silently excluded the last UTC-offset hours of signals).
        SELECT r.place_id, (r.at AT TIME ZONE 'UTC') AS at,
               p.bbox_min_lat, p.bbox_min_lng, p.bbox_max_lat, p.bbox_max_lng
        FROM req r
        JOIN places p ON p.place_id = r.place_id
        WHERE p.bbox_min_lat IS NOT NULL
      ),
      per_act AS (
        -- Wave-5 F2: collapse the ledger rows of ONE act (search +
        -- autocomplete_selection + on_demand_ask echo sharing an
        -- idempotency id) to act grain per actor BEFORE the kernel;
        -- first occurrence wins (MIN occurred_at, the aggregate's law).
        SELECT
          pb.place_id,
          pb.at,
          s.actor_id,
          ${ACT_KEY_SQL} AS act_key,
          MIN(s.occurred_at) AS occurred_at
        FROM place_box pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND (${this.lngIntersectSql()})
         AND s.occurred_at <= pb.at
         -- ::int — Prisma binds JS integers as int8; make_interval has no
         -- bigint overload (live-proven wave-5).
         AND s.occurred_at >= pb.at - make_interval(days => ${DEMAND_KERNEL_HORIZON_DAYS}::int)
        GROUP BY pb.place_id, pb.at, s.actor_id, ${ACT_KEY_SQL}
      ),
      per_actor AS (
        SELECT
          pa.place_id,
          pa.at,
          pa.actor_id,
          SUM(${this.recencyKernel(actAge)} * ${KIND_WEIGHT_PRIOR}) AS acts
        FROM per_act pa
        GROUP BY pa.place_id, pa.at, pa.actor_id
      )
      SELECT place_id, at, SUM(ln(1 + acts) / ln(2))::float8 AS mass
      FROM per_actor
      GROUP BY place_id, at
    `;
    return rows.map((row) => ({
      placeId: row.place_id,
      at: new Date(row.at),
      mass: Number(row.mass),
    }));
  }

  /**
   * Place-level (subjectless) demand mass at `at` for each requested place.
   * Places without a sketched bbox return no row (they cannot attribute).
   */
  async placeDemandMass(
    placeIds: string[],
    at: Date = new Date(),
  ): Promise<PlaceDemandMass[]> {
    const rows = await this.placeDemandMassAt(
      placeIds.map((placeId) => ({ placeId, at })),
    );
    return rows.map((row) => ({ placeId: row.placeId, mass: row.mass }));
  }

  /**
   * Per-(place, subject) demand mass for entity subjects — the §4 subject-
   * choice input. Subject identity resolves through entity_redirects AT READ
   * (§3: identity is a judgment; the ledger is never rekeyed), and only
   * rankable poll subjects (food | restaurant entities) survive the join.
   */
  async subjectDemandMass(
    placeIds: string[],
    at: Date = new Date(),
  ): Promise<SubjectDemandMass[]> {
    if (!placeIds.length) {
      return [];
    }
    const actAge = Prisma.sql`(EXTRACT(EPOCH FROM (${utcInstantSql(at)} - pa.occurred_at)) / 86400.0)`;
    const baselineEndDays = RECENCY_FLAT_DAYS;
    const baselineStartDays = RECENCY_FLAT_DAYS + COOLDOWN_GAUSSIAN_DAYS;
    const baselineWeeks = COOLDOWN_GAUSSIAN_DAYS / RECENCY_FLAT_DAYS;
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
      WITH place_box AS (
        SELECT place_id, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
        FROM places
        WHERE place_id = ANY(${placeIds}::uuid[])
          AND bbox_min_lat IS NOT NULL
      ),
      per_act AS (
        -- Wave-5 F2: act-grain dedupe per (place, subject, actor) — the
        -- search + selection rows of one submit (shared searchRequestId)
        -- count as ONE act of attention on their subject; first occurrence
        -- wins (MIN occurred_at).
        SELECT
          pb.place_id,
          COALESCE(r.to_entity_id, s.subject_id) AS subject_id,
          s.actor_id,
          ${ACT_KEY_SQL} AS act_key,
          MIN(s.occurred_at) AS occurred_at
        FROM place_box pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND (${this.lngIntersectSql()})
         AND s.occurred_at <= ${utcInstantSql(at)}
         AND s.occurred_at >= ${utcInstantSql(new Date(at.getTime() - DEMAND_KERNEL_HORIZON_DAYS * MS_PER_DAY))}
         AND s.subject_type = 'entity'
         AND s.subject_id IS NOT NULL
        LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
        GROUP BY pb.place_id, COALESCE(r.to_entity_id, s.subject_id), s.actor_id, ${ACT_KEY_SQL}
      ),
      per_actor AS (
        SELECT
          pa.place_id,
          pa.subject_id,
          pa.actor_id,
          SUM(${this.recencyKernel(actAge)} * ${KIND_WEIGHT_PRIOR}) AS acts,
          SUM(CASE WHEN ${actAge} <= ${baselineEndDays} THEN 1.0 ELSE 0 END) AS current_acts,
          SUM(
            CASE
              WHEN ${actAge} > ${baselineEndDays} AND ${actAge} <= ${baselineStartDays}
              THEN 1.0 ELSE 0
            END
          ) AS baseline_acts
        FROM per_act pa
        GROUP BY pa.place_id, pa.subject_id, pa.actor_id
      ),
      per_subject AS (
        SELECT
          place_id,
          subject_id,
          SUM(ln(1 + acts) / ln(2)) AS mass,
          SUM(ln(1 + current_acts) / ln(2)) AS current_mass,
          SUM(ln(1 + baseline_acts) / ln(2)) / ${baselineWeeks} AS baseline_weekly_mass
        FROM per_actor
        GROUP BY place_id, subject_id
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
   * placeIds that have ANY signal still inside the kernel's derived horizon
   * (red-team 3a) — the ritual's cheap candidate filter. A signal older than
   * DEMAND_KERNEL_HORIZON_DAYS carries < epsilon weight and cannot create
   * mass, creditRate, or work; bounding occurred_at makes the scan's cost
   * track LIVE attention, not ledger history.
   */
  async placesWithAnySignal(now: Date = new Date()): Promise<string[]> {
    const horizonStart = new Date(
      now.getTime() - DEMAND_KERNEL_HORIZON_DAYS * MS_PER_DAY,
    );
    const rows = await this.prisma.$queryRaw<{ place_id: string }[]>`
      SELECT DISTINCT pb.place_id
      FROM (
        SELECT place_id, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
        FROM places
        WHERE bbox_min_lat IS NOT NULL
      ) pb
      JOIN signals s
        ON s.geo_min_lat <= pb.bbox_max_lat
       AND s.geo_max_lat >= pb.bbox_min_lat
       AND (${this.lngIntersectSql()})
       AND s.occurred_at >= ${utcInstantSql(horizonStart)}
       AND s.occurred_at <= ${utcInstantSql(now)}
    `;
    return rows.map((row) => row.place_id);
  }
}
