import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activeRestaurantEventExistsSql } from '../content-processing/reddit-collector/extraction-scope.service';
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
  /** Same-named ingredient twins of the query foods — ORed into the food
   *  clause as containment (evidence + canon tiers). */
  twinIngredientIds: string[];
  foodAttributeIds: string[];
  ingredientIds: string[];
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
    // ACTIVE-run scoped (final-final red team #1): the bare event EXISTS
    // kept a restaurant search-eligible on a RETAINED superseded
    // generation's events — a restaurant the new prompt correctly dropped
    // would never leave search. The fragment is the scope service's ONE
    // definition; never hand-roll this join.
    const inventoryExistsSql = Prisma.sql`(EXISTS (
      SELECT 1
      FROM core_restaurant_items c
      WHERE c.restaurant_id = r.entity_id
    ) OR ${Prisma.raw(activeRestaurantEventExistsSql('r.entity_id'))})`;
    const inventoryExistsPreview = `(EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = r.entity_id) OR ${activeRestaurantEventExistsSql('r.entity_id')})`;

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

    // STEP-3 POOLED GATE (spec §1.4): tier 0 = restaurant satisfies EVERY
    // soft attribute id — venue side via containment on its own attributes,
    // food side via a connection that matches the (hard) food arms AND all
    // soft food-attribute ids. Soft ids are OUT of membership (the service
    // passes hard-only ids in the plan).
    const pooledGate = directives?.pooledGate ?? null;
    const pooledRestFullExpr = (alias: string): Prisma.Sql | null =>
      pooledGate
        ? Prisma.sql`(${
            pooledGate.softRestaurantAttributeIds.length
              ? Prisma.sql`${Prisma.raw(alias)}.restaurant_attributes @> ${pooledGate.softRestaurantAttributeIds}::uuid[]`
              : Prisma.sql`TRUE`
          } AND ${
            pooledGate.softFoodAttributeIds.length
              ? Prisma.sql`EXISTS (
                  SELECT 1 FROM core_restaurant_items c
                  WHERE c.restaurant_id = ${Prisma.raw(alias)}.entity_id
                    AND c.food_attributes @> ${pooledGate.softFoodAttributeIds}::uuid[]
                    ${
                      directives?.exactFoodIds?.length
                        ? Prisma.sql`AND c.food_id = ANY(${directives.exactFoodIds}::uuid[])`
                        : Prisma.sql``
                    }
                    ${connectionMatch.hasConditions ? Prisma.sql`AND ${connectionMatchSql}` : Prisma.sql``}
                )`
              : Prisma.sql`TRUE`
          })`
        : null;

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

    // THE GATE (owner ruling 2026-08-01): tier-1 rows admitted only when
    // tier-0 rows cannot fill one page. ONE PASS via a window count — a
    // gate CTE referenced from WHERE gets inlined and re-executes per row
    // (measured seconds); the window aggregate computes once. The hydrate
    // path (restrictIds) NEVER gates — the executor already decided on the
    // openness-aware candidate set and the order is id-position-preserved
    // (spec §1.4.4a/b).
    const pooledGateActive = Boolean(pooledGate) && !restrictIds;
    const pooledRestGateWhereSql = pooledGateActive
      ? pooledGate!.gateFull === null
        ? Prisma.sql`WHERE rrx.match_tier = 0 OR rrx.pooled_full_count < ${pooledGate!.threshold}`
        : pooledGate!.gateFull
          ? Prisma.sql`WHERE rrx.match_tier = 0`
          : Prisma.sql`WHERE TRUE`
      : Prisma.sql``;
    // Outer ORDER for the pooled wrapper must use OUTPUT column names (the
    // inner aliases prs/rvt/fr are out of scope there).
    const pooledOuterOrderSql = (() => {
      const normalized = (plan.ranking.restaurantOrder || '').toLowerCase();
      const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
      return normalized.includes('rising')
        ? Prisma.sql`rrx.rising DESC NULLS LAST, rrx.crave_score_exact ${Prisma.raw(direction)}, rrx.crave_score ${Prisma.raw(direction)}, rrx.total_upvotes ${Prisma.raw(direction)}, rrx.restaurant_id ASC`
        : Prisma.sql`rrx.crave_score_exact ${Prisma.raw(direction)}, rrx.crave_score ${Prisma.raw(direction)}, rrx.total_upvotes ${Prisma.raw(direction)}, rrx.restaurant_id ASC`;
    })();

    const restaurantOrder = this.resolveRestaurantOrderSql(
      plan.ranking.restaurantOrder,
    );
    // SECTIONED RELEVANCY (restaurant axis): a restaurant serving ≥1 EXACT-match
    // dish is tier 0; widened-only restaurants tier 1. Same grouping-not-blending
    // contract as the dish list.
    const restExactIds = directives?.sectionedRanking
      ? (directives.exactFoodIds ?? [])
      : [];
    const pooledRestTierExpr = pooledGate
      ? Prisma.sql`CASE WHEN ${pooledRestFullExpr('fr')} THEN 0 ELSE 1 END`
      : null;
    const restTierExpr =
      pooledRestTierExpr ??
      (restExactIds.length
        ? Prisma.sql`CASE WHEN EXISTS (
          SELECT 1 FROM core_restaurant_items ce
          WHERE ce.restaurant_id = fr.entity_id
            AND ce.food_id = ANY(${restExactIds}::uuid[])
        ) THEN 0 ELSE 1 END`
        : null);
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
    const rankedRestaurantsCte = pooledGateActive
      ? Prisma.sql`
ranked_restaurants AS (
  SELECT rrx.* FROM (
  SELECT
    fr.entity_id AS restaurant_id,
    ${restTierSelect}
    count(*) FILTER (WHERE ${restTierExpr!} = 0) OVER () AS pooled_full_count,
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
  ) rrx
  ${pooledRestGateWhereSql}
  ORDER BY rrx.match_tier ASC, ${pooledOuterOrderSql}
  OFFSET ${pagination.skip}
  LIMIT ${pagination.take}
)`
      : Prisma.sql`
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
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${locationAggregatesCte.sql},
  ${rankedRestaurantsCte}
`;

    const withPreview = `WITH
  ${restaurantCte.preview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
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
    -- archived vocabulary must never RENDER either (final red team #3):
    -- the admission path was already filtered; this is the display path.
    JOIN core_entities e ON e.entity_id = res.entity_id
      AND e.status <> 'archived'
    WHERE res.restaurant_id = rr.restaurant_id
      AND ${signalMatch.sql}
    ORDER BY res.mention_count DESC, e.name ASC
    LIMIT 5
  ) tag_rows
) tm ON ${signalMatch.hasConditions ? Prisma.sql`TRUE` : Prisma.sql`FALSE`}`;

    const countSql = pooledGateActive
      ? Prisma.sql`
WITH
  ${restaurantCte.sql},
		  ${filteredLocationsCte.sql},
	  ${selectedLocationsCte.sql},
	  ${restaurantVoteTotalsCte.sql},
	  ${publicRestaurantScoresCte.sql}
	SELECT COUNT(DISTINCT rrx.restaurant_id)::bigint AS total_restaurants,
	  COALESCE(MAX(rrx.pooled_full_count), 0)::bigint AS full_restaurants,
	  ${
      pooledGate!.softFoodAttributeIds.length +
        pooledGate!.softRestaurantAttributeIds.length >
      0
        ? Prisma.sql`json_build_object(${Prisma.join(
            [
              ...pooledGate!.softRestaurantAttributeIds.map(
                (id, i) =>
                  Prisma.sql`${id}::text, COALESCE(MAX(rrx.rswc_r_${Prisma.raw(String(i))}), 0)::int`,
              ),
              ...pooledGate!.softFoodAttributeIds.map(
                (id, i) =>
                  Prisma.sql`${id}::text, COALESCE(MAX(rrx.rswc_f_${Prisma.raw(String(i))}), 0)::int`,
              ),
            ],
            ', ',
          )})`
        : Prisma.sql`NULL`
    } AS soft_word_counts
	FROM (
	  SELECT fr.entity_id AS restaurant_id,
	    ${restTierExpr!} AS match_tier,
	    count(*) FILTER (WHERE ${restTierExpr!} = 0) OVER () AS pooled_full_count${
        pooledGate!.softRestaurantAttributeIds.length
          ? Prisma.sql`,
	    ${Prisma.join(
        pooledGate!.softRestaurantAttributeIds.map(
          (id, i) =>
            Prisma.sql`count(*) FILTER (WHERE fr.restaurant_attributes @> ARRAY[${id}]::uuid[]) OVER () AS rswc_r_${Prisma.raw(String(i))}`,
        ),
        ',\n	    ',
      )}`
          : Prisma.sql``
      }${
        pooledGate!.softFoodAttributeIds.length
          ? Prisma.sql`,
	    ${Prisma.join(
        pooledGate!.softFoodAttributeIds.map(
          (id, i) =>
            Prisma.sql`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = fr.entity_id AND c.food_attributes @> ARRAY[${id}]::uuid[] ${connectionMatch.hasConditions ? Prisma.sql`AND ${connectionMatchSql}` : Prisma.sql``})) OVER () AS rswc_f_${Prisma.raw(String(i))}`,
        ),
        ',\n	    ',
      )}`
          : Prisma.sql``
      }
	  FROM filtered_restaurants fr
	  JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
	  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
	  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	  ${minimumVotesWhereSql}
	) rrx
	${pooledRestGateWhereSql}`
      : Prisma.sql`
WITH
  ${restaurantCte.sql},
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
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ranked_candidates AS (
    SELECT
      fr.entity_id AS restaurant_id,
      ${pooledRestTierExpr ? Prisma.sql`${pooledRestTierExpr} AS pooled_tier,` : Prisma.sql`NULL::int AS pooled_tier,`}
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
SELECT restaurant_id, pooled_tier, hours, utc_offset_minutes, time_zone
FROM ranked_candidates`
      : null;

    const preview = `
${pooledGateActive ? '-- [POOLED GATE ACTIVE: soft attrs are provenance; window gate; preview shows base shape]\n' : ''}${withPreview}
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

    // STEP-3 POOLED GATE (spec §1.4): tier 0 = the row satisfies EVERY soft
    // attribute id ("all words"); tier 1 = partial. Soft ids are OUT of the
    // WHERE membership (the service passes hard-only ids in the plan), so
    // one execution holds the whole pool; the gate below decides whether
    // tier-1 rows are admitted.
    const pooledGate = directives?.pooledGate ?? null;
    const pooledFullExprSql = pooledGate
      ? Prisma.sql`(${
          pooledGate.softFoodAttributeIds.length
            ? Prisma.sql`c.food_attributes @> ${pooledGate.softFoodAttributeIds}::uuid[]`
            : Prisma.sql`TRUE`
        } AND ${
          pooledGate.softRestaurantAttributeIds.length
            ? Prisma.sql`fr.restaurant_attributes @> ${pooledGate.softRestaurantAttributeIds}::uuid[]`
            : Prisma.sql`TRUE`
        } AND ${
          // Red team A6: when widening is active, tier 0 additionally
          // requires the EXACT food set (anchors + family) — a sibling row
          // matching every soft word must not wear the exact-match chip.
          directives?.exactFoodIds?.length
            ? Prisma.sql`c.food_id = ANY(${directives.exactFoodIds}::uuid[])`
            : Prisma.sql`TRUE`
        })`
      : null;
    const similarRingIds = pooledGate?.similarFoodIds ?? [];
    const pooledTierCteSelectSql = pooledFullExprSql
      ? Prisma.sql`,
    CASE ${
      similarRingIds.length
        ? Prisma.sql`WHEN c.food_id = ANY(${similarRingIds}::uuid[]) THEN 2 `
        : Prisma.sql``
    }WHEN ${pooledFullExprSql} THEN 0 ELSE 1 END AS pooled_tier`
      : Prisma.sql``;

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

    // TIER-2 ring admission: ring rows enter the SCAN (so the window can
    // count them) but never the served page (the gate WHERE excludes
    // tier 2). Dish axis only — the restaurant query is untouched.
    const ringAdmissionSql = similarRingIds.length
      ? Prisma.sql`OR c.food_id = ANY(${similarRingIds}::uuid[])`
      : Prisma.sql``;
    const combinedConnectionWhereSql = Prisma.sql`(${connectionWhereSql} ${ringAdmissionSql}) ${excludeConnectionsSql}`;
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

    const { sql: selectedOrderSql, preview: selectedOrderPreview } =
      this.buildDistanceOrder(searchCenter, 'fl');

    const selectedLocationsCte = this.buildSelectedLocationsCte(
      selectedOrderSql,
      selectedOrderPreview,
    );

    const restaurantVoteTotalsCte = this.buildRestaurantVoteTotalsCte();
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
    c.is_category_item,
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
    fr.restaurant_attributes AS restaurant_attributes_arr,
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
    sl.time_zone${pooledTierCteSelectSql}
  FROM core_restaurant_items c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN public_restaurant_scores prs
    ON prs.subject_id = fr.entity_id
  JOIN public_connection_scores pcs
    ON pcs.subject_id = c.connection_id
  JOIN core_entities f ON f.entity_id = c.food_id
  -- Rollup rows (is_category_item) never enter the dish axis: each exists
  -- only as a parent of more specific dishes at the same restaurant, so a
  -- served rollup ("taco @ X" at the child-max score) duplicates its
  -- children on the page and in the gate's window counts.
  WHERE NOT c.is_category_item AND ${combinedConnectionWhereSql}
)`;

    const filteredConnectionsCtePreview = `
filtered_connections AS (
  SELECT c.connection_id, c.restaurant_id, c.food_id, c.categories, c.food_attributes, c.is_category_item, c.mention_count, c.total_upvotes, c.last_mentioned_at,
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
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
  JOIN public_connection_scores pcs ON pcs.subject_id = c.connection_id
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE NOT c.is_category_item AND ${combinedConnectionWherePreview}
)`.trim();

    const order = this.resolveDishOrderSql(plan.ranking.foodOrder);

    // SECTIONED RELEVANCY: exact-match rows (tier 0) rank before widened rows
    // (tier 1 — siblings/categories/lexical), pure Crave Score WITHIN each tier;
    // every row carries match_tier so the client can draw the section divider.
    // Under the pooled gate, match_tier IS the pooled tier (all-words vs
    // partial) — same wire contract, richer meaning.
    const exactIds = directives?.sectionedRanking
      ? (directives.exactFoodIds ?? [])
      : [];
    const tierSelectSql = pooledGate
      ? Prisma.sql`, fc.pooled_tier AS match_tier`
      : exactIds.length
        ? Prisma.sql`, CASE WHEN fc.food_id = ANY(${exactIds}::uuid[]) THEN 0 ELSE 1 END AS match_tier`
        : Prisma.sql`, NULL::int AS match_tier`;
    const tierOrderSql = pooledGate
      ? Prisma.sql`fc.pooled_tier ASC, `
      : exactIds.length
        ? Prisma.sql`CASE WHEN fc.food_id = ANY(${exactIds}::uuid[]) THEN 0 ELSE 1 END ASC, `
        : Prisma.sql``;
    const tierOrderPreview = pooledGate
      ? 'pooled_tier ASC, '
      : exactIds.length
        ? 'match_tier ASC, '
        : '';

    // THE GATE (owner ruling 2026-08-01: page 1 fills with all-word matches;
    // partial admitted only when they cannot fill it). ONE PASS, window
    // count — a gate CTE referenced from WHERE gets INLINED by Postgres and
    // re-executes per row (measured 20.9s); the window aggregate is
    // computed once over the pool (round-2's proven 5.98ms shape).
    // gateFull parameterizes the openness-aware decision (spec §1.4.4a);
    // null decides in-SQL from the window count.
    // Tier 2 (the similar ring) is in the SCAN for the window counts but
    // never on the served page — the Include-similar chip re-queries with
    // the ring as tier-1 MEMBERS instead (membership flip, not a re-run).
    const pooledGateWhereSql = pooledGate
      ? pooledGate.gateFull === null
        ? Prisma.sql`WHERE fc.pooled_tier = 0 OR (fc.pooled_tier = 1 AND fc.pooled_full_count < ${pooledGate.threshold})`
        : pooledGate.gateFull
          ? Prisma.sql`WHERE fc.pooled_tier = 0`
          : Prisma.sql`WHERE fc.pooled_tier < 2`
      : Prisma.sql``;

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${restaurantCte},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${publicRestaurantScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${filteredConnectionsCte}
`;

    const withPreview = `WITH
  ${restaurantCtePreview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
  ${publicRestaurantScoresCte.preview},
  ${publicConnectionScoresCte.preview},
  ${filteredConnectionsCtePreview}`;

    const dataSql = pooledGate
      ? Prisma.sql`
${withClause}
SELECT fc.*, fc.pooled_tier AS match_tier
FROM (
  SELECT fci.*,
    count(*) FILTER (WHERE fci.pooled_tier = 0) OVER () AS pooled_full_count
  FROM filtered_connections fci
) fc
${pooledGateWhereSql}
ORDER BY fc.pooled_tier ASC, ${order.sql}
OFFSET ${pagination.skip}
LIMIT ${pagination.take}`
      : Prisma.sql`
${withClause}
SELECT *${tierSelectSql}
FROM filtered_connections fc
ORDER BY ${tierOrderSql}${order.sql}
OFFSET ${pagination.skip}
LIMIT ${pagination.take}`;

    // Pooled count = the ADMITTED set (what pagination walks), plus the
    // full-tier count so callers can report gate provenance.
    // STEP 5 (spec §1.6): per-word starvation — one count per soft id so
    // the demand signal can say WHICH word found nothing here, not "few
    // results". json object keyed by attribute id; small bounded lists.
    // Per-word coverage WITHOUT re-scans (round-5 phase-4 close-out): the
    // old UNION ALL re-scanned filtered_connections once per soft id
    // (+~85ms each, attacker-controlled). Each id is now ONE window column
    // in the wrapper the count query already has — computed over the
    // PRE-GATE pool (starvation is a fact about the pool, not the page).
    const softIds = pooledGate
      ? [
          ...pooledGate.softFoodAttributeIds.map((id) => ({
            id,
            column: 'food_attributes',
          })),
          ...pooledGate.softRestaurantAttributeIds.map((id) => ({
            id,
            column: 'restaurant_attributes_arr',
          })),
        ]
      : [];
    const softCountWindowsSql = softIds.length
      ? Prisma.sql`,
    ${Prisma.join(
      softIds.map(
        (entry, i) =>
          Prisma.sql`count(*) FILTER (WHERE fci.${Prisma.raw(entry.column)} @> ARRAY[${entry.id}]::uuid[]) OVER () AS swc_${Prisma.raw(String(i))}`,
      ),
      ',\n    ',
    )}`
      : Prisma.sql``;
    const dishSoftWordCountsSql = softIds.length
      ? Prisma.sql`json_build_object(${Prisma.join(
          softIds.map(
            (entry, i) =>
              Prisma.sql`${entry.id}::text, COALESCE(MAX(fc.swc_${Prisma.raw(String(i))}), 0)::int`,
          ),
          ', ',
        )})`
      : Prisma.sql`NULL`;
    const countSql = pooledGate
      ? Prisma.sql`
${withClause}
SELECT
  COUNT(*)::bigint AS total_connections,
  COUNT(DISTINCT fc.restaurant_id)::bigint AS total_restaurants,
  COALESCE(MAX(fc.pooled_full_count), 0)::bigint AS full_connections,
  COALESCE(MAX(fc.similar_count), 0)::bigint AS similar_connections,
  ${dishSoftWordCountsSql} AS soft_word_counts
FROM (
  SELECT fci.*,
    count(*) FILTER (WHERE fci.pooled_tier = 0) OVER () AS pooled_full_count,
    count(*) FILTER (WHERE fci.pooled_tier = 2) OVER () AS similar_count${softCountWindowsSql}
  FROM filtered_connections fci
) fc
${pooledGateWhereSql}`
      : Prisma.sql`
${withClause}
SELECT
  COUNT(*)::bigint AS total_connections,
  COUNT(DISTINCT fc.restaurant_id)::bigint AS total_restaurants
FROM filtered_connections fc`;

    const preview = `
${pooledGate ? '-- [POOLED GATE ACTIVE: soft attrs are provenance; window gate; preview shows base shape]\n' : ''}${withPreview}
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
      twinIngredientIds: directives?.twinIngredientIds ?? [],
      foodAttributeIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.FOOD_ATTRIBUTE,
      ),
      ingredientIds: this.collectEntityIds(
        connectionFilters,
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
    // ARCHIVED IS NEVER SERVED — as a PREDICATE, not an accident of
    // score-table membership (final-final red team MEDIUM-1: the only
    // thing hiding 242 archived-but-scored restaurants was the location
    // gate; any archive path that doesn't strip locations would surface
    // them with nothing standing in the way).
    const conditions: Prisma.Sql[] = [
      Prisma.sql`r.type = 'restaurant'`,
      Prisma.sql`r.status <> 'archived'`,
    ];
    const conditionPreview: string[] = [
      `r.type = 'restaurant'`,
      `r.status <> 'archived'`,
    ];

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

    // Archived attribute ids must not be a working filter (final-final
    // red team MEDIUM-1: 11 live restaurants still match on archived
    // vocabulary through the raw array overlap).
    const directMatchSql = Prisma.sql`(${this.buildArrayOverlapClause(
      'r.restaurant_attributes',
      filters.restaurantAttributeIds,
    )} AND EXISTS (
      SELECT 1 FROM core_entities attr_live
      WHERE attr_live.entity_id = ANY(r.restaurant_attributes)
        AND attr_live.entity_id = ANY(${filters.restaurantAttributeIds}::uuid[])
        AND attr_live.status <> 'archived'
    ))`;
    // ONE ADMISSION RULE (2026-07-27, measured): this used to OR in a
    // core_restaurant_entity_signals EXISTS, which made the RESTAURANT list
    // admit places the DISH list rejected for the same attribute — the two
    // sides of one search disagreeing about one restaurant. The signals
    // table is a mention TALLY built for tags, not a claim: the stamped
    // array holds 37,070 attributes with no signal row, while signals add
    // only 16 rows of unique active coverage and carry 1,693 pointers to
    // ARCHIVED (ontology-rejected) attributes. So the array is the claim,
    // and both queries now read it — symmetric by removing the weaker
    // path, not by spreading it.
    return {
      sql: Prisma.sql`(${directMatchSql})`,
      preview: `(r.restaurant_attributes && ${this.formatUuidArray(
        filters.restaurantAttributeIds,
      )})`,
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

  /**
   * SHARED connection-clause core (F511 dedup). The ranked lane
   * (buildConnectionConditions) and the match/admission lane
   * (buildConnectionMatchConditions) were byte-identical copies apart from two
   * knobs, so a fix to one silently skipped the other. They are now ONE body,
   * differing only by:
   *   - includeConnectionIdFilter: the ranked lane admits an exact inbound
   *     connection-id set (favorites dish lists); the match lane does not.
   *   - includeVoteRollupCoverage: the ranked lane also gates the LEFT-JOINed
   *     rollup (COALESCE(rvt.total_upvotes,0) — load-bearing, red team R3); the
   *     match lane only asserts the per-connection floor.
   */
  private buildConnectionConditionParts(
    filters: ParsedFilters,
    opts: {
      includeConnectionIdFilter: boolean;
      includeVoteRollupCoverage: boolean;
    },
  ): {
    conditions: Prisma.Sql[];
    conditionPreview: string[];
    minimumVotesApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];
    let minimumVotesApplied = false;

    // First-class inbound connection filter (favorites dish lists hydrate exact
    // connection IDs). Mirrors the excludeConnectionIds column + ANY style.
    if (opts.includeConnectionIdFilter && filters.connectionIds.length) {
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
        // Name-containment variants also arrive as extra food ids (the
        // 2026-07-25 failsafe). Twin-ingredient union: when the query food's
        // name is also an ingredient ("burrata"), dishes CONTAINING it
        // qualify too — OR of the same two containment tiers the ingredient
        // clause uses.
        const foodIdClause = this.buildInClause('c.food_id', filters.foodIds);
        if (filters.twinIngredientIds.length) {
          const containment = this.buildEffectiveIngredientsClause(
            filters.twinIngredientIds,
          );
          conditions.push(
            Prisma.sql`((${foodIdClause}) OR ${containment.sql})`,
          );
          conditionPreview.push(
            `((c.food_id = ANY(${this.formatUuidArray(filters.foodIds)})) OR ${containment.preview})`,
          );
        } else {
          conditions.push(Prisma.sql`(${foodIdClause})`);
          conditionPreview.push(
            `(c.food_id = ANY(${this.formatUuidArray(filters.foodIds)}))`,
          );
        }
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
      );
      conditions.push(clause.sql);
      conditionPreview.push(clause.preview);
    }

    if (filters.minimumVotes !== null) {
      conditions.push(Prisma.sql`c.total_upvotes >= ${filters.minimumVotes}`);
      conditionPreview.push(`c.total_upvotes >= ${filters.minimumVotes}`);
      if (opts.includeVoteRollupCoverage) {
        // COALESCE is load-bearing with the LEFT JOIN: a restaurant whose
        // direct mentions are all shadowed (or all support-kind) has NO rollup
        // row, and an INNER JOIN here silently dropped its dishes even with
        // minimumVotes unset (red team R3).
        conditions.push(
          Prisma.sql`COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`,
        );
        conditionPreview.push(
          `COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`,
        );
      }
      minimumVotesApplied = true;
    }

    return { conditions, conditionPreview, minimumVotesApplied };
  }

  private buildConnectionConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
    minimumVotesApplied: boolean;
  } {
    const { conditions, conditionPreview, minimumVotesApplied } =
      this.buildConnectionConditionParts(filters, {
        includeConnectionIdFilter: true,
        includeVoteRollupCoverage: true,
      });
    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
      minimumVotesApplied,
    };
  }

  private buildConnectionMatchConditions(
    filters: ParsedFilters,
  ): MatchClauseWithPreview {
    const { conditions, conditionPreview } = this.buildConnectionConditionParts(
      filters,
      { includeConnectionIdFilter: false, includeVoteRollupCoverage: false },
    );
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
    if (filters.ingredientIds.length > 0) {
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
    rl.in_scoring_territory,
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
  SELECT rl.location_id, rl.restaurant_id, rl.google_place_id, rl.latitude, rl.longitude, rl.address, rl.city, rl.region, rl.country, rl.postal_code, rl.phone_number, rl.website_url, rl.hours, rl.utc_offset_minutes, rl.time_zone, rl.in_scoring_territory, rl.is_primary, rl.last_polled_at, rl.created_at, rl.updated_at
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE ${wherePreview} AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL AND rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL
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
   * THE ONE GROUND judges, alone (one-ground charter P2, 2026-07-26):
   * ST_Covers(geometry, point) joined straight onto place_geometries and
   * served by its GiST index. The wrap-aware bbox prefilter this replaces
   * hand-rolled the antimeridian arithmetic in raw SQL (one of four copies)
   * for no gain — the ground was already the judge, and a place with no
   * ground still never judges (the join simply finds nothing).
   */
  private buildDistanceOrder(
    searchCenter: { lat: number; lng: number } | null | undefined,
    alias: string,
  ): { sql: Prisma.Sql; preview: string } {
    // STORED fame-pin verdict (ideal-abstraction round 5, measured): the
    // request-time ST_Covers EXISTS here was 99% of every pooled search's
    // cost (3.45s metro → 27ms). in_scoring_territory is recomputed off
    // the hot path (nightly + after score runs).
    const scoringTerritorySql = Prisma.sql`${Prisma.raw(alias)}.in_scoring_territory DESC`;
    const scoringTerritoryPreview = `${alias}.in_scoring_territory DESC`;

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

  /**
   * RESTAURANT ROLLUP = ONE CLAIM, COUNTED ONCE, CREDITED TO THE MOST
   * SPECIFIC CARRIER (charter §2a + §3b, unified 2026-07-28).
   *
   * A claim is one source document saying one thing about one restaurant.
   * It should lift that restaurant exactly once, credited to the most
   * specific thing it named.
   *
   * This replaces a ROW-TYPE test ("does a dish exist under this category?")
   * that could not tell two situations apart, and got each of them wrong:
   *
   *   "Nixta has the best tacos - the duck carnitas taco is unreal"
   *     ONE claim. The row rule suppressed the taco category item and
   *     scored 1 -- right, but by luck.
   *
   *   "Nixta has the best steak. The duck carnitas taco is unreal"
   *     TWO claims about different things. If Nixta happened to have a
   *     steak dish, the row rule suppressed the steak category item and
   *     scored 1, LOSING the steak claim entirely -- because banking files
   *     it as SUPPORT, and this rollup sums DIRECT only. Measured: 514
   *     suppressed category items held 1,532 direct mentions / 2,651 direct
   *     upvotes that counted zero.
   *
   *   "the kung pao chicken here is incredible" (no dishes)
   *     ONE claim that emits BOTH 'kung pao chicken' and its parent
   *     'chicken' as categories. Nothing banks between two category items,
   *     so both counted. Measured: 723 mentions / 1,006 upvotes double-
   *     counted this way.
   *
   * The claim-identity rule fixes all three with one law, because it asks
   * about the DOCUMENT, not the row type: a direct mention is shadowed when
   * the SAME document also directly named something MORE SPECIFIC at the
   * SAME restaurant -- a dish under this category, or a narrower category.
   * Claims from different documents never shadow each other, so a
   * category-only endorsement always survives.
   *
   * Reads the mention LEDGER rather than the item counters. Verified
   * equivalent before switching: 0 of 11,840 items disagreed with their own
   * direct-mention rows, so the ledger changes nothing except the dedup.
   * A mention with no source document cannot be shadowed (it counts).
   */
  private static readonly CLAIM_MENTIONS_FROM_SQL = `
  FROM core_restaurant_item_mentions m
  JOIN core_restaurant_items c ON c.connection_id = m.connection_id`;

  private static readonly CLAIM_IDENTITY_WHERE_SQL = `
    m.kind = 'direct'
    AND NOT EXISTS (
      SELECT 1
      FROM core_restaurant_item_mentions m2
      JOIN core_restaurant_items c2 ON c2.connection_id = m2.connection_id
      WHERE m2.kind = 'direct'
        AND m2.source_document_id IS NOT NULL
        AND m2.source_document_id = m.source_document_id
        AND c2.restaurant_id = c.restaurant_id
        AND c2.food_id <> c.food_id
        -- ONE source of truth for food→category membership (class ⑤,
        -- data-audit P2.4): derived_food_category_edges — what SEARCH
        -- resolves members from. The old projection-array branch was a
        -- second, disagreeing answer (arrays are a strict SUBSET of the
        -- edges; 13.3% of shadow pairs were visible only via edges), so
        -- the shadow verdict silently depended on which branch fired.
        -- Symmetric-claim tiebreak preserved: where both directions are
        -- claimed ('wings' <-> 'chicken wings') the relation means
        -- synonym, and the food_id total order picks exactly ONE survivor
        -- — never both (double count), never neither (claim vanishes).
        AND EXISTS (
          SELECT 1 FROM derived_food_category_edges e
          WHERE e.food_id = c2.food_id AND e.category_id = c.food_id
            AND (
              NOT EXISTS (
                SELECT 1 FROM derived_food_category_edges rev
                WHERE rev.food_id = c.food_id
                  AND rev.category_id = c2.food_id
              )
              OR c2.food_id < c.food_id
            )
        )
    )`;

  private buildRestaurantVoteTotalsCte(): { sql: Prisma.Sql; preview: string } {
    const body = `
  SELECT
    c.restaurant_id,
    SUM(m.source_upvotes) AS total_upvotes,
    COUNT(*) AS total_mentions${SearchQueryBuilder.CLAIM_MENTIONS_FROM_SQL}
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  WHERE ${SearchQueryBuilder.CLAIM_IDENTITY_WHERE_SQL}
  GROUP BY c.restaurant_id`;

    return {
      sql: Prisma.sql`
restaurant_vote_totals AS (${Prisma.raw(body)}
)`,
      preview: `restaurant_vote_totals AS (${body}\n)`,
    };
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
   *   synthesized canon OR the dish IS the ingredient by name ("burrata"
   *   must return dishes NAMED burrata alongside dishes containing it; the
   *   name/alias join covers synthesis gaps — owner ruling 2026-07-25).
   *   Knowledge fills recall ("gruyere" finds dishes whose canon includes
   *   it even when no Redditor named it).
   * (The 'exclude' arm was DELETED 2026-07-30 — spec §1.1: free-text
   * negation is no longer interpreted (owner: accepted-inversion ruling)
   * and allergen toggles were rejected, so nothing produced exclusion ids.
   * Include-only ever since.)
   */
  private buildEffectiveIngredientsClause(ingredientIds: string[]): {
    sql: Prisma.Sql;
    preview: string;
  } {
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
    // Include arm, third branch: the dish IS the ingredient by name — a food
    // entity whose name (or an alias) equals the linked ingredient entity's
    // name (or one of ITS aliases). Covers "burrata" returning dishes named
    // Burrata even when synthesis hasn't stamped their canon yet.
    const namedFood = Prisma.sql`c.food_id IN (
      SELECT f.entity_id FROM core_entities f
      JOIN core_entities i ON i.entity_id IN (${Prisma.join(
        ingredientIds.map((value) => Prisma.sql`${value}::uuid`),
        ', ',
      )})
      WHERE f.type = 'food'
        AND (
          lower(f.name) = lower(i.name)
          OR lower(i.name) IN (SELECT lower(a) FROM unnest(f.aliases) a)
          OR lower(f.name) IN (SELECT lower(a) FROM unnest(i.aliases) a)
        )
    )`;
    return {
      sql: Prisma.sql`(${overlap} OR ${namedFood})`,
      preview: `(${previewCore} OR c.food_id IN (SELECT f.entity_id FROM core_entities f JOIN core_entities i ON i.entity_id IN ${this.formatUuidArray(
        ingredientIds,
      )} WHERE f.type = 'food' AND same-name-or-alias(f, i)))`,
    };
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
