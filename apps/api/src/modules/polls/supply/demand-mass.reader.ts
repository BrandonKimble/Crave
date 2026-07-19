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
 *   every DEMAND_HALF_LIFE_DAYS (K1: 14d demand half-life). No horizon
 *   cutoff exists: the kernel itself extinguishes old signals, so no
 *   truncation constant needs to be minted (the item-6 rollup owns
 *   efficiency at scale).
 * - kindWeight: uniformly 1.0 — the K2 per-reader kind-weight PRIOR
 *   (sourceClassInfluence launch default 1.0, §8: a poll vote ≈ a mention).
 *   Applying one prior to ALL kinds is deliberate self-provisioning: a new
 *   signal kind automatically participates at the prior (no hardcoded kind
 *   list to rot — type-list disease guard). Per-kind measurement arrives via
 *   the estimator registry when the aggregate readers land (item 6).
 * - per-actor log2 saturation: §4's "no single act is loud" (R6) — an
 *   actor's acts saturate logarithmically before actors sum.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  DEMAND_HALF_LIFE_DAYS,
  RECENCY_FLAT_DAYS,
} from './poll-supply.constants';

/** K2 prior: all signal kinds weigh 1.0 at launch (see module doc). */
export const KIND_WEIGHT_PRIOR = 1.0;

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

  /**
   * Place-level (subjectless) demand mass at `at` for each requested place.
   * Places without a sketched bbox return no row (they cannot attribute).
   */
  async placeDemandMass(
    placeIds: string[],
    at: Date = new Date(),
  ): Promise<PlaceDemandMass[]> {
    if (!placeIds.length) {
      return [];
    }
    const age = Prisma.sql`(EXTRACT(EPOCH FROM (${at} - s.occurred_at)) / 86400.0)`;
    const rows = await this.prisma.$queryRaw<
      { place_id: string; mass: number }[]
    >`
      WITH place_box AS (
        SELECT place_id, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
        FROM places
        WHERE place_id = ANY(${placeIds}::uuid[])
          AND bbox_min_lat IS NOT NULL
      ),
      per_actor AS (
        SELECT
          pb.place_id,
          s.actor_id,
          SUM(${this.recencyKernel(age)} * ${KIND_WEIGHT_PRIOR}) AS acts
        FROM place_box pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND s.geo_min_lng <= pb.bbox_max_lng
         AND s.geo_max_lng >= pb.bbox_min_lng
         AND s.occurred_at <= ${at}
        GROUP BY pb.place_id, s.actor_id
      )
      SELECT place_id, SUM(ln(1 + acts) / ln(2))::float8 AS mass
      FROM per_actor
      GROUP BY place_id
    `;
    return rows.map((row) => ({
      placeId: row.place_id,
      mass: Number(row.mass),
    }));
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
    const age = Prisma.sql`(EXTRACT(EPOCH FROM (${at} - s.occurred_at)) / 86400.0)`;
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
      per_actor AS (
        SELECT
          pb.place_id,
          COALESCE(r.to_entity_id, s.subject_id) AS subject_id,
          s.actor_id,
          SUM(${this.recencyKernel(age)} * ${KIND_WEIGHT_PRIOR}) AS acts,
          SUM(CASE WHEN ${age} <= ${baselineEndDays} THEN 1.0 ELSE 0 END) AS current_acts,
          SUM(
            CASE
              WHEN ${age} > ${baselineEndDays} AND ${age} <= ${baselineStartDays}
              THEN 1.0 ELSE 0
            END
          ) AS baseline_acts
        FROM place_box pb
        JOIN signals s
          ON s.geo_min_lat <= pb.bbox_max_lat
         AND s.geo_max_lat >= pb.bbox_min_lat
         AND s.geo_min_lng <= pb.bbox_max_lng
         AND s.geo_max_lng >= pb.bbox_min_lng
         AND s.occurred_at <= ${at}
         AND s.subject_type = 'entity'
         AND s.subject_id IS NOT NULL
        LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
        GROUP BY pb.place_id, COALESCE(r.to_entity_id, s.subject_id), s.actor_id
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
   * placeIds that currently have ANY intersecting signal — the ritual's
   * cheap candidate filter (a place with zero signals has zero mass, zero
   * creditRate, and nothing to do).
   */
  async placesWithAnySignal(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ place_id: string }[]>`
      SELECT DISTINCT p.place_id
      FROM places p
      JOIN signals s
        ON s.geo_min_lat <= p.bbox_max_lat
       AND s.geo_max_lat >= p.bbox_min_lat
       AND s.geo_min_lng <= p.bbox_max_lng
       AND s.geo_max_lng >= p.bbox_min_lng
      WHERE p.bbox_min_lat IS NOT NULL
    `;
    return rows.map((row) => row.place_id);
  }
}
