import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntityScope, FilterClause, QueryPlan } from './dto/search-query.dto';
import type { SearchExecutionDirectives } from './search-execution-directives';

// §16 K3 (operational guard, not a result cap — and NOT the §7-deleted 50k
// viewport LIMIT, which capped RESULTS): the lean open-now candidate query
// (id + hours only) must fetch the WHOLE ranked set so JS openness
// evaluation runs before pagination — the same unbounded-within-viewport
// stance the map coverage layer takes. This literal only bounds a
// pathological query's scan; real viewport candidate sets sit orders of
// magnitude below it, so list openness == map openness in practice. What
// changes it: never tuning — only a proven pathological-scan incident.
const OPEN_NOW_CANDIDATE_CAP = 50000;

export interface BuildRestaurantQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
  searchCenter?: { lat: number; lng: number } | null;
  topDishesLimit?: number;
  excludeRestaurantIds?: string[];
  directives?: SearchExecutionDirectives;
  // PHASE 2 (open-now two-phase hydrate): restrict the rich query to a pre-selected page of
  // restaurant ids, preserving their given order (array_position). When set, the caller has
  // already computed the open page via the candidate query below, so the rich query just
  // hydrates those rows. Undefined ⇒ the query is byte-identical to before.
  restrictToRestaurantIds?: string[];
  // PHASE 1 (open-now two-phase candidates): also emit a LEAN query (restaurant_id + hours,
  // same conditions + ranking, NO page limit) so the executor can resolve openness over the
  // full candidate set and paginate the OPEN subset. Off by default ⇒ zero overhead.
  includeCandidateSql?: boolean;
}

interface BuildRestaurantQueryResult {
  dataSql: Prisma.Sql;
  countSql: Prisma.Sql;
  // The Phase-1 lean candidate query — null unless includeCandidateSql was requested.
  candidateSql: Prisma.Sql | null;
  preview: string;
  metadata: {
    boundsApplied: boolean;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
}

interface BuildDishQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
  searchCenter?: { lat: number; lng: number } | null;
  excludeConnectionIds?: string[];
  directives?: SearchExecutionDirectives;
}

interface BuildDishQueryResult {
  dataSql: Prisma.Sql;
  countSql: Prisma.Sql;
  preview: string;
  metadata: {
    boundsApplied: boolean;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
}

interface BoundsPayload {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
}

// Screen-accurate viewport polygon (the visible quad, pitch/twist-aware), as [lng, lat] pairs.
// When present it REPLACES the AABB bounds for filtering: we derive the polygon's bbox as a cheap
// btree-index pre-filter (a superset that drops nothing inside the polygon) and then ST_Covers the
// exact polygon — so results are exactly what's on screen, not the larger north-up box.
type PolygonPayload = Array<[number, number]>;

interface PriceFilterPayload {
  priceLevels: number[];
}

interface MinimumVotesPayload extends Record<string, unknown> {
  minimumVotes?: number | null;
}

interface ParsedFilters {
  restaurantIds: string[];
  connectionIds: string[];
  restaurantAttributeIds: string[];
  foodIds: string[];
  foodTextExpansionIds: string[];
  foodAttributeIds: string[];
  ingredientIds: string[];
  excludedIngredientIds: string[];
  foodAttributePrimary: boolean;
  boundsPayload: BoundsPayload | null;
  polygonPayload: PolygonPayload | null;
  priceLevels: number[];
  minimumVotes: number | null;
}

interface ClauseWithPreview {
  sql: Prisma.Sql;
  preview: string;
}

interface MatchClauseWithPreview extends ClauseWithPreview {
  hasConditions: boolean;
}

@Injectable()
export class SearchQueryBuilder {
  /**
   * Build restaurant query (Query A) - Top restaurants with LATERAL JOIN for top dishes
   */
  buildRestaurantQuery(
    options: BuildRestaurantQueryOptions,
  ): BuildRestaurantQueryResult {
    const {
      plan,
      pagination,
      searchCenter,
      topDishesLimit = 3,
      excludeRestaurantIds = [],
      directives,
      restrictToRestaurantIds,
      includeCandidateSql = false,
    } = options;
    const restrictIds =
      restrictToRestaurantIds && restrictToRestaurantIds.length
        ? restrictToRestaurantIds
        : null;
    const filters = this.parseFilters(plan, directives);

    // Build restaurant conditions (restaurant IDs / restaurant attributes / price)
    const { sql: restaurantWhereSql, preview: restaurantWherePreview } =
      this.buildRestaurantConditions(filters, {
        includeRestaurantAttributes: false,
      });

    // Require at least one item row OR by-name praise event (mirrors the Crave
    // Score v3 inclusion floor: a restaurant is eligible if it has catalogued
    // dishes OR is praised by name). The INNER join to v3 scores still excludes
    // truly-empty restaurants (no items, no events). Restaurant/entity filters
    // can widen match eligibility.
    const inventoryExistsSql = Prisma.sql`(EXISTS (
      SELECT 1
      FROM core_restaurant_items c
      WHERE c.restaurant_id = r.entity_id
    ) OR EXISTS (
      SELECT 1
      FROM core_restaurant_events ev
      WHERE ev.restaurant_id = r.entity_id
    ))`;
    const inventoryExistsPreview =
      '(EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = r.entity_id) OR EXISTS (SELECT 1 FROM core_restaurant_events ev WHERE ev.restaurant_id = r.entity_id))';

    const connectionMatch = this.buildConnectionMatchConditions(filters);
    const { sql: connectionMatchSql } = connectionMatch;
    const {
      sql: restaurantAttributeMatchSql,
      preview: restaurantAttributeMatchPreview,
    } = this.buildRestaurantAttributeMatchConditions(filters);
    const signalMatch =
      this.buildRestaurantEntitySignalMatchConditions(filters);
    const { sql: itemOrSignalMatchSql, preview: itemOrSignalMatchPreview } =
      this.buildRestaurantItemOrSignalMatchConditions(
        connectionMatch,
        signalMatch,
      );
    const connectionEvidenceExistsSql = connectionMatch.hasConditions
      ? Prisma.sql`EXISTS (
          SELECT 1
          FROM core_restaurant_items c
          WHERE c.restaurant_id = rr.restaurant_id
            AND ${connectionMatchSql}
        )`
      : Prisma.sql`FALSE`;
    const signalEvidenceExistsSql = signalMatch.hasConditions
      ? Prisma.sql`COALESCE(tm.has_signal_match, FALSE)`
      : Prisma.sql`FALSE`;

    const excludeRestaurantsSql = excludeRestaurantIds.length
      ? Prisma.sql`AND NOT (${this.buildInClause(
          'r.entity_id',
          excludeRestaurantIds,
        )})`
      : Prisma.sql``;
    const excludeRestaurantsPreview = excludeRestaurantIds.length
      ? `AND NOT (r.entity_id = ANY(${this.formatUuidArray(
          excludeRestaurantIds,
        )}))`
      : '';

    // PHASE 2: restrict eligibility to the pre-selected open page. The candidate query
    // already applied every other condition, so this is a pure id membership narrow.
    const restrictRestaurantsSql = restrictIds
      ? Prisma.sql`AND (${this.buildInClause('r.entity_id', restrictIds)})`
      : Prisma.sql``;
    const restrictRestaurantsPreview = restrictIds
      ? `AND (r.entity_id = ANY(${this.formatUuidArray(restrictIds)}))`
      : '';

    const combinedRestaurantWhereSql = Prisma.sql`${restaurantWhereSql} AND ${inventoryExistsSql} AND ${restaurantAttributeMatchSql} AND ${itemOrSignalMatchSql} ${excludeRestaurantsSql} ${restrictRestaurantsSql}`;
    const combinedRestaurantWherePreview =
      `${restaurantWherePreview} AND ${inventoryExistsPreview} AND ${restaurantAttributeMatchPreview} AND ${itemOrSignalMatchPreview} ${excludeRestaurantsPreview} ${restrictRestaurantsPreview}`.trim();

    // Build location conditions (bounds)
    const {
      sql: locationWhereSql,
      preview: locationWherePreview,
      boundsApplied,
    } = this.buildLocationConditions(filters);

    // Build minimum votes condition for restaurant totals
    const minimumVotesApplied = filters.minimumVotes !== null;

    // Build CTEs
    const restaurantCte = this.buildFilteredRestaurantsCte(
      combinedRestaurantWhereSql,
      combinedRestaurantWherePreview,
    );
    const geographicRestaurantsCte = this.buildGeographicRestaurantsCte(
      locationWhereSql,
      locationWherePreview,
    );

    const filteredLocationsCte = this.buildFilteredLocationsCte(
      locationWhereSql,
      locationWherePreview,
    );

    const { sql: selectedOrderSql, preview: selectedOrderPreview } =
      this.buildDistanceOrder(searchCenter, 'fl');

    const selectedLocationsCte = this.buildSelectedLocationsCte(
      selectedOrderSql,
      selectedOrderPreview,
    );

    const restaurantVoteTotalsCte = this.buildRestaurantVoteTotalsCte();
    const geographicRestaurantVoteTotalsCte =
      this.buildGeographicRestaurantVoteTotalsCte();
    const publicRestaurantScoresCte = this.buildPublicRestaurantScoresCte();
    const publicConnectionScoresCte = this.buildPublicConnectionScoresCte();

    const locationAggregatesCte = this.buildLocationAggregatesCte(searchCenter);

    // Build minimum votes where clause for main query
    const minimumVotesWhereSql = filters.minimumVotes
      ? Prisma.sql`WHERE COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`
      : Prisma.sql``;
    const minimumVotesWherePreview = filters.minimumVotes
      ? `WHERE COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`
      : '';

    const restaurantOrder = this.resolveRestaurantOrderSql(
      plan.ranking.restaurantOrder,
    );
    // SECTIONED RELEVANCY (restaurant axis): a restaurant serving ≥1 EXACT-match
    // dish is tier 0; widened-only restaurants tier 1. Same grouping-not-blending
    // contract as the dish list.
    const restExactIds = directives?.sectionedRanking
      ? (directives.exactFoodIds ?? [])
      : [];
    const restTierExpr = restExactIds.length
      ? Prisma.sql`CASE WHEN EXISTS (
          SELECT 1 FROM core_restaurant_items ce
          WHERE ce.restaurant_id = fr.entity_id
            AND ce.food_id = ANY(${restExactIds}::uuid[])
        ) THEN 0 ELSE 1 END`
      : null;
    const restTierSelect = restTierExpr
      ? Prisma.sql`${restTierExpr} AS match_tier,`
      : Prisma.sql`NULL::int AS match_tier,`;
    const restTierOrder = restTierExpr
      ? Prisma.sql`${restTierExpr} ASC, `
      : Prisma.sql``;
    const restTierOrderPreview = restTierExpr ? 'match_tier ASC, ' : '';
    const restaurantTopDishOrder = this.resolveTopDishOrderSql(
      plan.ranking.foodOrder,
    );
    const restaurantTopDishRankOrder = this.resolveTopDishRankOrderSql(
      plan.ranking.foodOrder,
    );

    // PHASE 2: when hydrating a pre-selected page, preserve the order the candidate query
    // ranked them in (array_position over the id list) rather than re-deriving the ranking.
    const rankedRestaurantsOrderSql = restrictIds
      ? Prisma.sql`array_position(${restrictIds}::uuid[], fr.entity_id)`
      : Prisma.sql`${restTierOrder}${restaurantOrder.sql}`;
    const rankedRestaurantsOrderPreview = restrictIds
      ? `array_position('{...}'::uuid[], fr.entity_id)`
      : `${restTierOrderPreview}${restaurantOrder.preview}`;

    // Build the ranked restaurants CTE with LATERAL JOIN for top dishes
    const rankedRestaurantsCte = Prisma.sql`
ranked_restaurants AS (
  SELECT
    fr.entity_id AS restaurant_id,
    ${restTierSelect}
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    fr.restaurant_metadata,
    fr.price_level,
    fr.price_level_updated_at,
    prs.display_score AS crave_score,
    prs.percentile_rank AS crave_score_exact,
    prs.rising,
    prs.score_info,
    'restaurant'::text AS score_subject_type,
    fr.entity_id AS score_subject_id,
    COALESCE(rvt.total_upvotes, 0) AS total_upvotes,
    COALESCE(rvt.total_mentions, 0) AS total_mentions,
    sl.location_id,
    sl.google_place_id,
    sl.latitude,
    sl.longitude,
    sl.address,
    sl.city,
    sl.region,
    sl.country,
    sl.postal_code,
    sl.phone_number,
    sl.website_url,
    sl.hours,
    sl.utc_offset_minutes,
    sl.time_zone,
    sl.is_primary,
    sl.last_polled_at,
    sl.created_at AS location_created_at,
    sl.updated_at AS location_updated_at,
    la.locations_json,
    la.location_count
  FROM filtered_restaurants fr
  JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
	  ${minimumVotesWhereSql}
	  ORDER BY ${rankedRestaurantsOrderSql}
	  OFFSET ${pagination.skip}
	  LIMIT ${pagination.take}
	)`;

    const rankedRestaurantsCtePreview = `
ranked_restaurants AS (
  SELECT fr.entity_id AS restaurant_id, fr.name AS restaurant_name, fr.aliases AS restaurant_aliases,
         fr.restaurant_metadata,
         fr.price_level, fr.price_level_updated_at,
         prs.display_score AS crave_score, prs.percentile_rank AS crave_score_exact, prs.rising, prs.score_info,
         'restaurant'::text AS score_subject_type, fr.entity_id AS score_subject_id,
         COALESCE(rvt.total_upvotes, 0) AS total_upvotes, COALESCE(rvt.total_mentions, 0) AS total_mentions,
         sl.location_id, sl.google_place_id, sl.latitude, sl.longitude, sl.address, sl.city, sl.region, sl.country, sl.postal_code, sl.phone_number, sl.website_url, sl.hours, sl.utc_offset_minutes, sl.time_zone, sl.is_primary, sl.last_polled_at, sl.created_at AS location_created_at, sl.updated_at AS location_updated_at,
         la.locations_json, la.location_count
  FROM filtered_restaurants fr
  JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
	  ${minimumVotesWherePreview}
	  ORDER BY ${rankedRestaurantsOrderPreview}
	  OFFSET ${pagination.skip} LIMIT ${pagination.take}
	)`.trim();

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${restaurantCte.sql},
  ${geographicRestaurantsCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${geographicRestaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${locationAggregatesCte.sql},
  ${rankedRestaurantsCte}
`;

    const withPreview = `WITH
  ${restaurantCte.preview},
  ${geographicRestaurantsCte.preview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
  ${geographicRestaurantVoteTotalsCte.preview},
  ${publicRestaurantScoresCte.preview},
  ${publicConnectionScoresCte.preview},
  ${locationAggregatesCte.preview},
  ${rankedRestaurantsCtePreview}`;

    // Final SELECT with LATERAL JOIN for top dishes
    const dataSql = Prisma.sql`
${withClause}
SELECT
  rr.*,
  COALESCE(td.top_dishes, '[]'::json) AS top_dishes,
  COALESCE(td.total_dish_count, 0)::int AS total_dish_count,
  COALESCE(tm.matched_tags, '[]'::json) AS matched_tags,
  CASE
    WHEN ${connectionEvidenceExistsSql} AND ${signalEvidenceExistsSql} THEN 'mixed'
    WHEN ${signalEvidenceExistsSql} THEN 'tag_signal'
    WHEN ${connectionEvidenceExistsSql} THEN 'connection'
    ELSE NULL
  END AS match_evidence_type,
  (COALESCE(td.total_dish_count, 0) > 0) AS has_menu_items
FROM ranked_restaurants rr
LEFT JOIN LATERAL (
  SELECT
	    json_agg(
	      json_build_object(
	        'connectionId', sub.connection_id,
	        'foodId', sub.food_id,
	        'foodName', sub.food_name,
	        'craveScore', sub.crave_score,
	        'scoreSubjectType', 'connection',
	        'scoreSubjectId', sub.connection_id,
	        'rising', sub.rising,
	        'scoreInfo', sub.score_info
	      )
      ORDER BY ${restaurantTopDishOrder.sql}, sub.connection_id ASC
	    ) FILTER (WHERE sub.rn <= ${topDishesLimit}) AS top_dishes,
	    COUNT(*)::int AS total_dish_count
	  FROM (
	    SELECT
		      c.connection_id,
		      c.food_id,
		      f.name AS food_name,
		      c.total_upvotes,
	      c.mention_count,
		      pcs.display_score AS crave_score,
		      pcs.rising,
		      pcs.score_info,
		      ROW_NUMBER() OVER (ORDER BY ${restaurantTopDishRankOrder.sql}) AS rn
	    FROM core_restaurant_items c
	    JOIN core_entities f ON f.entity_id = c.food_id
	    JOIN public_connection_scores pcs
	      ON pcs.subject_id = c.connection_id
    WHERE c.restaurant_id = rr.restaurant_id
      AND ${connectionMatchSql}
  ) sub
) td ON true
LEFT JOIN LATERAL (
  SELECT
    json_agg(
      json_build_object(
        'entityId', tag_rows.entity_id,
        'name', tag_rows.name,
        'entityType', tag_rows.entity_type,
        'mentionCount', tag_rows.mention_count
      )
      ORDER BY tag_rows.mention_count DESC, tag_rows.name ASC
    ) AS matched_tags,
    COUNT(*)::int > 0 AS has_signal_match
  FROM (
    SELECT
      res.entity_id,
      res.entity_type,
      res.mention_count,
      e.name
    FROM core_restaurant_entity_signals res
    JOIN core_entities e ON e.entity_id = res.entity_id
    WHERE res.restaurant_id = rr.restaurant_id
      AND ${signalMatch.sql}
    ORDER BY res.mention_count DESC, e.name ASC
    LIMIT 5
  ) tag_rows
) tm ON ${signalMatch.hasConditions ? Prisma.sql`TRUE` : Prisma.sql`FALSE`}`;

    const countSql = Prisma.sql`
WITH
  ${restaurantCte.sql},
	  ${geographicRestaurantsCte.sql},
	  ${filteredLocationsCte.sql},
	  ${selectedLocationsCte.sql},
	  ${restaurantVoteTotalsCte.sql},
	  ${publicRestaurantScoresCte.sql}
	SELECT COUNT(DISTINCT fr.entity_id)::bigint AS total_restaurants
	FROM filtered_restaurants fr
	JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
	JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
	LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	${minimumVotesWhereSql}`;

    // PHASE 1 (open-now): the LEAN candidate query. Same conditions, CTEs, and ranking as the
    // rich list query, but selects only restaurant_id + hours (no LATERAL dish/tag joins) and
    // is NOT page-limited (capped for safety). The executor evaluates openness over this full
    // ranked set, then hydrates the open page via the rich query (restrictToRestaurantIds).
    const candidateSql = includeCandidateSql
      ? Prisma.sql`
WITH
  ${restaurantCte.sql},
  ${geographicRestaurantsCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ranked_candidates AS (
    SELECT
      fr.entity_id AS restaurant_id,
      sl.hours,
      sl.utc_offset_minutes,
      sl.time_zone
    FROM filtered_restaurants fr
    JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
    JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
    LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
    ${minimumVotesWhereSql}
    ORDER BY ${restTierOrder}${restaurantOrder.sql}
    LIMIT ${OPEN_NOW_CANDIDATE_CAP}
  )
SELECT restaurant_id, hours, utc_offset_minutes, time_zone
FROM ranked_candidates`
      : null;

    const preview = `
${withPreview}
SELECT rr.*, COALESCE(td.top_dishes, '[]') AS top_dishes, COALESCE(td.total_dish_count, 0) AS total_dish_count, COALESCE(tm.matched_tags, '[]') AS matched_tags, CASE WHEN ... THEN 'mixed' END AS match_evidence_type, (COALESCE(td.total_dish_count, 0) > 0) AS has_menu_items
FROM ranked_restaurants rr
LEFT JOIN LATERAL (...top dishes subquery with LIMIT ${topDishesLimit}...) td ON true
LEFT JOIN LATERAL (...matched tags subquery with LIMIT 5...) tm ON ${
      signalMatch.hasConditions ? 'true' : 'false'
    }`.trim();

    return {
      dataSql,
      countSql,
      candidateSql,
      preview,
      metadata: {
        boundsApplied,
        priceFilterApplied: filters.priceLevels.length > 0,
        minimumVotesApplied,
      },
    };
  }

  /**
   * Build dish query (Query B) - Top dishes with restaurant data for map pins
   */
  buildDishQuery(options: BuildDishQueryOptions): BuildDishQueryResult {
    const {
      plan,
      pagination,
      searchCenter,
      excludeConnectionIds = [],
      directives,
    } = options;
    const filters = this.parseFilters(plan, directives);

    // For dish query, we apply restaurant constraints (IDs, restaurant attributes, price) and connection constraints.
    const { sql: restaurantWhereSql, preview: restaurantWherePreview } =
      this.buildRestaurantConditions(filters);

    // Build location conditions (bounds)
    const {
      sql: locationWhereSql,
      preview: locationWherePreview,
      boundsApplied,
    } = this.buildLocationConditions(filters);

    // Build connection conditions (food entity search)
    const {
      sql: connectionWhereSql,
      preview: connectionWherePreview,
      minimumVotesApplied,
    } = this.buildConnectionConditions(filters);

    const excludeConnectionsSql = excludeConnectionIds.length
      ? Prisma.sql`AND NOT (${this.buildInClause(
          'c.connection_id',
          excludeConnectionIds,
        )})`
      : Prisma.sql``;
    const excludeConnectionsPreview = excludeConnectionIds.length
      ? `AND NOT (c.connection_id = ANY(${this.formatUuidArray(
          excludeConnectionIds,
        )}))`
      : '';

    const combinedConnectionWhereSql = Prisma.sql`${connectionWhereSql} ${excludeConnectionsSql}`;
    const combinedConnectionWherePreview =
      `${connectionWherePreview} ${excludeConnectionsPreview}`.trim();

    // Build CTEs
    const restaurantCte = Prisma.sql`
filtered_restaurants AS (
  SELECT
    r.entity_id,
    r.name,
    r.aliases,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${restaurantWhereSql}
)`;

    const restaurantCtePreview = `
filtered_restaurants AS (
  SELECT r.entity_id, r.name, r.aliases, r.restaurant_attributes, r.restaurant_metadata, r.price_level, r.price_level_updated_at
  FROM core_entities r
  WHERE ${restaurantWherePreview}
)`.trim();

    const filteredLocationsCte = this.buildFilteredLocationsCte(
      locationWhereSql,
      locationWherePreview,
    );
    const geographicRestaurantsCte = this.buildGeographicRestaurantsCte(
      locationWhereSql,
      locationWherePreview,
    );

    const { sql: selectedOrderSql, preview: selectedOrderPreview } =
      this.buildDistanceOrder(searchCenter, 'fl');

    const selectedLocationsCte = this.buildSelectedLocationsCte(
      selectedOrderSql,
      selectedOrderPreview,
    );

    const restaurantVoteTotalsCte = this.buildRestaurantVoteTotalsCte();
    const geographicRestaurantVoteTotalsCte =
      this.buildGeographicRestaurantVoteTotalsCte();
    const publicRestaurantScoresCte = this.buildPublicRestaurantScoresCte();
    const publicConnectionScoresCte = this.buildPublicConnectionScoresCte();

    // Build filtered connections CTE with restaurant data for map pins
    const filteredConnectionsCte = Prisma.sql`
filtered_connections AS (
  SELECT
    c.connection_id,
    c.restaurant_id,
    c.food_id,
    c.categories,
    c.food_attributes,
    c.mention_count,
    c.total_upvotes,
    c.last_mentioned_at,
    pcs.display_score AS connection_crave_score,
    pcs.percentile_rank AS connection_crave_score_exact,
    pcs.rising AS connection_rising,
    pcs.score_info AS connection_score_info,
    'connection'::text AS score_subject_type,
    c.connection_id AS score_subject_id,
    f.name AS food_name,
    f.aliases AS food_aliases,
    -- Restaurant data for map pins
    fr.entity_id AS restaurant_entity_id,
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    prs.display_score AS restaurant_crave_score,
    prs.percentile_rank AS restaurant_crave_score_exact,
    prs.rising AS restaurant_rising,
    prs.score_info AS restaurant_score_info,
    fr.price_level AS restaurant_price_level,
    fr.price_level_updated_at AS restaurant_price_level_updated_at,
    -- Location data for map pins
    sl.location_id,
    sl.google_place_id,
    sl.latitude,
    sl.longitude,
    sl.address,
    sl.city,
    sl.hours,
    sl.utc_offset_minutes,
    sl.time_zone
  FROM core_restaurant_items c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN public_restaurant_scores prs
    ON prs.subject_id = fr.entity_id
  JOIN public_connection_scores pcs
    ON pcs.subject_id = c.connection_id
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${combinedConnectionWhereSql}
)`;

    const filteredConnectionsCtePreview = `
filtered_connections AS (
  SELECT c.connection_id, c.restaurant_id, c.food_id, c.categories, c.food_attributes, c.mention_count, c.total_upvotes, c.last_mentioned_at,
         pcs.display_score AS connection_crave_score, pcs.percentile_rank AS connection_crave_score_exact, pcs.rising AS connection_rising, pcs.score_info AS connection_score_info,
         'connection'::text AS score_subject_type, c.connection_id AS score_subject_id,
         f.name AS food_name, f.aliases AS food_aliases,
         fr.entity_id AS restaurant_entity_id, fr.name AS restaurant_name, fr.aliases AS restaurant_aliases,
         prs.display_score AS restaurant_crave_score, prs.percentile_rank AS restaurant_crave_score_exact, prs.rising AS restaurant_rising, prs.score_info AS restaurant_score_info,
         fr.price_level AS restaurant_price_level, fr.price_level_updated_at AS restaurant_price_level_updated_at,
         sl.location_id, sl.google_place_id, sl.latitude, sl.longitude, sl.address, sl.city, sl.hours, sl.utc_offset_minutes, sl.time_zone
  FROM core_restaurant_items c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
  JOIN public_connection_scores pcs ON pcs.subject_id = c.connection_id
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${combinedConnectionWherePreview}
)`.trim();

    const order = this.resolveDishOrderSql(plan.ranking.foodOrder);

    // SECTIONED RELEVANCY: exact-match rows (tier 0) rank before widened rows
    // (tier 1 — siblings/categories/lexical), pure Crave Score WITHIN each tier;
    // every row carries match_tier so the client can draw the section divider.
    const exactIds = directives?.sectionedRanking
      ? (directives.exactFoodIds ?? [])
      : [];
    const tierSelectSql = exactIds.length
      ? Prisma.sql`, CASE WHEN fc.food_id = ANY(${exactIds}::uuid[]) THEN 0 ELSE 1 END AS match_tier`
      : Prisma.sql`, NULL::int AS match_tier`;
    const tierOrderSql = exactIds.length
      ? Prisma.sql`CASE WHEN fc.food_id = ANY(${exactIds}::uuid[]) THEN 0 ELSE 1 END ASC, `
      : Prisma.sql``;
    const tierOrderPreview = exactIds.length ? 'match_tier ASC, ' : '';

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${restaurantCte},
  ${geographicRestaurantsCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${geographicRestaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${filteredConnectionsCte}
`;

    const withPreview = `WITH
  ${restaurantCtePreview},
  ${geographicRestaurantsCte.preview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
  ${geographicRestaurantVoteTotalsCte.preview},
  ${publicRestaurantScoresCte.preview},
  ${publicConnectionScoresCte.preview},
  ${filteredConnectionsCtePreview}`;

    const dataSql = Prisma.sql`
${withClause}
SELECT *${tierSelectSql}
FROM filtered_connections fc
ORDER BY ${tierOrderSql}${order.sql}
OFFSET ${pagination.skip}
LIMIT ${pagination.take}`;

    const countSql = Prisma.sql`
${withClause}
SELECT
  COUNT(*)::bigint AS total_connections,
  COUNT(DISTINCT fc.restaurant_id)::bigint AS total_restaurants
FROM filtered_connections fc`;

    const preview = `
${withPreview}
SELECT *
FROM filtered_connections fc
ORDER BY ${tierOrderPreview}${order.preview}
OFFSET ${pagination.skip}
LIMIT ${pagination.take};`.trim();

    return {
      dataSql,
      countSql,
      preview,
      metadata: {
        boundsApplied,
        priceFilterApplied: filters.priceLevels.length > 0,
        minimumVotesApplied,
      },
    };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private parseFilters(
    plan: QueryPlan,
    directives?: SearchExecutionDirectives,
  ): ParsedFilters {
    const connectionFilters = plan.connectionFilters ?? [];

    return {
      restaurantIds: this.collectEntityIds(
        plan.restaurantFilters,
        EntityScope.RESTAURANT,
      ),
      connectionIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.CONNECTION,
      ),
      restaurantAttributeIds: this.collectEntityIds(
        plan.restaurantFilters,
        EntityScope.RESTAURANT_ATTRIBUTE,
      ),
      foodIds: this.collectEntityIds(connectionFilters, EntityScope.FOOD),
      foodTextExpansionIds: directives?.primaryFoodAttributeTextFoodIds ?? [],
      foodAttributeIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.FOOD_ATTRIBUTE,
      ),
      // The INGREDIENT scope carries two lanes on one entityType — the clause
      // payload's `exclude` flag is the discriminator (include = recall union,
      // exclude = conservative NOT; see buildEffectiveIngredientsClause).
      ingredientIds: this.collectEntityIds(
        connectionFilters.filter((filter) => filter.payload?.exclude !== true),
        EntityScope.INGREDIENT,
      ),
      excludedIngredientIds: this.collectEntityIds(
        connectionFilters.filter((filter) => filter.payload?.exclude === true),
        EntityScope.INGREDIENT,
      ),
      foodAttributePrimary: Boolean(directives?.primaryFoodAttributeQuery),
      boundsPayload: this.extractBoundsPayload(plan.restaurantFilters),
      polygonPayload: this.extractPolygonPayload(plan.restaurantFilters),
      priceLevels: this.extractPriceLevels(plan.restaurantFilters),
      minimumVotes: this.extractMinimumVotes(connectionFilters),
    };
  }

  private buildRestaurantConditions(
    filters: ParsedFilters,
    options?: { includeRestaurantAttributes?: boolean },
  ): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const includeRestaurantAttributes =
      options?.includeRestaurantAttributes ?? true;
    const conditions: Prisma.Sql[] = [Prisma.sql`r.type = 'restaurant'`];
    const conditionPreview: string[] = [`r.type = 'restaurant'`];

    if (filters.restaurantIds.length) {
      conditions.push(this.buildInClause('r.entity_id', filters.restaurantIds));
      conditionPreview.push(
        `r.entity_id = ANY(${this.formatUuidArray(filters.restaurantIds)})`,
      );
    }

    if (includeRestaurantAttributes && filters.restaurantAttributeIds.length) {
      conditions.push(
        this.buildArrayOverlapClause(
          'r.restaurant_attributes',
          filters.restaurantAttributeIds,
        ),
      );
      conditionPreview.push(
        `r.restaurant_attributes && ${this.formatUuidArray(
          filters.restaurantAttributeIds,
        )}`,
      );
    }

    if (filters.priceLevels.length) {
      conditions.push(
        this.buildNumberInClause('r.price_level', filters.priceLevels),
      );
      conditionPreview.push(
        `r.price_level = ANY(${this.formatNumberArray(filters.priceLevels)})`,
      );
    }

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
    };
  }

  private buildRestaurantAttributeMatchConditions(
    filters: ParsedFilters,
  ): ClauseWithPreview {
    if (!filters.restaurantAttributeIds.length) {
      return { sql: Prisma.sql`TRUE`, preview: 'TRUE' };
    }

    const directMatchSql = this.buildArrayOverlapClause(
      'r.restaurant_attributes',
      filters.restaurantAttributeIds,
    );
    const signalMatchSql = Prisma.sql`EXISTS (
      SELECT 1
      FROM core_restaurant_entity_signals res
      WHERE res.restaurant_id = r.entity_id
        AND ${this.buildInClause(
          'res.entity_id',
          filters.restaurantAttributeIds,
        )}
    )`;

    return {
      sql: Prisma.sql`((${directMatchSql}) OR (${signalMatchSql}))`,
      preview: `((r.restaurant_attributes && ${this.formatUuidArray(
        filters.restaurantAttributeIds,
      )}) OR (EXISTS (SELECT 1 FROM core_restaurant_entity_signals res WHERE res.restaurant_id = r.entity_id AND res.entity_id = ANY(${this.formatUuidArray(
        filters.restaurantAttributeIds,
      )}))))`,
    };
  }

  private buildLocationConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
    boundsApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];
    let boundsApplied = false;

    if (filters.polygonPayload && filters.polygonPayload.length >= 3) {
      // SCREEN-ACCURATE viewport filter. The polygon (pitch/twist-aware visible quad) is the source
      // of truth. We derive its bbox as a cheap btree-index pre-filter (a superset of the polygon, so
      // it drops nothing inside it), then ST_Covers the EXACT polygon to remove the off-screen corners
      // the old AABB-only filter let through. Mirrors the proven market ST_Covers/ST_MakePoint pattern.
      const polygon = filters.polygonPayload;
      const lngs = polygon.map(([lng]) => lng);
      const lats = polygon.map(([, lat]) => lat);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      // Closed ring (first point repeated) for ST_MakePolygon.
      const ring = [...polygon, polygon[0]];
      const ringPoints = Prisma.join(
        ring.map(
          ([lng, lat]) =>
            Prisma.sql`ST_MakePoint(${lng}::double precision, ${lat}::double precision)`,
        ),
        ', ',
      );
      conditions.push(Prisma.sql`rl.latitude BETWEEN ${minLat} AND ${maxLat}`);
      conditions.push(Prisma.sql`rl.longitude BETWEEN ${minLng} AND ${maxLng}`);
      conditions.push(Prisma.sql`ST_Covers(
        ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${ringPoints}])), 4326),
        ST_SetSRID(
          ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision),
          4326
        )
      )`);
      conditionPreview.push(
        `viewport polygon ST_Covers (${polygon.length} pts) within bbox [${minLng.toFixed(
          4,
        )},${minLat.toFixed(4)}]–[${maxLng.toFixed(4)},${maxLat.toFixed(4)}]`,
      );
      boundsApplied = true;
    } else if (filters.boundsPayload) {
      conditions.push(
        Prisma.sql`rl.latitude BETWEEN ${filters.boundsPayload.southWest.lat} AND ${filters.boundsPayload.northEast.lat}`,
      );
      conditions.push(
        Prisma.sql`rl.longitude BETWEEN ${filters.boundsPayload.southWest.lng} AND ${filters.boundsPayload.northEast.lng}`,
      );
      conditionPreview.push(
        `rl.latitude BETWEEN ${filters.boundsPayload.southWest.lat} AND ${filters.boundsPayload.northEast.lat}`,
      );
      conditionPreview.push(
        `rl.longitude BETWEEN ${filters.boundsPayload.southWest.lng} AND ${filters.boundsPayload.northEast.lng}`,
      );
      boundsApplied = true;
    }

    // The viewport IS the geographic query (master plan §7): no market filter
    // exists here — results are whatever the polygon/bounds admit, worldwide.

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
      boundsApplied,
    };
  }

  private buildConnectionConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
    minimumVotesApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];
    let minimumVotesApplied = false;

    // First-class inbound connection filter (favorites dish lists hydrate exact
    // connection IDs). Mirrors the excludeConnectionIds column + ANY style.
    if (filters.connectionIds.length) {
      conditions.push(
        this.buildInClause('c.connection_id', filters.connectionIds),
      );
      conditionPreview.push(
        `c.connection_id = ANY(${this.formatUuidArray(filters.connectionIds)})`,
      );
    }

    const shouldOrPrimaryFoodAttributeEvidence =
      filters.foodAttributePrimary &&
      filters.foodAttributeIds.length > 0 &&
      filters.foodTextExpansionIds.length > 0 &&
      filters.foodIds.length === 0;
    if (shouldOrPrimaryFoodAttributeEvidence) {
      const attributeClause = this.buildArrayOverlapClause(
        'c.food_attributes',
        filters.foodAttributeIds,
      );
      const foodIdClause = this.buildInClause(
        'c.food_id',
        filters.foodTextExpansionIds,
      );
      conditions.push(Prisma.sql`((${attributeClause}) OR (${foodIdClause}))`);
      conditionPreview.push(
        `((c.food_attributes && ${this.formatUuidArray(
          filters.foodAttributeIds,
        )}) OR (c.food_id = ANY(${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )})))`,
      );
    } else {
      if (filters.foodIds.length) {
        // Category membership is resolved at PLAN time from the canonical
        // per-food edge table (derived_food_category_edges) and arrives here as
        // extra food ids — the per-connection `c.categories &&` arm is gone
        // (per-mention arrays made membership a coin flip per connection).
        const foodIdClause = this.buildInClause('c.food_id', filters.foodIds);
        conditions.push(Prisma.sql`(${foodIdClause})`);
        conditionPreview.push(
          `(c.food_id = ANY(${this.formatUuidArray(filters.foodIds)}))`,
        );
      }

      if (filters.foodAttributeIds.length) {
        conditions.push(
          this.buildArrayOverlapClause(
            'c.food_attributes',
            filters.foodAttributeIds,
          ),
        );
        conditionPreview.push(
          `c.food_attributes && ${this.formatUuidArray(
            filters.foodAttributeIds,
          )}`,
        );
      }
    }

    if (filters.ingredientIds.length) {
      const clause = this.buildEffectiveIngredientsClause(
        filters.ingredientIds,
        'include',
      );
      conditions.push(clause.sql);
      conditionPreview.push(clause.preview);
    }

    if (filters.excludedIngredientIds.length) {
      const clause = this.buildEffectiveIngredientsClause(
        filters.excludedIngredientIds,
        'exclude',
      );
      conditions.push(clause.sql);
      conditionPreview.push(clause.preview);
    }

    if (filters.minimumVotes !== null) {
      conditions.push(Prisma.sql`c.total_upvotes >= ${filters.minimumVotes}`);
      conditionPreview.push(`c.total_upvotes >= ${filters.minimumVotes}`);
      conditions.push(Prisma.sql`rvt.total_upvotes >= ${filters.minimumVotes}`);
      conditionPreview.push(`rvt.total_upvotes >= ${filters.minimumVotes}`);
      minimumVotesApplied = true;
    }

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
      minimumVotesApplied,
    };
  }

  private buildConnectionMatchConditions(
    filters: ParsedFilters,
  ): MatchClauseWithPreview {
    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];

    const shouldOrPrimaryFoodAttributeEvidence =
      filters.foodAttributePrimary &&
      filters.foodAttributeIds.length > 0 &&
      filters.foodTextExpansionIds.length > 0 &&
      filters.foodIds.length === 0;
    if (shouldOrPrimaryFoodAttributeEvidence) {
      const attributeClause = this.buildArrayOverlapClause(
        'c.food_attributes',
        filters.foodAttributeIds,
      );
      const foodIdClause = this.buildInClause(
        'c.food_id',
        filters.foodTextExpansionIds,
      );
      conditions.push(Prisma.sql`((${attributeClause}) OR (${foodIdClause}))`);
      conditionPreview.push(
        `((c.food_attributes && ${this.formatUuidArray(
          filters.foodAttributeIds,
        )}) OR (c.food_id = ANY(${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )})))`,
      );
    } else {
      if (filters.foodIds.length) {
        // Category membership is resolved at PLAN time from the canonical
        // per-food edge table (derived_food_category_edges) and arrives here as
        // extra food ids — the per-connection `c.categories &&` arm is gone
        // (per-mention arrays made membership a coin flip per connection).
        const foodIdClause = this.buildInClause('c.food_id', filters.foodIds);
        conditions.push(Prisma.sql`(${foodIdClause})`);
        conditionPreview.push(
          `(c.food_id = ANY(${this.formatUuidArray(filters.foodIds)}))`,
        );
      }

      if (filters.foodAttributeIds.length) {
        conditions.push(
          this.buildArrayOverlapClause(
            'c.food_attributes',
            filters.foodAttributeIds,
          ),
        );
        conditionPreview.push(
          `c.food_attributes && ${this.formatUuidArray(
            filters.foodAttributeIds,
          )}`,
        );
      }
    }

    if (filters.ingredientIds.length) {
      const clause = this.buildEffectiveIngredientsClause(
        filters.ingredientIds,
        'include',
      );
      conditions.push(clause.sql);
      conditionPreview.push(clause.preview);
    }

    if (filters.excludedIngredientIds.length) {
      const clause = this.buildEffectiveIngredientsClause(
        filters.excludedIngredientIds,
        'exclude',
      );
      conditions.push(clause.sql);
      conditionPreview.push(clause.preview);
    }

    if (filters.minimumVotes !== null) {
      conditions.push(Prisma.sql`c.total_upvotes >= ${filters.minimumVotes}`);
      conditionPreview.push(`c.total_upvotes >= ${filters.minimumVotes}`);
    }

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
      hasConditions: conditions.length > 0,
    };
  }

  private buildRestaurantEntitySignalMatchConditions(
    filters: ParsedFilters,
  ): MatchClauseWithPreview {
    // Ingredient constraints are item-level claims by nature; name-level
    // praise signals carry no ingredient data, so a signal-only admission
    // cannot honor them (worst case: a restaurant card whose dish list is
    // entirely filtered out). With either ingredient lane active, admission
    // must come from connection evidence that passed the ingredient clause.
    if (
      filters.ingredientIds.length > 0 ||
      filters.excludedIngredientIds.length > 0
    ) {
      return {
        sql: this.combineSqlClauses([]),
        preview: this.combinePreviewClauses([]),
        hasConditions: false,
      };
    }

    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];

    const shouldOrPrimaryFoodAttributeEvidence =
      filters.foodAttributePrimary &&
      filters.foodAttributeIds.length > 0 &&
      filters.foodTextExpansionIds.length > 0 &&
      filters.foodIds.length === 0;

    if (shouldOrPrimaryFoodAttributeEvidence) {
      const attributeClause = this.buildInClause(
        'res.entity_id',
        filters.foodAttributeIds,
      );
      const foodClause = this.buildInClause(
        'res.entity_id',
        filters.foodTextExpansionIds,
      );
      conditions.push(Prisma.sql`((${attributeClause}) OR (${foodClause}))`);
      conditionPreview.push(
        `((res.entity_id = ANY(${this.formatUuidArray(
          filters.foodAttributeIds,
        )})) OR (res.entity_id = ANY(${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )})))`,
      );
    } else {
      if (filters.foodIds.length) {
        conditions.push(this.buildInClause('res.entity_id', filters.foodIds));
        conditionPreview.push(
          `res.entity_id = ANY(${this.formatUuidArray(filters.foodIds)})`,
        );
      }

      if (filters.foodAttributeIds.length) {
        conditions.push(
          this.buildInClause('res.entity_id', filters.foodAttributeIds),
        );
        conditionPreview.push(
          `res.entity_id = ANY(${this.formatUuidArray(
            filters.foodAttributeIds,
          )})`,
        );
      }
    }

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
      hasConditions: conditions.length > 0,
    };
  }

  private buildRestaurantItemOrSignalMatchConditions(
    connectionMatch: MatchClauseWithPreview,
    signalMatch: MatchClauseWithPreview,
  ): ClauseWithPreview {
    if (!connectionMatch.hasConditions && !signalMatch.hasConditions) {
      return { sql: Prisma.sql`TRUE`, preview: 'TRUE' };
    }

    const branches: Prisma.Sql[] = [];
    const branchPreviews: string[] = [];

    if (connectionMatch.hasConditions) {
      branches.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM core_restaurant_items c
        WHERE c.restaurant_id = r.entity_id
          AND ${connectionMatch.sql}
      )`);
      branchPreviews.push(
        `EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = r.entity_id AND ${connectionMatch.preview})`,
      );
    }

    if (signalMatch.hasConditions) {
      branches.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM core_restaurant_entity_signals res
        WHERE res.restaurant_id = r.entity_id
          AND ${signalMatch.sql}
      )`);
      branchPreviews.push(
        `EXISTS (SELECT 1 FROM core_restaurant_entity_signals res WHERE res.restaurant_id = r.entity_id AND ${signalMatch.preview})`,
      );
    }

    if (branches.length === 1) {
      return { sql: branches[0], preview: branchPreviews[0] };
    }
    // Step 8: both a connection MATCH and a signal MATCH are present. An
    // `EXISTS(items) OR EXISTS(signals)` across two different tables can force a
    // sequential scan of restaurants — Postgres can't serve the cross-table OR
    // from a single index. An `IN (... UNION ...)` lets each arm hit its own
    // index (c.restaurant_id / res.restaurant_id), then the outer query filters
    // restaurants by membership. This is a provable identity — the UNION selects
    // exactly the restaurants that have a matching item OR a matching signal, and
    // each arm's match SQL is self-contained to its own table (no outer `r`
    // reference) — so the returned restaurant SET is unchanged; only the query
    // plan (and speed at scale) differs.
    return {
      sql: Prisma.sql`r.entity_id IN (
        SELECT c.restaurant_id
        FROM core_restaurant_items c
        WHERE ${connectionMatch.sql}
        UNION
        SELECT res.restaurant_id
        FROM core_restaurant_entity_signals res
        WHERE ${signalMatch.sql}
      )`,
      preview: `r.entity_id IN (SELECT c.restaurant_id FROM core_restaurant_items c WHERE ${connectionMatch.preview} UNION SELECT res.restaurant_id FROM core_restaurant_entity_signals res WHERE ${signalMatch.preview})`,
    };
  }

  private buildFilteredRestaurantsCte(
    whereSql: Prisma.Sql,
    wherePreview: string,
  ): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
filtered_restaurants AS (
  SELECT
    r.entity_id,
    r.name,
    r.aliases,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${whereSql}
)`;

    const preview = `
filtered_restaurants AS (
  SELECT r.entity_id, r.name, r.aliases, r.restaurant_attributes, r.restaurant_metadata, r.price_level, r.price_level_updated_at
  FROM core_entities r
  WHERE ${wherePreview}
)`.trim();

    return { sql, preview };
  }

  private buildFilteredLocationsCte(
    whereSql: Prisma.Sql,
    wherePreview: string,
  ): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
filtered_locations AS (
  SELECT
    rl.location_id,
    rl.restaurant_id,
    rl.google_place_id,
    rl.latitude,
    rl.longitude,
    rl.address,
    rl.city,
    rl.region,
    rl.country,
    rl.postal_code,
    rl.phone_number,
    rl.website_url,
    rl.hours,
    rl.utc_offset_minutes,
    rl.time_zone,
    rl.is_primary,
    rl.last_polled_at,
    rl.created_at,
    rl.updated_at
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE ${whereSql}
    AND rl.latitude IS NOT NULL
    AND rl.longitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
)`;

    const preview = `
filtered_locations AS (
  SELECT rl.location_id, rl.restaurant_id, rl.google_place_id, rl.latitude, rl.longitude, rl.address, rl.city, rl.region, rl.country, rl.postal_code, rl.phone_number, rl.website_url, rl.hours, rl.utc_offset_minutes, rl.time_zone, rl.is_primary, rl.last_polled_at, rl.created_at, rl.updated_at
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE ${wherePreview} AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL AND rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL
)`.trim();

    return { sql, preview };
  }

  private buildGeographicRestaurantsCte(
    locationWhereSql: Prisma.Sql,
    locationWherePreview: string,
  ): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
geographic_restaurants AS (
  SELECT DISTINCT
    r.entity_id
  FROM core_entities r
  JOIN core_restaurant_locations rl
    ON rl.restaurant_id = r.entity_id
  WHERE r.type = 'restaurant'
    AND ${locationWhereSql}
    AND rl.latitude IS NOT NULL
    AND rl.longitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
)`;

    const preview = `
geographic_restaurants AS (
  SELECT DISTINCT r.entity_id
  FROM core_entities r
  JOIN core_restaurant_locations rl ON rl.restaurant_id = r.entity_id
  WHERE r.type = 'restaurant'
    AND ${locationWherePreview}
    AND rl.latitude IS NOT NULL
    AND rl.longitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
)`.trim();

    return { sql, preview };
  }

  /**
   * The DISTINCT ON (restaurant_id) representative-location order. Fame pin
   * (master §5/§7): a location INSIDE the restaurant's score-provenance
   * territory is preferred BEFORE distance-to-center — the pin that earned
   * the score leads; distance stays the tiebreak, updated_at the final
   * determinism anchor. Provenance keys off SOURCES (§5): the score row's
   * provenance_source_id resolves to territory places — the source's
   * engine's member places when it has an engine (territory = derived
   * union; a member's ground geometrically covers its DAG descendants for a
   * point test), else its anchor place (engineless poll-bootstrapped towns).
   * §2.5(c) under §2.6 GROUND UNIFICATION (C4 cut): the wrap-aware bbox
   * test (min > max = wrapped, catalog convention) is the PREFILTER ONLY;
   * THE ONE GROUND judges — ST_Covers(geometry, point) against the place's
   * place_geometries row (sketch envelope or full outline, one law). A
   * location inside a member's bbox overhang but outside its ground never
   * wins the pin; a ground-less place (bbox-less birth) never judges.
   */
  private buildDistanceOrder(
    searchCenter: { lat: number; lng: number } | null | undefined,
    alias: string,
  ): { sql: Prisma.Sql; preview: string } {
    const scoringTerritorySql = Prisma.sql`EXISTS (
    SELECT 1
    FROM core_public_entity_scores pes
    JOIN sources src ON src.source_id = pes.provenance_source_id
    LEFT JOIN engines eng ON eng.engine_id = src.engine_id
    JOIN places p ON p.place_id = ANY(
      CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids
           ELSE ARRAY[src.anchor_place_id] END)
    WHERE pes.subject_type = 'restaurant'
      AND pes.subject_id = ${Prisma.raw(alias)}.restaurant_id
      AND p.bbox_min_lat IS NOT NULL
      AND ${Prisma.raw(alias)}.latitude::numeric BETWEEN p.bbox_min_lat AND p.bbox_max_lat
      AND (
        (p.bbox_min_lng <= p.bbox_max_lng
          AND ${Prisma.raw(alias)}.longitude::numeric BETWEEN p.bbox_min_lng AND p.bbox_max_lng)
        OR (p.bbox_min_lng > p.bbox_max_lng
          AND (${Prisma.raw(alias)}.longitude::numeric >= p.bbox_min_lng
            OR ${Prisma.raw(alias)}.longitude::numeric <= p.bbox_max_lng))
      )
      AND EXISTS (
        SELECT 1 FROM place_geometries pgm
        WHERE pgm.place_id = p.place_id
          AND ST_Covers(pgm.geometry,
                ST_SetSRID(ST_MakePoint(${Prisma.raw(alias)}.longitude::float8,
                                        ${Prisma.raw(alias)}.latitude::float8), 4326)))
  ) DESC`;
    const scoringTerritoryPreview = `EXISTS (SELECT 1 FROM core_public_entity_scores pes JOIN sources src ON src.source_id = pes.provenance_source_id LEFT JOIN engines eng ON eng.engine_id = src.engine_id JOIN places p ON p.place_id = ANY(CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids ELSE ARRAY[src.anchor_place_id] END) WHERE pes.subject_type = 'restaurant' AND pes.subject_id = ${alias}.restaurant_id AND p.bbox_min_lat IS NOT NULL AND ${alias}.latitude::numeric BETWEEN p.bbox_min_lat AND p.bbox_max_lat AND ((p.bbox_min_lng <= p.bbox_max_lng AND ${alias}.longitude::numeric BETWEEN p.bbox_min_lng AND p.bbox_max_lng) OR (p.bbox_min_lng > p.bbox_max_lng AND (${alias}.longitude::numeric >= p.bbox_min_lng OR ${alias}.longitude::numeric <= p.bbox_max_lng))) AND EXISTS (SELECT 1 FROM place_geometries pgm WHERE pgm.place_id = p.place_id AND ST_Covers(pgm.geometry, ST_SetSRID(ST_MakePoint(${alias}.longitude::float8, ${alias}.latitude::float8), 4326)))) DESC`;

    if (
      !searchCenter ||
      !Number.isFinite(searchCenter.lat) ||
      !Number.isFinite(searchCenter.lng)
    ) {
      return {
        sql: Prisma.sql`${Prisma.raw(
          alias,
        )}.restaurant_id, ${scoringTerritorySql}, ${Prisma.raw(
          alias,
        )}.updated_at DESC`,
        preview: `${alias}.restaurant_id, ${scoringTerritoryPreview}, ${alias}.updated_at DESC`,
      };
    }

    const distanceSql = Prisma.sql`(POWER(${Prisma.raw(alias)}.latitude - ${
      searchCenter.lat
    }, 2) + POWER(${Prisma.raw(alias)}.longitude - ${searchCenter.lng}, 2))`;
    const distancePreview = `(POWER(${alias}.latitude - ${searchCenter.lat}, 2) + POWER(${alias}.longitude - ${searchCenter.lng}, 2))`;

    return {
      sql: Prisma.sql`${Prisma.raw(
        alias,
      )}.restaurant_id, ${scoringTerritorySql}, ${distanceSql} ASC, ${Prisma.raw(
        alias,
      )}.updated_at DESC`,
      preview: `${alias}.restaurant_id, ${scoringTerritoryPreview}, ${distancePreview} ASC, ${alias}.updated_at DESC`,
    };
  }

  private buildSelectedLocationsCte(
    orderSql: Prisma.Sql,
    orderPreview: string,
  ): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
selected_locations AS (
  SELECT DISTINCT ON (fl.restaurant_id)
    fl.*
  FROM filtered_locations fl
  ORDER BY ${orderSql}
)`;

    const preview = `
selected_locations AS (
  SELECT DISTINCT ON (fl.restaurant_id) fl.*
  FROM filtered_locations fl
  ORDER BY ${orderPreview}
)`.trim();

    return { sql, preview };
  }

  private buildRestaurantVoteTotalsCte(): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
restaurant_vote_totals AS (
  SELECT
    c.restaurant_id,
    SUM(c.total_upvotes) AS total_upvotes,
    SUM(c.mention_count) AS total_mentions
  FROM core_restaurant_items c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`;

    const preview = `
restaurant_vote_totals AS (
  SELECT c.restaurant_id, SUM(c.total_upvotes) AS total_upvotes, SUM(c.mention_count) AS total_mentions
  FROM core_restaurant_items c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`.trim();

    return { sql, preview };
  }

  private buildGeographicRestaurantVoteTotalsCte(): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const sql = Prisma.sql`
geographic_restaurant_vote_totals AS (
  SELECT
    c.restaurant_id,
    SUM(c.total_upvotes) AS total_upvotes,
    SUM(c.mention_count) AS total_mentions
  FROM core_restaurant_items c
  JOIN geographic_restaurants gr ON gr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`;

    const preview = `
geographic_restaurant_vote_totals AS (
  SELECT c.restaurant_id, SUM(c.total_upvotes) AS total_upvotes, SUM(c.mention_count) AS total_mentions
  FROM core_restaurant_items c
  JOIN geographic_restaurants gr ON gr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`.trim();

    return { sql, preview };
  }

  private buildPublicRestaurantScoresCte(): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const sql = Prisma.sql`
public_restaurant_scores AS (
  SELECT
    subject_id,
    display_score,
    percentile_rank,
    rising,
    jsonb_build_object(
      'evidenceCopy', 'Based on community evidence.'
    ) AS score_info
  FROM core_public_entity_scores
  WHERE subject_type = 'restaurant'
)`;

    const preview = `
public_restaurant_scores AS (
  SELECT subject_id, display_score, percentile_rank, rising,
         jsonb_build_object('evidenceCopy', 'Based on community evidence.') AS score_info
  FROM core_public_entity_scores
  WHERE subject_type = 'restaurant'
)`.trim();

    return { sql, preview };
  }

  private buildPublicConnectionScoresCte(): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const sql = Prisma.sql`
public_connection_scores AS (
  SELECT
    subject_id,
    display_score,
    percentile_rank,
    rising,
    jsonb_build_object(
      'evidenceCopy', 'Based on community evidence.'
    ) AS score_info
  FROM core_public_entity_scores
  WHERE subject_type = 'connection'
)`;

    const preview = `
public_connection_scores AS (
  SELECT subject_id, display_score, percentile_rank, rising,
         jsonb_build_object('evidenceCopy', 'Based on community evidence.') AS score_info
  FROM core_public_entity_scores
  WHERE subject_type = 'connection'
)`.trim();

    return { sql, preview };
  }

  private buildLocationAggregatesCte(
    searchCenter?: { lat: number; lng: number } | null,
  ): {
    sql: Prisma.Sql;
    preview: string;
  } {
    // Locations are a fact about the restaurant, not the viewport or any
    // market (master plan §7): the aggregate is GLOBAL — the map's off-screen
    // sibling machinery depends on it being wider than the viewport — but the
    // ARRAY is capped at the nearest ~30 to the search center so a national
    // chain's row doesn't ship 100KB of JSON. location_count stays the TRUE
    // global count (the RestaurantPanel "N locations" label semantics).
    const hasCenter =
      !!searchCenter &&
      Number.isFinite(searchCenter.lat) &&
      Number.isFinite(searchCenter.lng);
    const proximityOrderSql = hasCenter
      ? Prisma.sql`(POWER(rl.latitude - ${searchCenter.lat}, 2) + POWER(rl.longitude - ${searchCenter.lng}, 2)) ASC, rl.updated_at DESC`
      : Prisma.sql`rl.updated_at DESC`;
    const sql = Prisma.sql`
location_aggregates AS (
  SELECT
    ranked_locations.restaurant_id,
    MAX(ranked_locations.total_location_count) AS location_count,
    json_agg(
      jsonb_build_object(
        'locationId', ranked_locations.location_id,
        'googlePlaceId', ranked_locations.google_place_id,
        'latitude', ranked_locations.latitude,
        'longitude', ranked_locations.longitude,
        'address', ranked_locations.address,
        'city', ranked_locations.city,
        'region', ranked_locations.region,
        'country', ranked_locations.country,
        'postalCode', ranked_locations.postal_code,
        'phoneNumber', ranked_locations.phone_number,
        'websiteUrl', ranked_locations.website_url,
        'hours', ranked_locations.hours,
        'utcOffsetMinutes', ranked_locations.utc_offset_minutes,
        'timeZone', ranked_locations.time_zone,
        'isPrimary', ranked_locations.is_primary,
        'lastPolledAt', ranked_locations.last_polled_at,
        'createdAt', ranked_locations.created_at,
        'updatedAt', ranked_locations.updated_at
      )
      ORDER BY ranked_locations.location_rank ASC
    ) FILTER (WHERE ranked_locations.location_rank <= 30) AS locations_json
  FROM (
    SELECT
      rl.*,
      ROW_NUMBER() OVER (
        PARTITION BY rl.restaurant_id
        ORDER BY ${proximityOrderSql}
      ) AS location_rank,
      COUNT(*) OVER (PARTITION BY rl.restaurant_id) AS total_location_count
    FROM core_restaurant_locations rl
    JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
    WHERE rl.latitude IS NOT NULL
      AND rl.longitude IS NOT NULL
      AND rl.google_place_id IS NOT NULL
      AND rl.address IS NOT NULL
  ) ranked_locations
  GROUP BY ranked_locations.restaurant_id
)`;

    const preview = `
location_aggregates AS (
  SELECT restaurant_id, MAX(total_location_count) AS location_count,
         json_agg(...) FILTER (WHERE location_rank <= 30) AS locations_json
  FROM (SELECT rl.*, ROW_NUMBER() OVER (PARTITION BY rl.restaurant_id ORDER BY ${
    hasCenter ? 'proximity-to-search-center' : 'updated_at DESC'
  }) AS location_rank, COUNT(*) OVER (PARTITION BY rl.restaurant_id) AS total_location_count
        FROM core_restaurant_locations rl JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
        WHERE lat/lng/place/address NOT NULL) ranked_locations
  GROUP BY restaurant_id
)`.trim();

    return { sql, preview };
  }

  private resolveDishOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`fc.connection_rising DESC NULLS LAST, fc.connection_crave_score_exact ${Prisma.raw(
          direction,
        )}, fc.connection_crave_score ${Prisma.raw(
          direction,
        )}, fc.total_upvotes ${Prisma.raw(
          direction,
        )}, fc.mention_count ${Prisma.raw(direction)}, fc.connection_id ASC`,
        preview: `fc.connection_rising DESC NULLS LAST, fc.connection_crave_score_exact ${direction}, fc.connection_crave_score ${direction}, fc.total_upvotes ${direction}, fc.mention_count ${direction}, fc.connection_id ASC`,
      };
    }
    return {
      // HIGH-PRECISION: connection_crave_score_exact (percentile_rank) leads so map pins order by the true
      // score, not the rounded display value; display score + upvotes + mention + id are stable tiebreaks.
      sql: Prisma.sql`fc.connection_crave_score_exact ${Prisma.raw(direction)}, fc.connection_crave_score ${Prisma.raw(direction)}, fc.total_upvotes ${Prisma.raw(
        direction,
      )}, fc.mention_count ${Prisma.raw(direction)}, fc.connection_id ASC`,
      preview: `fc.connection_crave_score_exact ${direction}, fc.connection_crave_score ${direction}, fc.total_upvotes ${direction}, fc.mention_count ${direction}, fc.connection_id ASC`,
    };
  }

  private resolveRestaurantOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`prs.rising DESC NULLS LAST,
      prs.percentile_rank ${Prisma.raw(direction)},
      prs.display_score ${Prisma.raw(direction)},
      COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
      fr.entity_id ASC`,
        preview: `prs.rising DESC NULLS LAST, prs.percentile_rank ${direction}, prs.display_score ${direction}, COALESCE(rvt.total_upvotes, 0) ${direction}, fr.entity_id ASC`,
      };
    }
    return {
      // HIGH-PRECISION CRAVE ORDER: percentile_rank (Decimal(6,5)) is the primary key so near-ties that round
      // to the same display_score (Decimal(4,2)) order deterministically by their true score; display_score is
      // a harmless secondary, then a stable id. This is what makes the map badge == the results-list position.
      sql: Prisma.sql`prs.percentile_rank ${Prisma.raw(direction)},
      prs.display_score ${Prisma.raw(direction)},
      COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
      fr.entity_id ASC`,
      preview: `prs.percentile_rank ${direction}, prs.display_score ${direction}, COALESCE(rvt.total_upvotes, 0) ${direction}, fr.entity_id ASC`,
    };
  }

  private resolveTopDishOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`sub.rising DESC NULLS LAST, sub.crave_score ${Prisma.raw(
          direction,
        )}`,
        preview: `sub.rising DESC NULLS LAST, sub.crave_score ${direction}`,
      };
    }
    return {
      sql: Prisma.sql`sub.crave_score ${Prisma.raw(direction)}`,
      preview: `sub.crave_score ${direction}`,
    };
  }

  private resolveTopDishRankOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`pcs.rising DESC NULLS LAST, pcs.display_score ${Prisma.raw(
          direction,
        )}, c.total_upvotes ${Prisma.raw(direction)}, c.connection_id ASC`,
        preview: `pcs.rising DESC NULLS LAST, pcs.display_score ${direction}, c.total_upvotes ${direction}, c.connection_id ASC`,
      };
    }
    return {
      sql: Prisma.sql`pcs.display_score ${Prisma.raw(
        direction,
      )}, c.total_upvotes ${Prisma.raw(direction)}, c.connection_id ASC`,
      preview: `pcs.display_score ${direction}, c.total_upvotes ${direction}, c.connection_id ASC`,
    };
  }

  private collectEntityIds(
    filters: FilterClause[],
    entityType: EntityScope,
  ): string[] {
    const ids = filters
      .filter((filter) => filter.entityType === entityType)
      .flatMap((filter) => filter.entityIds)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }

  private extractBoundsPayload(filters: FilterClause[]): BoundsPayload | null {
    for (const filter of filters) {
      const payload = filter.payload as { bounds?: BoundsPayload } | undefined;
      if (payload?.bounds && this.isBoundsPayload(payload.bounds)) {
        return payload.bounds;
      }
    }
    return null;
  }

  private extractPolygonPayload(
    filters: FilterClause[],
  ): PolygonPayload | null {
    for (const filter of filters) {
      const payload = filter.payload as
        | { viewportPolygon?: unknown }
        | undefined;
      const polygon = payload?.viewportPolygon;
      if (
        Array.isArray(polygon) &&
        polygon.length >= 3 &&
        polygon.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]),
        )
      ) {
        return polygon as PolygonPayload;
      }
    }
    return null;
  }

  private extractPriceLevels(filters: FilterClause[]): number[] {
    for (const filter of filters) {
      const payload = filter.payload as PriceFilterPayload | undefined;
      if (
        payload?.priceLevels &&
        Array.isArray(payload.priceLevels) &&
        payload.priceLevels.length
      ) {
        const normalized = payload.priceLevels
          .map((value) => Number(value))
          .filter(
            (value) => Number.isInteger(value) && value >= 0 && value <= 4,
          );
        if (normalized.length) {
          return Array.from(new Set(normalized)).sort((a, b) => a - b);
        }
      }
    }
    return [];
  }

  private extractMinimumVotes(filters: FilterClause[]): number | null {
    for (const filter of filters) {
      const payload = filter.payload;
      if (this.isMinimumVotesPayload(payload)) {
        const rawValue = Number(payload.minimumVotes);
        if (!Number.isFinite(rawValue)) {
          continue;
        }
        const value = Math.floor(rawValue);
        if (value > 0) {
          return value;
        }
      }
    }
    return null;
  }

  private isMinimumVotesPayload(
    payload: unknown,
  ): payload is MinimumVotesPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const candidate = payload as { minimumVotes?: unknown };
    return typeof candidate.minimumVotes === 'number';
  }

  private isBoundsPayload(value: unknown): value is BoundsPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as BoundsPayload;
    return (
      this.isCoordinate(candidate.northEast) &&
      this.isCoordinate(candidate.southWest)
    );
  }

  private isCoordinate(
    value: { lat: number; lng: number } | undefined,
  ): value is { lat: number; lng: number } {
    return (
      typeof value?.lat === 'number' &&
      Number.isFinite(value.lat) &&
      typeof value.lng === 'number' &&
      Number.isFinite(value.lng)
    );
  }

  private buildInClause(column: string, values: string[]): Prisma.Sql {
    if (!values.length) {
      return Prisma.sql`FALSE`;
    }
    return Prisma.sql`${Prisma.raw(column)} = ANY(${this.buildUuidArray(
      values,
    )})`;
  }

  private buildNumberInClause(column: string, values: number[]): Prisma.Sql {
    if (!values.length) {
      return Prisma.sql`TRUE`;
    }
    return Prisma.sql`${Prisma.raw(column)} = ANY(${this.buildSmallintArray(
      values,
    )})`;
  }

  /**
   * THE ingredient read seam (testimony/knowledge doctrine —
   * src/modules/content-processing/entity-resolver/testimony-knowledge-doctrine.md).
   * No consumer touches c.ingredients / canonical_ingredients directly:
   * - 'include' (recall): UNION of tiers — venue testimony OR the dish's
   *   synthesized canon. Knowledge fills recall ("gruyere" finds dishes whose
   *   canon includes it even when no Redditor named it).
   * - 'exclude' (allergies / "no cilantro"): CONSERVATIVE — excluded when
   *   EITHER tier names the ingredient. Canon says ramen has egg; a venue's
   *   version might not — for an exclusion you never gamble on the venue
   *   being the exception.
   */
  private buildEffectiveIngredientsClause(
    ingredientIds: string[],
    mode: 'include' | 'exclude',
  ): { sql: Prisma.Sql; preview: string } {
    const overlap = Prisma.sql`((${this.buildArrayOverlapClause(
      'c.ingredients',
      ingredientIds,
    )}) OR c.food_id IN (SELECT entity_id FROM core_entities WHERE canonical_ingredients && ${this.buildUuidArray(
      ingredientIds,
    )}))`;
    const previewCore = `((c.ingredients && ${this.formatUuidArray(
      ingredientIds,
    )}) OR c.food_id IN (SELECT entity_id FROM core_entities WHERE canonical_ingredients && ${this.formatUuidArray(
      ingredientIds,
    )}))`;
    return mode === 'include'
      ? { sql: overlap, preview: previewCore }
      : { sql: Prisma.sql`NOT ${overlap}`, preview: `NOT ${previewCore}` };
  }

  private buildArrayOverlapClause(
    column: string,
    values: string[],
  ): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(column)} && ${this.buildUuidArray(values)}`;
  }

  private buildUuidArray(values: string[]): Prisma.Sql {
    const mapped = Prisma.join(
      values.map((value) => Prisma.sql`${value}::uuid`),
      ', ',
    );
    return Prisma.sql`ARRAY[${mapped}]::uuid[]`;
  }

  private formatUuidArray(values: string[]): string {
    return `ARRAY[${values.map((value) => `'${value}'`).join(', ')}]::uuid[]`;
  }

  private buildSmallintArray(values: number[]): Prisma.Sql {
    const mapped = Prisma.join(
      values.map((value) => Prisma.sql`${value}`),
      ', ',
    );
    return Prisma.sql`ARRAY[${mapped}]::smallint[]`;
  }

  private formatNumberArray(values: number[]): string {
    return `ARRAY[${values.join(', ')}]::smallint[]`;
  }

  private combineSqlClauses(clauses: Prisma.Sql[]): Prisma.Sql {
    if (!clauses.length) {
      return Prisma.sql`TRUE`;
    }

    return Prisma.join(
      clauses.map((clause) => Prisma.sql`(${clause})`),
      ' AND ',
    );
  }

  private combinePreviewClauses(clauses: string[]): string {
    if (!clauses.length) {
      return 'TRUE';
    }
    if (clauses.length === 1) {
      return clauses[0];
    }
    return clauses.map((clause) => `(${clause})`).join(' AND ');
  }
}
