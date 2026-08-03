import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import type { SignalKind } from './signals.service';
import { freshSignalAttributionSql } from './ground-containment';
import { utcInstantSql } from './sql-instant';
import {
  redirectJoinSql,
  resolvedSubjectSql,
  subjectMatchesSql,
} from './subject-identity';
import { dayRecencySql } from '../polls/supply/poll-supply.constants';
import {
  DEDUPE_KEY_SQL,
  EVENT_COUNT_SQL,
  dailyActsCteSql,
} from './act-identity';
import { ECHO_SIGNAL_KINDS } from './signals.service';

// freshFirstOccurrenceSql DELETED (docket #6): the fresh ledger arm it
// gated is gone — the aggregate's window-wide dedupe is the only dedupe.

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

export interface RecentSearchRow {
  /** Normalized (lowercased at write) query term — see the reader note. */
  queryText: string;
  lastSearchedAt: Date;
  /** Redirect-resolved entity the search resolved to (may be null). */
  resolvedEntityId: string | null;
  /** core_entities.type of the resolved entity, as text. */
  resolvedEntityType: string | null;
  /** core_entities.name of the resolved entity. */
  resolvedEntityName: string | null;
  /** TRUE when the submit carried an explicit autocomplete selection (a
   *  companion autocomplete_selection act shares the searchRequestId). */
  explicitSelection: boolean;
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

export interface TerritoryEntityDemandRow {
  entityId: string;
  entityType: string;
  entityName: string;
  demandScore: number;
  distinctActors: number;
  lastSeenAt: Date | null;
}

export interface TerritoryEntityTrendRow {
  currentActs: number;
  previousActs: number;
}

export interface TerritoryUnmetAskRow {
  term: string;
  entityType: string;
  entityId: string | null;
  reason: string;
  distinctUserCount: number;
  demandScore: number;
  resultRestaurantCount: number | null;
  resultFoodCount: number | null;
  lastSeenAt: Date;
  askCount: number;
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
   * the aggregate alone (docket #6: it includes today at the 15-min rebuild
   * cadence), redirects at read.
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
    // Red-team 3c: sargable subject filter — expand requested ids with their
    // redirect sources app-side, probe subject_id = ANY(expanded), fold back
    // to survivors via the same one-hop COALESCE.
    const expandedIds = await this.expandWithRedirectSources(params.entityIds);
    const { todayKey, sinceDayKey } = this.windowKeys(params.windowDays);
    const kinds = (params.kinds ?? null) as string[] | null;
    const kindFilterAgg = kinds
      ? Prisma.sql`AND a.kind = ANY(${kinds}::text[])`
      : Prisma.empty;
    const actorFilterAgg = actorId
      ? Prisma.sql`AND a.actor_id = ${actorId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { entity_id: string; demand_score: number }[]
    >`
      WITH agg AS (
        SELECT
          ${resolvedSubjectSql('a')} AS entity_id,
          a.actor_id,
          SUM(
            a.signal_count * ${dayRecencySql(Prisma.sql`(${todayKey}::date - a.day)`)}
          )::float8 AS acts
        FROM signal_demand_daily a
        ${redirectJoinSql('a')}
        WHERE a.place_id IS NULL
          AND a.subject_id = ANY(${expandedIds}::uuid[])
          -- Docket #6: the aggregate INCLUDES today (15-min cadence = freshness);
          -- the fresh ledger arm — the law's second dialect — is deleted.
          AND a.day >= ${sinceDayKey}::date
          ${kindFilterAgg}
          ${actorFilterAgg}
          AND ${resolvedSubjectSql('a')} = ANY(${params.entityIds}::uuid[])
        GROUP BY 1, 2
      ),
      by_actor AS (
        SELECT entity_id, actor_id, SUM(acts) AS acts
        FROM agg
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
   *
   * RATIFIED 2026-07-19 (owner docket item 8): CACHED reveals COUNT — demand
   * measures people, not serving tiers; meta.cached stays a read-time
   * qualifier any future reader may judge differently, and act-identity
   * dedupe guards the replay path.
   */
  async queryDemand(params: QueryDemandParams): Promise<QueryDemandRow[]> {
    const prefix = params.prefix?.trim().toLowerCase() ?? '';
    const keys = (params.keys ?? [])
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    if (!prefix && !keys.length) {
      return [];
    }
    const { todayKey, sinceDayKey } = this.windowKeys(params.windowDays);
    const aggTextFilter = keys.length
      ? Prisma.sql`AND a.subject_text = ANY(${keys}::text[])`
      : Prisma.sql`AND a.subject_text LIKE ${`${this.escapeLike(prefix)}%`}`;
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
            a.signal_count * ${dayRecencySql(Prisma.sql`(${todayKey}::date - a.day)`)}
          )::float8 AS acts,
          SUM(a.signal_count)::float8 AS raw_count,
          MAX(a.last_occurred_at) AS last_used
        FROM signal_demand_daily a
        WHERE a.place_id IS NULL
          AND a.kind = 'search'
          AND a.subject_text IS NOT NULL
          -- Docket #6: the aggregate INCLUDES today (15-min cadence = freshness);
          -- the fresh ledger arm — the law's second dialect — is deleted.
          AND a.day >= ${sinceDayKey}::date
          ${aggTextFilter}
        GROUP BY 1, 2
      ),
      by_actor AS (
        SELECT query_key, actor_id, SUM(acts) AS acts,
               SUM(raw_count) AS raw_count, MAX(last_used) AS last_used
        FROM agg
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
        AND s.occurred_at >= ${utcInstantSql(since)}
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
        AND s.occurred_at >= ${utcInstantSql(since)}
      GROUP BY s.subject_text
    `;
    return new Map(
      rows.map((row) => [row.query_key, Number(row.signal_count)]),
    );
  }

  /**
   * One user's recent searches for the /search/recent endpoint (red-team 2a):
   * distinct query terms, newest first, each carrying the entity the search
   * resolved to (the ledger's subject_id — the old endpoint's
   * submissionContext.selectedEntityId when the submit carried one, else the
   * primary resolved target; identical preference order by construction of
   * the search-signal write). Entity identity resolves through
   * entity_redirects at read.
   *
   * CASING NOTE: subject_text is normalized (lowercased) at write — the §3
   * term column. The old endpoint echoed the raw-cased query; raw casing is
   * not in the ledger, so this returns the lowercased term — consistent with
   * the suggestion lanes, which made the same trade.
   */
  async recentSearches(
    userId: string,
    limit: number,
  ): Promise<RecentSearchRow[]> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      {
        query_text: string;
        last_searched_at: Date;
        resolved_entity_id: string | null;
        resolved_entity_type: string | null;
        resolved_entity_name: string | null;
        explicit_selection: boolean;
      }[]
    >`
      WITH latest AS (
        SELECT
          s.subject_text AS query_text,
          MAX(s.occurred_at) AS last_searched_at,
          -- The newest act that resolved an entity supplies the selection
          -- (the old endpoint backfilled a missing selection from older
          -- rows of the same query the same way).
          (ARRAY_AGG(s.subject_id ORDER BY s.occurred_at DESC)
             FILTER (WHERE s.subject_id IS NOT NULL))[1] AS subject_id,
          (ARRAY_AGG(s.meta->>'searchRequestId' ORDER BY s.occurred_at DESC)
             FILTER (WHERE s.meta->>'searchRequestId' IS NOT NULL))[1] AS request_id
        FROM signals s
        WHERE s.actor_id = ${actorId}::uuid
          AND s.kind = 'search'
          AND s.subject_text IS NOT NULL
        GROUP BY s.subject_text
        ORDER BY last_searched_at DESC
        LIMIT ${Math.max(1, limit)}
      )
      SELECT
        l.query_text,
        l.last_searched_at,
        e.entity_id AS resolved_entity_id,
        e.type::text AS resolved_entity_type,
        e.name AS resolved_entity_name,
        EXISTS (
          SELECT 1 FROM signals a
          WHERE a.actor_id = ${actorId}::uuid
            AND a.kind = 'autocomplete_selection'
            AND a.meta->>'searchRequestId' = l.request_id
        ) AS explicit_selection
      FROM latest l
      ${redirectJoinSql('l')}
      LEFT JOIN core_entities e
        ON e.entity_id = ${resolvedSubjectSql('l')}
      ORDER BY l.last_searched_at DESC
    `;
    return rows.map((row) => ({
      queryText: row.query_text,
      lastSearchedAt: row.last_searched_at,
      resolvedEntityId: row.resolved_entity_id,
      resolvedEntityType: row.resolved_entity_type,
      resolvedEntityName: row.resolved_entity_name,
      explicitSelection: Boolean(row.explicit_selection),
    }));
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
      ${redirectJoinSql('s')}
      JOIN core_entities e
        ON e.entity_id = ${resolvedSubjectSql('s')}
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
   *
   * MERGE LAW (red-team 2b): the signal's meta.connectionId is immutable, but
   * entity merges DELETE folded loser connections. The join therefore resolves
   * per act: the recorded connection when it still exists, else the SURVIVING
   * connection reached by resolving the signal's food (subject_id) and serving
   * restaurant (meta.contextRestaurantId) through entity_redirects. A merged
   * food's old views appear under the survivor; acts landing on the same
   * surviving connection fold into one row.
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
      WITH acts AS (
        SELECT
          (s.meta->>'connectionId')::uuid AS raw_connection_id,
          s.subject_id,
          (s.meta->>'contextRestaurantId')::uuid AS ctx_restaurant_id,
          s.occurred_at,
          ${EVENT_COUNT_SQL} AS view_count,
          s.meta->>'locationId' AS location_id
        FROM signals s
        WHERE s.actor_id = ${actorId}::uuid
          AND s.kind = 'entity_view'
          AND s.meta->>'connectionId' IS NOT NULL
      ),
      resolved AS (
        SELECT
          a.occurred_at,
          a.view_count,
          a.location_id,
          COALESCE(direct.connection_id, survivor.connection_id) AS connection_id
        FROM acts a
        LEFT JOIN core_restaurant_items direct
          ON direct.connection_id = a.raw_connection_id
        ${redirectJoinSql('a', 'rf')}
        ${redirectJoinSql('a', 'rr', 'ctx_restaurant_id')}
        LEFT JOIN core_restaurant_items survivor
          ON direct.connection_id IS NULL
         AND survivor.food_id = ${resolvedSubjectSql('a', 'rf')}
         AND survivor.restaurant_id = ${resolvedSubjectSql('a', 'rr', 'ctx_restaurant_id')}
      ),
      viewed AS (
        SELECT
          connection_id,
          MAX(occurred_at) AS last_viewed_at,
          SUM(view_count)::int AS view_count,
          (ARRAY_AGG(location_id ORDER BY occurred_at DESC))[1] AS location_id
        FROM resolved
        WHERE connection_id IS NOT NULL
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

  /**
   * Phase C (history writer cut): the 2-min repeat-view dedupe valve reads the
   * LEDGER — the latest entity_view act by this user on this subject (for
   * foods, on this connection via meta.connectionId). The old
   * user_restaurant_views/user_food_views rows that used to carry
   * lastViewedAt are dropped.
   */
  async lastEntityViewAt(
    userId: string,
    params: { entityId: string; connectionId?: string | null },
  ): Promise<Date | null> {
    const actorId = await this.resolveActorId(userId);
    if (!actorId) {
      return null;
    }
    const connectionFilter = params.connectionId
      ? Prisma.sql`AND s.meta->>'connectionId' = ${params.connectionId}`
      : Prisma.empty;
    // THE READER THAT FORGOT (F202). This filtered `s.subject_id = $1` raw,
    // so after a merge the repeat-view dedupe valve stopped seeing the loser
    // id's history and re-recorded a view it had already seen. Identity is
    // resolved at read, by the one builder, like every other reader here.
    const rows = await this.prisma.$queryRaw<{ last_viewed_at: Date }[]>`
      SELECT MAX(s.occurred_at) AS last_viewed_at
      FROM signals s
      ${redirectJoinSql('s')}
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'entity_view'
        AND ${subjectMatchesSql('s', Prisma.sql`${params.entityId}::uuid`)}
        ${connectionFilter}
    `;
    return rows[0]?.last_viewed_at ?? null;
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
        ${resolvedSubjectSql('s')} AS restaurant_id,
        MAX(s.occurred_at) AS last_viewed_at,
        SUM(${EVENT_COUNT_SQL})::int AS view_count
      FROM signals s
      ${redirectJoinSql('s')}
      WHERE s.actor_id = ${actorId}::uuid
        AND s.kind = 'entity_view'
        AND s.subject_id IS NOT NULL
        AND ${resolvedSubjectSql('s')} = ANY(${restaurantIds}::uuid[])
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
      ${redirectJoinSql('s')}
      JOIN core_entities e
        ON e.entity_id = ${resolvedSubjectSql('s')}
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
   * §3 ENGINE-territory entity demand — the collector's demand input (C3:
   * demand reaches collection ONLY through the signals ledger/aggregate).
   * Territory = the caller-derived place set (engine members + DAG
   * descendants).
   *
   * CONTAINMENT READ (red-team 3a): the aggregate stores O(few) rows per
   * signal (smallest containing place + coarsest contained tiling), so the
   * territory read expands the requested places with their DAG ANCESTORS —
   * §3's "each distinct ancestor row ONCE for the whole engine" — and
   * MAX-dedupes acts per (actor, subject, day) across all matched places (a
   * signal stored at both an ancestor and a member counts once; §3 SET
   * semantics at aggregate grain).
   * RATIFIED 2026-07-19 (owner docket item 7): containment + ancestors at
   * weight 1 is THE territory read algebra. A coarse signal (West-Texas-wide
   * search stored at TX — no finer containing node yet) reaches an
   * Austin-anchored engine through the TX row; the imprecision is accepted
   * as SELF-HEALING (organic probes grow finer nodes, coarse signals tile
   * finer). Consequence: the poll-supply swap onto this algebra is a
   * MANDATED unification leg, not an optimization — the intersection reader
   * retires there.
   *
   * Kinds are deliberately unfiltered (self-provisioning, uniform K2 weight
   * 1.0); the kernel is the ONE §4 demand-mass law. Entity identity resolves
   * through redirects at read.
   */
  async territoryEntityDemand(params: {
    placeIds: string[];
    windowDays: number;
    limit: number;
    entityTypes: string[];
  }): Promise<TerritoryEntityDemandRow[]> {
    if (!params.placeIds.length) {
      return [];
    }
    const aggPlaceIds = await this.expandPlaceIdsWithAncestors(params.placeIds);
    const { todayKey, sinceDayKey } = this.windowKeys(params.windowDays);
    const rows = await this.prisma.$queryRaw<
      {
        entity_id: string;
        entity_type: string;
        entity_name: string;
        demand_score: number;
        distinct_actors: bigint;
        last_seen_at: Date | null;
      }[]
    >`
      -- THE §4 daily-acts statement (act-identity.ts). This arm once omitted
      -- the echo exclusion and the entity-subject filter and left kind out of
      -- the grain, collapsing every kind of a day into one MAX — a different
      -- score than the demand-mass reader produced for the same entity on the
      -- same day, and this is the one the collector's territory read uses to
      -- decide what gets enriched.
      WITH agg AS (${dailyActsCteSql({
        dimensions: [
          {
            expr: resolvedSubjectSql('a'),
            as: 'entity_id',
          },
        ],
        from: Prisma.sql`signal_demand_daily a
          ${redirectJoinSql('a')}`,
        where: Prisma.sql`a.place_id = ANY(${aggPlaceIds}::uuid[])`,
        extraAggregates: Prisma.sql`MAX(a.last_occurred_at) AS last_seen_at`,
        actsAlias: 'day_acts',
        echoKinds: ECHO_SIGNAL_KINDS,
        sinceDayKey,
        subjectScope: 'entity',
      })}),
      -- The agg CTE is now per-KIND, so a day's acts SUM across kinds before the
      -- recency weight is applied — two kinds on one day are two acts.
      by_day AS (
        SELECT
          entity_id,
          actor_id,
          day,
          SUM(day_acts)::float8 AS day_acts,
          MAX(last_seen_at) AS last_seen_at
        FROM agg
        GROUP BY 1, 2, 3
      ),
      by_actor AS (
        SELECT
          entity_id,
          actor_id,
          SUM(
            day_acts * ${dayRecencySql(Prisma.sql`(${todayKey}::date - day)`)}
          )::float8 AS acts,
          MAX(last_seen_at) AS last_seen_at
        FROM by_day
        GROUP BY 1, 2
      ),
      scored AS (
        SELECT
          entity_id,
          SUM(LN(1 + acts) / LN(2))::float8 AS demand_score,
          COUNT(DISTINCT actor_id)::bigint AS distinct_actors,
          MAX(last_seen_at) AS last_seen_at
        FROM by_actor
        GROUP BY entity_id
      )
      SELECT
        s.entity_id,
        e.type::text AS entity_type,
        e.name AS entity_name,
        s.demand_score,
        s.distinct_actors,
        s.last_seen_at
      FROM scored s
      JOIN core_entities e ON e.entity_id = s.entity_id
      WHERE e.type::text = ANY(${params.entityTypes}::text[])
      ORDER BY s.demand_score DESC, s.last_seen_at DESC NULLS LAST
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      entityId: row.entity_id,
      entityType: row.entity_type,
      entityName: row.entity_name,
      demandScore: Number(row.demand_score),
      distinctActors: Number(row.distinct_actors),
      lastSeenAt: row.last_seen_at,
    }));
  }

  /**
   * §11 UNMET family input — user-expressed collection gaps
   * (kind = 'on_demand_ask') read by ENGINE TERRITORY (Phase C: replaced the
   * engine-name-keyed collection_on_demand_ask_events read). Territory
   * membership is the §2.5(c) containment law against the member places —
   * freshSignalAttributionSql on the ONE ground, no prefilter (P2: the
   * predicates ride the geometry GiST). Meta qualifiers (reason,
   * entityType, result counts) are judged at read; the two ask sites of one
   * search share meta.askSearchRequestId and collapse to one ask per
   * (request, term). Entity identity resolves through redirects at read.
   */
  async territoryUnmetAsks(params: {
    placeIds: string[];
    since: Date;
    limit: number;
  }): Promise<TerritoryUnmetAskRow[]> {
    if (!params.placeIds.length) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      {
        term: string;
        entity_type: string;
        entity_id: string | null;
        reason: string;
        distinct_user_count: bigint;
        demand_score: number;
        result_restaurant_count: number | null;
        result_food_count: number | null;
        last_seen_at: Date;
        ask_count: bigint;
      }[]
    >`
      WITH asks AS (
        SELECT DISTINCT
          s.signal_id,
          s.subject_text AS term,
          COALESCE(s.meta->>'entityType', '') AS entity_type,
          ${resolvedSubjectSql('s')} AS entity_id,
          COALESCE(s.meta->>'reason', '') AS reason,
          s.actor_id,
          COALESCE(s.meta->>'askSearchRequestId', s.signal_id::text) AS ask_key,
          (s.meta->>'resultRestaurantCount')::int AS result_restaurant_count,
          (s.meta->>'resultFoodCount')::int AS result_food_count,
          s.occurred_at
        FROM signals s
        ${redirectJoinSql('s')}
        JOIN places p ON p.place_id = ANY(${params.placeIds}::uuid[])
        WHERE s.kind = 'on_demand_ask'
          AND s.occurred_at >= ${utcInstantSql(params.since)}
          AND s.subject_text IS NOT NULL
          AND s.meta->>'reason' IN ('unresolved', 'low_result')
          -- P2 red-team F5 (2026-07-30): no separate prefilter — the law's
          -- own PK probes short-circuit on the cached geometry bbox.
          AND (${freshSignalAttributionSql('p')})
      ),
      per_request AS (
        -- One ask per (request, term, ...): the two ask sites of a single
        -- search collapse here (§3 judge-at-read).
        SELECT
          term, entity_type, entity_id, reason, actor_id, ask_key,
          MIN(result_restaurant_count) AS result_restaurant_count,
          MIN(result_food_count) AS result_food_count,
          MAX(occurred_at) AS last_seen_at
        FROM asks
        GROUP BY 1, 2, 3, 4, 5, 6
      ),
      per_actor AS (
        SELECT
          term, entity_type, entity_id, reason, actor_id,
          COUNT(*)::float8 AS ask_count,
          MIN(result_restaurant_count) AS result_restaurant_count,
          MIN(result_food_count) AS result_food_count,
          MAX(last_seen_at) AS last_seen_at
        FROM per_request
        GROUP BY 1, 2, 3, 4, 5
      )
      SELECT
        term,
        entity_type,
        entity_id,
        reason,
        COUNT(*)::bigint AS distinct_user_count,
        SUM(LN(1 + ask_count) / LN(2))::float8 AS demand_score,
        MIN(result_restaurant_count)::int AS result_restaurant_count,
        MIN(result_food_count)::int AS result_food_count,
        MAX(last_seen_at) AS last_seen_at,
        SUM(ask_count)::bigint AS ask_count
      FROM per_actor
      GROUP BY term, entity_type, entity_id, reason
      ORDER BY demand_score DESC, last_seen_at DESC
      LIMIT ${Math.max(1, params.limit)}
    `;
    return rows.map((row) => ({
      term: row.term,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      distinctUserCount: Number(row.distinct_user_count),
      demandScore: Number(row.demand_score),
      resultRestaurantCount: row.result_restaurant_count,
      resultFoodCount: row.result_food_count,
      lastSeenAt: row.last_seen_at,
      askCount: Number(row.ask_count),
    }));
  }

  /**
   * Two-window territory act totals per entity (explore's trend factor):
   * current window vs the preceding window of equal length.
   */
  async territoryEntityTrend(params: {
    placeIds: string[];
    entityIds: string[];
    trendWindowDays: number;
  }): Promise<Map<string, TerritoryEntityTrendRow>> {
    if (!params.placeIds.length || !params.entityIds.length) {
      return new Map();
    }
    // Same containment-read expansion (red-team 3a) + sargable subject filter
    // (red-team 3c) as territoryEntityDemand / entityDemandScores.
    const [aggPlaceIds, expandedIds] = await Promise.all([
      this.expandPlaceIdsWithAncestors(params.placeIds),
      this.expandWithRedirectSources(params.entityIds),
    ]);
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const currentSince = new Date(
      todayStart.getTime() - params.trendWindowDays * MS_PER_DAY,
    );
    const previousSince = new Date(
      todayStart.getTime() - params.trendWindowDays * 2 * MS_PER_DAY,
    );
    const currentKey = currentSince.toISOString().slice(0, 10);
    const previousKey = previousSince.toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<
      { entity_id: string; current_acts: number; previous_acts: number }[]
    >`
      WITH deduped AS (
        SELECT
          ${resolvedSubjectSql('a')} AS entity_id,
          a.actor_id,
          a.day,
          MAX(a.signal_count)::float8 AS day_acts
        FROM signal_demand_daily a
        ${redirectJoinSql('a')}
        WHERE a.place_id = ANY(${aggPlaceIds}::uuid[])
          AND a.subject_id = ANY(${expandedIds}::uuid[])
          AND a.day >= ${previousKey}::date
          AND ${resolvedSubjectSql('a')} = ANY(${params.entityIds}::uuid[])
        GROUP BY 1, 2, 3
      )
      SELECT
        entity_id,
        COALESCE(SUM(day_acts) FILTER (WHERE day >= ${currentKey}::date), 0)::float8
          AS current_acts,
        COALESCE(SUM(day_acts) FILTER (WHERE day < ${currentKey}::date), 0)::float8
          AS previous_acts
      FROM deduped
      GROUP BY entity_id
    `;
    return new Map(
      rows.map((row) => [
        row.entity_id,
        {
          currentActs: Number(row.current_acts),
          previousActs: Number(row.previous_acts),
        },
      ]),
    );
  }

  /**
   * GLOBAL-tile demand per entity (place_id NULL — every signal once) for the
   * explore family's local-specialization factor.
   */
  async globalEntityDemand(params: {
    entityIds: string[];
    windowDays: number;
  }): Promise<Map<string, number>> {
    if (!params.entityIds.length) {
      return new Map();
    }
    // Red-team 3c: sargable subject filter (see entityDemandScores).
    const expandedIds = await this.expandWithRedirectSources(params.entityIds);
    const { todayKey, sinceDayKey } = this.windowKeys(params.windowDays);
    const rows = await this.prisma.$queryRaw<
      { entity_id: string; demand_score: number }[]
    >`
      WITH by_actor AS (
        SELECT
          ${resolvedSubjectSql('a')} AS entity_id,
          a.actor_id,
          SUM(
            a.signal_count * ${dayRecencySql(Prisma.sql`(${todayKey}::date - a.day)`)}
          )::float8 AS acts
        FROM signal_demand_daily a
        ${redirectJoinSql('a')}
        WHERE a.place_id IS NULL
          AND a.subject_id = ANY(${expandedIds}::uuid[])
          -- Docket #6: the aggregate INCLUDES today (15-min cadence = freshness);
          -- the fresh ledger arm — the law's second dialect — is deleted.
          AND a.day >= ${sinceDayKey}::date
          AND ${resolvedSubjectSql('a')} = ANY(${params.entityIds}::uuid[])
        GROUP BY 1, 2
      )
      SELECT entity_id, SUM(LN(1 + acts) / LN(2))::float8 AS demand_score
      FROM by_actor
      GROUP BY entity_id
    `;
    return new Map(
      rows.map((row) => [row.entity_id, Number(row.demand_score)]),
    );
  }

  /**
   * Red-team 3c: requested (survivor) entity ids plus every redirect SOURCE
   * pointing at them — one indexed entity_redirects lookup. The SQL filters
   * raw subject_id against this superset (sargable) and re-applies the exact
   * one-hop COALESCE fold-back against the REQUESTED ids, so semantics are
   * unchanged.
   */
  private async expandWithRedirectSources(
    entityIds: string[],
  ): Promise<string[]> {
    if (!entityIds.length) {
      return [];
    }
    // AN UNDER-COUNTED DEMAND SCORE IS NOT A DEGRADED ANSWER, IT IS A WRONG
    // ONE (audit 2026-08-02, F207). This used to catch and return the
    // UNEXPANDED input, which silently drops every merged entity's history
    // from the score — and the only trace was a `logger.debug`. The expansion
    // is not an optimisation: the SQL's fold-back COALESCE is semantically
    // complete only over the expanded set, so a failed expansion changes the
    // ANSWER. It throws; the CALLER decides (skip the cycle, fail the
    // request), because that policy belongs at the call site.
    const sources = await this.prisma.entityRedirect.findMany({
      where: { toEntityId: { in: entityIds } },
      select: { fromEntityId: true },
    });
    return Array.from(
      new Set([...entityIds, ...sources.map((row) => row.fromEntityId)]),
    );
  }

  /**
   * Red-team 3a (containment read): the requested places plus every DAG
   * ancestor (transitive parent_place_ids walk). Coarse-stored aggregate rows
   * (a statewide signal's one TX row) reach member places through their
   * ancestors at weight 1; MAX-dedup at the call sites keeps each act counted
   * once.
   */
  private async expandPlaceIdsWithAncestors(
    placeIds: string[],
  ): Promise<string[]> {
    if (!placeIds.length) {
      return [];
    }
    // Same law as expandWithRedirectSources: the ancestor rows are
    // load-bearing ("a coarse signal stored at TX reaches an Austin engine
    // through the TX row"), so dropping them returns a smaller number with no
    // indication it is smaller. It throws (F207).
    const rows = await this.prisma.$queryRaw<{ place_id: string }[]>`
        WITH RECURSIVE lineage AS (
          SELECT p.place_id, p.parent_place_ids
          FROM places p
          WHERE p.place_id = ANY(${placeIds}::uuid[])
          UNION
          SELECT p.place_id, p.parent_place_ids
          FROM places p
          JOIN lineage l ON p.place_id = ANY(l.parent_place_ids)
        )
        SELECT place_id FROM lineage
      `;
    const expanded = new Set(placeIds);
    for (const row of rows) {
      expanded.add(row.place_id);
    }
    return Array.from(expanded);
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
    };
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }
}
