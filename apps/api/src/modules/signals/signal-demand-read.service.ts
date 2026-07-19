import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import type { SignalKind } from './signals.service';
import {
  DEMAND_HALF_LIFE_DAYS,
  RECENCY_FLAT_DAYS,
} from '../polls/supply/poll-supply.constants';

/**
 * §22 item 6 readers over the signals substrate — the ledger plus its derived
 * aggregate (signal_demand_daily). Every consumer that used to read the dying
 * event tables (user_entity_view_events / user_restaurant_views /
 * user_food_views / search_events / user_search_demand_daily) reads HERE.
 *
 * Read laws (§3):
 * - Identity is a judgment: subjectIds resolve through entity_redirects AT
 *   READ — the ledger and the aggregate are never rekeyed.
 * - Qualifiers are judged at read: client retry dedupe collapses on
 *   meta.searchRequestId / meta.cacheRevealRequestId; backfilled legacy rows
 *   carry meta.eventCount (their pre-dedup counters).
 * - Demand math is the ONE §4 kernel (flat RECENCY_FLAT_DAYS then
 *   DEMAND_HALF_LIFE_DAYS halving; per-actor log2 saturation before actors
 *   sum), here at DAY granularity over the aggregate: completed days read
 *   from signal_demand_daily (global tile, place_id NULL), TODAY reads fresh
 *   from the ledger (flat weight 1.0) — freshness without waiting on the
 *   aggregate cron.
 * - Kind weights are uniformly the K2 prior 1.0 (self-provisioning: new kinds
 *   participate automatically; per-kind measurement arrives via the estimator
 *   registry). The old rollup's hand-set per-kind weights (1.5 / 0.6 / 0.35)
 *   died with it.
 */

/** SQL: the per-signal act-dedupe key (§3 judge-at-read). */
const DEDUPE_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.signal_id::text)`;

/** SQL: per-act weight (backfilled legacy rows carry meta.eventCount). */
const EVENT_COUNT_SQL = Prisma.sql`GREATEST(1, COALESCE((s.meta->>'eventCount')::int, 1))`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EntityDemandParams {
  entityIds: string[];
  /**
   * Optional lane filter. OMIT for demand reads (§3 self-provisioning: every
   * entity-subject act of every kind — present and future — counts at the K2
   * prior weight 1.0). Pass kinds only when the READER is act-specific by
   * meaning (e.g. autocomplete's typed-search vs selection support lanes).
   */
  kinds?: SignalKind[];
  /** When set, only this user's acts count (affinity read). */
  userId?: string | null;
  windowDays: number;
}

export interface QueryDemandParams {
  prefix?: string | null;
  keys?: string[] | null;
  windowDays: number;
  limit: number;
}

export interface QueryDemandRow {
  queryKey: string;
  distinctActors: number;
  signalCount: number;
  demandScore: number;
  lastUsed: Date;
}

export interface PersonalQueryRow {
  queryKey: string;
  signalCount: number;
  lastUsed: Date;
}

export interface RecentlyViewedRestaurantRow {
  restaurantId: string;
  restaurantName: string;
  city: string | null;
  region: string | null;
  lastViewedAt: Date;
  viewCount: number;
  /** Latest view's locationId meta (the recently-viewed location display). */
  locationId: string | null;
}

export interface RecentlyViewedFoodRow {
  connectionId: string;
  foodId: string;
  foodName: string;
  restaurantId: string;
  restaurantName: string;
  lastViewedAt: Date;
  viewCount: number;
  locationId: string | null;
}

export interface RestaurantViewStatsRow {
  restaurantId: string;
  lastViewedAt: Date;
  viewCount: number;
}

export interface ViewedRestaurantNameMatch {
  restaurantId: string;
  name: string;
  aliases: string[];
}

@Injectable()
export class SignalDemandReadService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SignalDemandReadService');
  }

  /**
   * Per-entity demand score: Σ over actors of log2(1 + Σ acts·recency) —
   * aggregate for completed days, ledger for today, redirects at read.
   * Returns a map keyed by the REQUESTED (already-canonical) entityIds.
   */
  async entityDemandScores(
    params: EntityDemandParams,
  ): Promise<Map<string, number>> {
    if (!params.entityIds.length || params.kinds?.length === 0) {
      return new Map();
    }
    const actorId = await this.resolveActorId(params.userId);
    if (params.userId && !actorId) {
      return new Map();
    }
    const { todayKey, sinceDayKey, todayStart } = this.windowKeys(
      params.windowDays,
    );
    const kinds = (params.kinds ?? null) as string[] | null;
    const kindFilterAgg = kinds
      ? Prisma.sql`AND a.kind = ANY(${kinds}::text[])`
      : Prisma.empty;
    const kindFilterFresh = kinds
      ? Prisma.sql`AND s.kind = ANY(${kinds}::text[])`
      : Prisma.empty;
    const actorFilterAgg = actorId
      ? Prisma.sql`AND a.actor_id = ${actorId}::uuid`
      : Prisma.empty;
    const actorFilterFresh = actorId
      ? Prisma.sql`AND s.actor_id = ${actorId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { entity_id: string; demand_score: number }[]
    >`
      WITH agg AS (
        SELECT
          COALESCE(r.to_entity_id, a.subject_id) AS entity_id,
          a.actor_id,
          SUM(
            a.signal_count * ${this.dayRecencySql(Prisma.sql`(${todayKey}::date - a.day)`)}
          )::float8 AS acts
        FROM signal_demand_daily a
        LEFT JOIN entity_redirects r ON r.from_entity_id = a.subject_id
        WHERE a.place_id IS NULL
          AND a.subject_id IS NOT NULL
          AND a.day >= ${sinceDayKey}::date
          AND a.day < ${todayKey}::date
          ${kindFilterAgg}
          ${actorFilterAgg}
          AND COALESCE(r.to_entity_id, a.subject_id) = ANY(${params.entityIds}::uuid[])
        GROUP BY 1, 2
      ),
      fresh_acts AS (
        SELECT
          COALESCE(r.to_entity_id, s.subject_id) AS entity_id,
          s.actor_id,
          ${DEDUPE_KEY_SQL} AS dedupe_key,
          MAX(${EVENT_COUNT_SQL})::float8 AS acts
        FROM signals s
        LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
        WHERE s.subject_id IS NOT NULL
          AND s.occurred_at >= ${todayStart}
          ${kindFilterFresh}
          ${actorFilterFresh}
          AND COALESCE(r.to_entity_id, s.subject_id) = ANY(${params.entityIds}::uuid[])
        GROUP BY 1, 2, 3
      ),
      fresh AS (
        SELECT entity_id, actor_id, SUM(acts) AS acts
        FROM fresh_acts
        GROUP BY 1, 2
      ),
      by_actor AS (
        SELECT entity_id, actor_id, SUM(acts) AS acts
        FROM (
          SELECT * FROM agg
          UNION ALL
          SELECT * FROM fresh
        ) u
        GROUP BY 1, 2
      )
      SELECT
        entity_id,
        SUM(LN(1 + acts) / LN(2))::float8 AS demand_score
      FROM by_actor
      GROUP BY entity_id
    `;
    return new Map(
      rows.map((row) => [row.entity_id, Number(row.demand_score)]),
    );
  }

  /**
   * Global (unscoped) query demand for search-term subjects — the query-
   * suggestion substrate. Aggregate for completed days + fresh ledger today.
   */
  async queryDemand(params: QueryDemandParams): Promise<QueryDemandRow[]> {
    const prefix = params.prefix?.trim().toLowerCase() ?? '';
    const keys = (params.keys ?? [])
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    if (!prefix && !keys.length) {
      return [];
    }
    const { todayKey, sinceDayKey, todayStart } = this.windowKeys(
      params.windowDays,
    );
    const aggTextFilter = keys.length
      ? Prisma.sql`AND a.subject_text = ANY(${keys}::text[])`
      : Prisma.sql`AND a.subject_text LIKE ${`${this.escapeLike(prefix)}%`}`;
    const freshTextFilter = keys.length
      ? Prisma.sql`AND s.subject_text = ANY(${keys}::text[])`
      : Prisma.sql`AND s.subject_text LIKE ${`${this.escapeLike(prefix)}%`}`;
    const rows = await this.prisma.$queryRaw<
      {
        query_key: string;
        distinct_actors: bigint;
        signal_count: number;
        demand_score: number;
        last_used: Date;
      }[]
    >`
      WITH agg AS (
        SELECT
          a.subject_text AS query_key,
          a.actor_id,
          SUM(
            a.signal_count * ${this.dayRecencySql(Prisma.sql`(${todayKey}::date - a.day)`)}
          )::float8 AS acts,
          SUM(a.signal_count)::float8 AS raw_count,
          MAX(a.last_occurred_at) AS last_used
        FROM signal_demand_daily a
        WHERE a.place_id IS NULL
          AND a.kind = 'search'
          AND a.subject_text IS NOT NULL
          AND a.day >= ${sinceDayKey}::date
          AND a.day < ${todayKey}::date
          ${aggTextFilter}
        GROUP BY 1, 2
      ),
      fresh_acts AS (
        SELECT
          s.subject_text AS query_key,
          s.actor_id,
          ${DEDUPE_KEY_SQL} AS dedupe_key,
          MAX(${EVENT_COUNT_SQL})::float8 AS acts,
          MAX(s.occurred_at) AS last_used
        FROM signals s
        WHERE s.kind = 'search'
          AND s.subject_text IS NOT NULL
          AND s.occurred_at >= ${todayStart}
          ${freshTextFilter}
        GROUP BY 1, 2, 3
      ),
      fresh AS (
        SELECT query_key, actor_id, SUM(acts) AS acts, SUM(acts) AS raw_count,
               MAX(last_used) AS last_used
        FROM fresh_acts
        GROUP BY 1, 2
      ),
      by_actor AS (
        SELECT query_key, actor_id, SUM(acts) AS acts,
               SUM(raw_count) AS raw_count, MAX(last_used) AS last_used
        FROM (
          SELECT * FROM agg
          UNION ALL
          SELECT * FROM fresh
        ) u
        GROUP BY 1, 2
      )
      SELECT
        query_key,
        COUNT(DISTINCT actor_id)::bigint AS distinct_actors,
        SUM(raw_count)::float8 AS signal_count,
        SUM(LN(1 + acts) / LN(2))::float8 AS demand_score,
        MAX(last_used) AS last_used
      FROM by_actor
      GROUP BY query_key
      ORDER BY demand_score DESC, last_used DESC
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      queryKey: row.query_key,
      distinctActors: Number(row.distinct_actors),
      signalCount: Number(row.signal_count),
      demandScore: Number(row.demand_score),
      lastUsed: row.last_used,
    }));
  }

  /**
   * One user's own recent search queries (recency-first — the recent-searches
   * lane). Pure ledger read: the personal lane wants exact acts, not day
   * buckets.
   */
  async personalQueryRows(
    userId: string,
    params: { prefix: string; windowDays: number; limit: number },
  ): Promise<PersonalQueryRow[]> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const prefix = params.prefix.trim().toLowerCase();
    const since = new Date(Date.now() - params.windowDays * MS_PER_DAY);
    const rows = await this.prisma.$queryRaw<
      { query_key: string; signal_count: bigint; last_used: Date }[]
    >`
      SELECT
        s.subject_text AS query_key,
        COUNT(DISTINCT ${DEDUPE_KEY_SQL})::bigint AS signal_count,
        MAX(s.occurred_at) AS last_used
      FROM signals s
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'search'
        AND s.subject_text IS NOT NULL
        AND s.occurred_at >= ${since}
        AND s.subject_text LIKE ${`${this.escapeLike(prefix)}%`}
      GROUP BY s.subject_text
      ORDER BY last_used DESC, signal_count DESC
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      queryKey: row.query_key,
      signalCount: Number(row.signal_count),
      lastUsed: row.last_used,
    }));
  }

  /** Per-key personal usage counts for already-selected suggestion keys. */
  async personalQueryCounts(
    userId: string,
    keys: string[],
    windowDays: number,
  ): Promise<Map<string, number>> {
    const normalizedKeys = keys
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    if (!normalizedKeys.length) {
      return new Map();
    }
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return new Map();
    }
    const since = new Date(Date.now() - windowDays * MS_PER_DAY);
    const rows = await this.prisma.$queryRaw<
      { query_key: string; signal_count: bigint }[]
    >`
      SELECT
        s.subject_text AS query_key,
        COUNT(DISTINCT ${DEDUPE_KEY_SQL})::bigint AS signal_count
      FROM signals s
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'search'
        AND s.subject_text = ANY(${normalizedKeys}::text[])
        AND s.occurred_at >= ${since}
      GROUP BY s.subject_text
    `;
    return new Map(
      rows.map((row) => [row.query_key, Number(row.signal_count)]),
    );
  }

  /**
   * Recently-viewed restaurants: entity_view acts grouped by redirect-
   * resolved subject; the frozen history contract plus the latest view's
   * locationId.
   */
  async recentlyViewedRestaurants(
    userId: string,
    params: { prefix?: string | null; limit: number },
  ): Promise<RecentlyViewedRestaurantRow[]> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const prefix = params.prefix?.trim() ?? '';
    const prefixFilter = prefix
      ? Prisma.sql`AND e.name ILIKE ${`${this.escapeLike(prefix)}%`}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        restaurant_id: string;
        restaurant_name: string;
        city: string | null;
        region: string | null;
        last_viewed_at: Date;
        view_count: number;
        location_id: string | null;
      }[]
    >`
      SELECT
        e.entity_id AS restaurant_id,
        e.name AS restaurant_name,
        e.city,
        e.region,
        MAX(s.occurred_at) AS last_viewed_at,
        SUM(${EVENT_COUNT_SQL})::int AS view_count,
        (ARRAY_AGG(s.meta->>'locationId' ORDER BY s.occurred_at DESC))[1] AS location_id
      FROM signals s
      LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
      JOIN core_entities e
        ON e.entity_id = COALESCE(r.to_entity_id, s.subject_id)
       AND e.type = 'restaurant'
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'entity_view'
        AND s.subject_id IS NOT NULL
        ${prefixFilter}
      GROUP BY e.entity_id, e.name, e.city, e.region
      ORDER BY last_viewed_at DESC
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      city: row.city,
      region: row.region,
      lastViewedAt: row.last_viewed_at,
      viewCount: Number(row.view_count),
      locationId: row.location_id,
    }));
  }

  /**
   * Recently-viewed foods, grouped by the viewed CONNECTION (the dish at a
   * restaurant — the same grain the old user_food_views table kept).
   */
  async recentlyViewedFoods(
    userId: string,
    params: { prefix?: string | null; limit: number },
  ): Promise<RecentlyViewedFoodRow[]> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const prefix = params.prefix?.trim() ?? '';
    const prefixFilter = prefix
      ? Prisma.sql`AND f.name ILIKE ${`${this.escapeLike(prefix)}%`}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        connection_id: string;
        food_id: string;
        food_name: string;
        restaurant_id: string;
        restaurant_name: string;
        last_viewed_at: Date;
        view_count: number;
        location_id: string | null;
      }[]
    >`
      WITH viewed AS (
        SELECT
          (s.meta->>'connectionId')::uuid AS connection_id,
          MAX(s.occurred_at) AS last_viewed_at,
          SUM(${EVENT_COUNT_SQL})::int AS view_count,
          (ARRAY_AGG(s.meta->>'locationId' ORDER BY s.occurred_at DESC))[1] AS location_id
        FROM signals s
        WHERE s.actor_id = ${actorId}::uuid
          AND s.kind = 'entity_view'
          AND s.meta->>'connectionId' IS NOT NULL
        GROUP BY 1
      )
      SELECT
        v.connection_id,
        c.food_id,
        f.name AS food_name,
        c.restaurant_id,
        rr.name AS restaurant_name,
        v.last_viewed_at,
        v.view_count,
        v.location_id
      FROM viewed v
      JOIN core_restaurant_items c ON c.connection_id = v.connection_id
      JOIN core_entities f ON f.entity_id = c.food_id
      JOIN core_entities rr ON rr.entity_id = c.restaurant_id
      WHERE TRUE ${prefixFilter}
      ORDER BY v.last_viewed_at DESC
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      connectionId: row.connection_id,
      foodId: row.food_id,
      foodName: row.food_name,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      lastViewedAt: row.last_viewed_at,
      viewCount: Number(row.view_count),
      locationId: row.location_id,
    }));
  }

  /** Per-restaurant view stats for a candidate set (autocomplete affinity). */
  async restaurantViewStats(
    userId: string,
    restaurantIds: string[],
  ): Promise<RestaurantViewStatsRow[]> {
    if (!restaurantIds.length) {
      return [];
    }
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      { restaurant_id: string; last_viewed_at: Date; view_count: number }[]
    >`
      SELECT
        COALESCE(r.to_entity_id, s.subject_id) AS restaurant_id,
        MAX(s.occurred_at) AS last_viewed_at,
        SUM(${EVENT_COUNT_SQL})::int AS view_count
      FROM signals s
      LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'entity_view'
        AND s.subject_id IS NOT NULL
        AND COALESCE(r.to_entity_id, s.subject_id) = ANY(${restaurantIds}::uuid[])
      GROUP BY 1
    `;
    return rows.map((row) => ({
      restaurantId: row.restaurant_id,
      lastViewedAt: row.last_viewed_at,
      viewCount: Number(row.view_count),
    }));
  }

  /** Name-prefix matches among one user's viewed restaurants (autocomplete
   *  "viewed" suggestion lane). */
  async viewedRestaurantNameMatches(
    userId: string,
    prefix: string,
    limit: number,
  ): Promise<ViewedRestaurantNameMatch[]> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const normalizedPrefix = prefix.trim();
    if (!normalizedPrefix) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      {
        restaurant_id: string;
        name: string;
        aliases: string[] | null;
        last_viewed_at: Date;
      }[]
    >`
      SELECT
        e.entity_id AS restaurant_id,
        e.name,
        e.aliases,
        MAX(s.occurred_at) AS last_viewed_at
      FROM signals s
      LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id
      JOIN core_entities e
        ON e.entity_id = COALESCE(r.to_entity_id, s.subject_id)
       AND e.type = 'restaurant'
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'entity_view'
        AND s.subject_id IS NOT NULL
        AND e.name ILIKE ${`${this.escapeLike(normalizedPrefix)}%`}
      GROUP BY e.entity_id, e.name, e.aliases
      ORDER BY last_viewed_at DESC
      LIMIT ${Math.max(1, limit)}
    `;
    return rows.map((row) => ({
      restaurantId: row.restaurant_id,
      name: row.name,
      aliases: row.aliases ?? [],
    }));
  }

  /**
   * The §4 recency kernel at DAY granularity as SQL over an integer age-in-
   * days expression: flat through the current cycle, then halving every
   * half-life (the same K1 constants the demand-mass kernel states).
   */
  private dayRecencySql(ageDays: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      CASE
        WHEN GREATEST(0, ${ageDays}) <= ${RECENCY_FLAT_DAYS} THEN 1.0
        ELSE power(0.5, (GREATEST(0, ${ageDays}) - ${RECENCY_FLAT_DAYS}) / ${DEMAND_HALF_LIFE_DAYS}::float8)
      END`;
  }

  private async resolveActorId(
    userId: string | null | undefined,
  ): Promise<string | null> {
    if (!userId) {
      return null;
    }
    try {
      const actor = await this.prisma.signalActor.findUnique({
        where: { userId },
        select: { actorId: true },
      });
      return actor?.actorId ?? null;
    } catch (error) {
      this.logger.debug('Actor lookup failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private windowKeys(windowDays: number): {
    todayKey: string;
    sinceDayKey: string;
    todayStart: Date;
  } {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const since = new Date(
      todayStart.getTime() - Math.max(1, windowDays) * MS_PER_DAY,
    );
    return {
      todayKey: todayStart.toISOString().slice(0, 10),
      sinceDayKey: since.toISOString().slice(0, 10),
      todayStart,
    };
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }
}
