/**
 * §4 demand-mass reader — the AGGREGATE-BACKED poll-supply demand read
 * (owner-ratified docket item 7, 2026-07-19: containment + ancestors at
 * weight 1 is THE territory read algebra; the old intersection reader retired
 * in this swap — ONE read surface for demand).
 *
 * Demand mass per (place[, subject]) at the current instant:
 *   Σ over actors of log2(1 + Σ over that actor's acts of
 *     kindWeight · recencyWeight)
 * read from ONE ARM (docket #6, 2026-07-31: the fresh ledger arm — the
 * law's second dialect — is DELETED; the aggregate INCLUDES today and the
 * 15-min rebuild cadence is the freshness contract):
 * - signal_demand_daily — the §3 containment-tiling aggregate. A place's
 *   tiles are its LINEAGE: itself + DAG descendants (a signal contained in
 *   a neighborhood is stored there and belongs to the city) + DAG ancestors
 *   at weight 1 (a coarse West-Texas-wide search stored at TX reaches
 *   Austin through the TX row — ratified as self-healing imprecision). MAX
 *   set-semantics across the lineage tiles per (actor, day, kind, subject):
 *   a signal stored at both a member and an ancestor counts ONCE (§3 SET
 *   semantics at aggregate grain — the same law territoryEntityDemand
 *   reads by).
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
import { ECHO_SIGNAL_KINDS } from '../../signals/signals.service';
import { dailyActsCteSql } from '../../signals/act-identity';
import {
  COOLDOWN_GAUSSIAN_DAYS,
  DEMAND_HALF_LIFE_DAYS,
  DEMAND_KERNEL_HORIZON_DAYS,
  MS_PER_DAY,
  RECENCY_FLAT_DAYS,
  dayRecencySql,
} from './poll-supply.constants';

/** K2 prior: all signal kinds weigh 1.0 at launch (see module doc). */
export const KIND_WEIGHT_PRIOR = 1.0;

// ACT_KEY_SQL / EVENT_COUNT_SQL moved to signals/act-identity (docket #8):
// one home for the act-identity fragments, shared with the aggregate and the
// read service so the arms cannot drift apart again.

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
  entityType: 'item' | 'place';
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
        -- @> rides the parent_place_ids GIN index (place-dag-read law).
        JOIN places p ON p.parent_place_ids @> ARRAY[d.tile]
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
    };
  }

  /**
   * Place-level (subjectless) demand mass at the CURRENT instant for each
   * requested place — the aggregate alone (docket #6: it includes today at
   * the 15-min rebuild cadence; echo kinds weigh 0; lineage tiles
   * MAX-deduped). Places with no acts return no row.
   */
  async placeDemandMass(
    placeIds: string[],
    now: Date = new Date(),
  ): Promise<PlaceDemandMass[]> {
    if (!placeIds.length) {
      return [];
    }
    const { todayKey, horizonKey } = this.windowKeys(now);
    const rows = await this.prisma.$queryRaw<
      { place_id: string; mass: number }[]
    >`
      WITH RECURSIVE ${this.lineageCtesSql(placeIds)},
      day_acts AS (
        -- Closed days over the containment tiles. Echo kinds weigh 0 (the
        -- act-grain law at kind granularity — ECHO_SIGNAL_KINDS); MAX across
        -- a root's lineage tiles counts a signal stored at both a member and
        -- an ancestor ONCE (§3 set semantics at aggregate grain).
        ${dailyActsCteSql({
          dimensions: [
            { expr: Prisma.sql`l.root` },
            { expr: Prisma.sql`a.subject_type` },
            { expr: Prisma.sql`a.subject_id` },
            { expr: Prisma.sql`a.subject_text` },
          ],
          from: Prisma.sql`lineage l
            JOIN signal_demand_daily a ON a.place_id = l.tile`,
          actsAlias: 'acts',
          echoKinds: ECHO_KINDS,
          sinceDayKey: horizonKey,
          // Tile-level mass counts acts against a TERRITORY regardless of what
          // they named, so this arm alone does not require an entity subject.
          subjectScope: 'any',
        })}
      ),
      by_actor AS (
        SELECT
          root,
          actor_id,
          SUM(
            acts * ${dayRecencySql(Prisma.sql`(${todayKey}::date - day)`)}
              * ${KIND_WEIGHT_PRIOR}
          )::float8 AS acts
        FROM day_acts
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
    const { todayKey, horizonKey } = this.windowKeys(now);
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
        ${dailyActsCteSql({
          dimensions: [
            { expr: Prisma.sql`l.root` },
            { expr: Prisma.sql`a.subject_id` },
          ],
          from: Prisma.sql`lineage l
            JOIN signal_demand_daily a ON a.place_id = l.tile`,
          actsAlias: 'acts',
          echoKinds: ECHO_KINDS,
          sinceDayKey: horizonKey,
          subjectScope: 'entity',
        })}
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
            acts * ${dayRecencySql(dayAge)} * ${KIND_WEIGHT_PRIOR}
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
      by_actor AS (
        -- Docket #6: the aggregate INCLUDES today (15-minute cadence = the
        -- freshness); the fresh ledger arm is deleted. agg_actor already
        -- carries today's rows at flat recency with current-cycle credit.
        SELECT
          root,
          subject_id,
          actor_id,
          SUM(acts) AS acts,
          SUM(current_acts) AS current_acts,
          SUM(baseline_acts) AS baseline_acts
        FROM agg_actor
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
       AND e.type IN ('item', 'place')
       -- ARCHIVED SUBJECTS ARE NOT RANKABLE (F542): the subject id is already
       -- redirect-resolved above, so a surviving row that is nonetheless
       -- archived (retired, or merged into an archived survivor) must not seed
       -- a poll — only LIVE food/restaurant entities are poll subjects. Proven
       -- RED by deleting this line (demand-mass-archived-subject.integration.spec.ts).
       AND e.status <> 'archived'
      ORDER BY ps.mass DESC
    `;
    return rows.map((row) => ({
      placeId: row.place_id,
      subjectId: row.subject_id,
      entityType: row.entity_type as 'item' | 'place',
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
   * tick, and the mass reads see it after the next rebuild (docket #6: the
   * 15-min cadence IS the freshness contract; the fresh arm is deleted).
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
        -- @> rides the parent_place_ids GIN index (place-dag-read law).
        JOIN places p ON p.parent_place_ids @> ARRAY[d.place_id]
      )
      SELECT place_id FROM up
      UNION
      SELECT place_id FROM down
    `;
    return rows.map((row) => row.place_id);
  }
}
