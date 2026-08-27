import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { identityScope } from '../../shared/locale';
import { activePlaceEventExistsSql } from '../content-processing/reddit-collector/extraction-scope.service';
import { servablePlaceConditionsSql } from '../restaurant-enrichment/servable-place-scope';
import {
  conceptArmsOrSql,
  conceptDishAxisSql,
  conceptRestaurantAxisSql,
} from './concept-membership.compiler';
import { EntityScope, FilterClause, QueryPlan } from './dto/search-query.dto';
import type {
  ConceptConstraint,
  SearchExecutionDirectives,
} from './search-execution-directives';

// §16 K3 (operational guard, not a result cap — and NOT the §7-deleted 50k
// viewport LIMIT, which capped RESULTS): the lean open-now candidate query
// (id + hours only) must fetch the WHOLE ranked set so JS openness
// evaluation runs before pagination — the same unbounded-within-viewport
// stance the map coverage layer takes. This literal only bounds a
// pathological query's scan; real viewport candidate sets sit orders of
// magnitude below it, so list openness == map openness in practice. What
// changes it: never tuning — only a proven pathological-scan incident.

export interface BuildPlaceQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
  searchCenter?: { lat: number; lng: number } | null;
  topDishesLimit?: number;
  excludePlaceIds?: string[];
  directives?: SearchExecutionDirectives;
  // PHASE 2 (open-now two-phase hydrate): restrict the rich query to a pre-selected page of
  // restaurant ids, preserving their given order (array_position). When set, the caller has
  // already computed the open page via the candidate query below, so the rich query just
  // hydrates those rows. Undefined ⇒ the query is byte-identical to before.
  restrictToPlaceIds?: string[];
  // PHASE 1 (open-now two-phase candidates): also emit a LEAN query (restaurant_id + hours,
  // same conditions + ranking, NO page limit) so the executor can resolve openness over the
  // full candidate set and paginate the OPEN subset. Off by default ⇒ zero overhead.
}

interface BuildPlaceQueryResult {
  dataSql: Prisma.Sql;
  countSql: Prisma.Sql;
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
  placeIds: string[];
  connectionIds: string[];
  placeAttributeIds: string[];
  itemIds: string[];
  itemTextExpansionIds: string[];
  /** Same-named ingredient twins of the query foods — ORed into the food
   *  clause as containment (evidence + canon tiers). */
  twinIngredientIds: string[];
  itemAttributeIds: string[];
  ingredientIds: string[];
  itemAttributePrimary: boolean;
  boundsPayload: BoundsPayload | null;
  polygonPayload: PolygonPayload | null;
  priceLevels: number[];
  minimumVotes: number | null;
}

interface Clause {
  sql: Prisma.Sql;
}

interface MatchClause extends Clause {
  hasConditions: boolean;
}

@Injectable()
export class SearchQueryBuilder {
  /**
   * Build restaurant query (Query A) - Top restaurants with LATERAL JOIN for top dishes
   */
  buildPlaceQuery(options: BuildPlaceQueryOptions): BuildPlaceQueryResult {
    const {
      plan,
      pagination,
      searchCenter,
      topDishesLimit = 3,
      excludePlaceIds = [],
      directives,
      restrictToPlaceIds,
    } = options;
    const restrictIds =
      restrictToPlaceIds && restrictToPlaceIds.length
        ? restrictToPlaceIds
        : null;
    const filters = this.parseFilters(plan, directives);

    // Build restaurant conditions (restaurant IDs / restaurant attributes / price)
    const { sql: placeWhereSql } = this.buildPlaceConditions(filters, {
      includePlaceAttributes: false,
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
    ) OR ${Prisma.raw(activePlaceEventExistsSql('r.entity_id'))})`;

    const connectionMatch = this.buildConnectionMatchConditions(filters);
    const { sql: connectionMatchSql } = connectionMatch;
    const { sql: placeAttributeMatchSql } =
      this.buildPlaceAttributeMatchConditions(filters);
    const signalMatch = this.buildPlaceEntitySignalMatchConditions(filters);
    const { sql: itemOrSignalMatchSql } =
      this.buildPlaceItemOrSignalMatchConditions(connectionMatch, signalMatch);
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

    // STEP-3 POOLED GATE (spec §1.4; F3/F5 concept shape): tier 0 =
    // restaurant satisfies EVERY soft CONCEPT, each by ANY of its arms —
    // venue side via containment on its own attributes, food side via a
    // connection that matches the (hard) food arms AND carries the
    // concept id (the deliberate tier-0 scoping — see the asymmetry
    // comment on conceptRestaurantAxisSql). AND across concepts, OR
    // within one: a dual-homed cuisine concept is satisfied by either
    // side, never required on both. Soft ids are OUT of membership (the
    // service passes hard-only ids in the plan); walls AND into it below.
    const pooledGate = directives?.pooledGate ?? null;
    const concepts = directives?.concepts ?? [];
    const softConceptsList = pooledGate
      ? concepts.filter((c) => c.hardness === 'soft')
      : [];
    const wallConcepts = concepts.filter((c) => c.hardness === 'wall');
    const restConceptExpr = (
      concept: ConceptConstraint,
      alias: string,
    ): Prisma.Sql =>
      conceptRestaurantAxisSql(concept, alias, {
        dishExistsScopeSql: connectionMatch.hasConditions
          ? connectionMatchSql
          : null,
      }) ?? Prisma.sql`TRUE`;
    const pooledRestFullExpr = (alias: string): Prisma.Sql | null =>
      pooledGate
        ? softConceptsList.length
          ? Prisma.sql`(${Prisma.join(
              softConceptsList.map((concept) =>
                restConceptExpr(concept, alias),
              ),
              ' AND ',
            )})`
          : Prisma.sql`TRUE`
        : null;

    const excludePlacesSql = excludePlaceIds.length
      ? Prisma.sql`AND NOT (${this.buildInClause(
          'r.entity_id',
          excludePlaceIds,
        )})`
      : Prisma.sql``;

    // PHASE 2: restrict eligibility to the pre-selected open page. The candidate query
    // already applied every other condition, so this is a pure id membership narrow.
    const restrictPlacesSql = restrictIds
      ? Prisma.sql`AND (${this.buildInClause('r.entity_id', restrictIds)})`
      : Prisma.sql``;

    // CONCEPT WALLS, restaurant projection (F3 — one renderer for dietary
    // AND cuisine): a restaurant passes each wall when the VENUE carries a
    // restaurant arm OR ANY of its dishes carries a food arm. Per-axis
    // arms come from the facet (dietary asymmetric, cuisine dual-home);
    // the dish EXISTS is deliberately NOT scoped to the query's connection
    // match — a wall asks "is this an X-viable venue", not "does the
    // matching dish happen to be X" (that is the DISH projection's job;
    // see conceptRestaurantAxisSql's asymmetry comment).
    const placeWallConditions = wallConcepts
      .map((concept) => conceptRestaurantAxisSql(concept, 'r'))
      .filter((sql): sql is Prisma.Sql => sql !== null);
    const placeWallsSql = placeWallConditions.length
      ? Prisma.sql`AND ${Prisma.join(placeWallConditions, ' AND ')}`
      : Prisma.sql``;
    const combinedPlaceWhereSql = Prisma.sql`${placeWhereSql} AND ${inventoryExistsSql} AND ${placeAttributeMatchSql} AND ${itemOrSignalMatchSql} ${placeWallsSql} ${excludePlacesSql} ${restrictPlacesSql}`;

    // Build location conditions (bounds)
    const { sql: locationWhereSql, boundsApplied } =
      this.buildLocationConditions(filters);

    // Build minimum votes condition for restaurant totals
    const minimumVotesApplied = filters.minimumVotes !== null;

    // Build CTEs
    const placeCte = this.buildFilteredPlacesCte(combinedPlaceWhereSql);

    const filteredLocationsCte =
      this.buildFilteredLocationsCte(locationWhereSql);

    const { sql: selectedOrderSql } = this.buildDistanceOrder(
      searchCenter,
      'fl',
    );

    const selectedLocationsCte =
      this.buildSelectedLocationsCte(selectedOrderSql);

    const placeVoteTotalsCte = this.buildPlaceVoteTotalsCte();
    const publicPlaceScoresCte = this.buildPublicPlaceScoresCte();
    const publicConnectionScoresCte = this.buildPublicConnectionScoresCte();

    const locationAggregatesCte = this.buildLocationAggregatesCte(searchCenter);

    // Build minimum votes where clause for main query
    const placeSelectConditions: Prisma.Sql[] = [];
    if (filters.minimumVotes) {
      placeSelectConditions.push(
        Prisma.sql`COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`,
      );
    }
    if (this.planRequestsOpenNow(plan)) {
      placeSelectConditions.push(this.buildOpenNowPredicateSql('sl'));
    }
    const minimumVotesWhereSql = placeSelectConditions.length
      ? Prisma.sql`WHERE ${Prisma.join(placeSelectConditions, ' AND ')}`
      : Prisma.sql``;

    // THE GATE (owner ruling 2026-08-01): tier-1 rows admitted only when
    // tier-0 rows cannot fill one page. ONE PASS via a window count — a
    // gate CTE referenced from WHERE gets inlined and re-executes per row
    // (measured seconds); the window aggregate computes once. The hydrate
    // path (restrictIds) NEVER gates — the executor already decided on the
    // openness-aware candidate set and the order is id-position-preserved
    // (spec §1.4.4a/b).
    const pooledGateActive = Boolean(pooledGate) && !restrictIds;
    // B1: openness lives in membership, so the window count is already
    // openness-aware — the gateFull parameterization (spec §1.4.4a) died
    // with the two-phase machine.
    const pooledRestGateWhereSql = pooledGateActive
      ? Prisma.sql`WHERE rrx.match_tier = 0 OR rrx.pooled_full_count < ${pooledGate!.threshold}`
      : Prisma.sql``;
    // Outer ORDER for the pooled wrapper must use OUTPUT column names (the
    // inner aliases prs/rvt/fr are out of scope there).
    const pooledOuterOrderSql = (() => {
      const normalized = (plan.ranking.placeOrder || '').toLowerCase();
      const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
      return normalized.includes('rising')
        ? Prisma.sql`rrx.rising DESC NULLS LAST, rrx.crave_score_exact ${Prisma.raw(direction)}, rrx.total_upvotes ${Prisma.raw(direction)}, rrx.restaurant_id ASC`
        : Prisma.sql`rrx.crave_score_exact ${Prisma.raw(direction)}, rrx.total_upvotes ${Prisma.raw(direction)}, rrx.restaurant_id ASC`;
    })();

    const placeOrder = this.resolvePlaceOrderSql(plan.ranking.placeOrder);
    // Restaurant-axis match_tier: under the pooled gate a restaurant matching
    // every soft word is tier 0, otherwise tier 1; without the gate the column
    // is NULL. (The sectioned-relevancy tier arm that used to sit between the
    // two was deleted with SEARCH_RANKING_MODE — the pooled tier is the one
    // meaning match_tier has left.)
    const pooledRestTierExpr = pooledGate
      ? Prisma.sql`CASE WHEN ${pooledRestFullExpr('fr')} THEN 0 ELSE 1 END`
      : null;
    const restTierExpr = pooledRestTierExpr;
    const restTierSelect = restTierExpr
      ? Prisma.sql`${restTierExpr} AS match_tier,`
      : Prisma.sql`NULL::int AS match_tier,`;
    // OWNER RULING 2026-08-08: tier NEVER orders. match_tier stays selected
    // as row metadata; admission is the gate WHERE's job.
    const restTierOrder = Prisma.sql``;
    const placeTopDishOrder = this.resolveTopDishOrderSql(
      plan.ranking.itemOrder,
    );
    const placeTopDishRankOrder = this.resolveTopDishRankOrderSql(
      plan.ranking.itemOrder,
    );

    // PHASE 2: when hydrating a pre-selected page, preserve the order the candidate query
    // ranked them in (array_position over the id list) rather than re-deriving the ranking.
    const rankedPlacesOrderSql = restrictIds
      ? Prisma.sql`array_position(${restrictIds}::uuid[], fr.entity_id)`
      : Prisma.sql`${restTierOrder}${placeOrder.sql}`;

    // Build the ranked restaurants CTE with LATERAL JOIN for top dishes
    const rankedPlacesCte = pooledGateActive
      ? Prisma.sql`
ranked_restaurants AS (
  SELECT rrx.* FROM (
  SELECT
    fr.entity_id AS restaurant_id,
    ${restTierSelect}
    count(*) FILTER (WHERE ${restTierExpr!} = 0) OVER () AS pooled_full_count,
    fr.name AS place_name,
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
  ORDER BY ${pooledOuterOrderSql}
  OFFSET ${pagination.skip}
  LIMIT ${pagination.take}
)`
      : Prisma.sql`
ranked_restaurants AS (
  SELECT
    fr.entity_id AS restaurant_id,
    ${restTierSelect}
    fr.name AS place_name,
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
	  ORDER BY ${rankedPlacesOrderSql}
	  OFFSET ${pagination.skip}
	  LIMIT ${pagination.take}
	)`;

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${placeCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${placeVoteTotalsCte.sql},
  ${publicPlaceScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${locationAggregatesCte.sql},
  ${rankedPlacesCte}
`;

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
	        -- Keys are the executor's parse contract (parseTopDishesJson):
	        -- the R14 rename moved the parser to itemId/itemName while these
	        -- SQL literals kept the old names, so every ranked restaurant's
	        -- top_dishes parsed to [] (found + fixed 2026-08-19).
	        'itemId', sub.food_id,
	        'itemName', sub.food_name,
	        'craveScore', sub.crave_score,
	        'scoreSubjectType', 'connection',
	        'scoreSubjectId', sub.connection_id,
	        'rising', sub.rising,
	        'scoreInfo', sub.score_info
	      )
      ORDER BY ${placeTopDishOrder.sql}, sub.connection_id ASC
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
		      pcs.percentile_rank AS crave_score_exact,
		      pcs.rising,
		      pcs.score_info,
		      ROW_NUMBER() OVER (ORDER BY ${placeTopDishRankOrder.sql}) AS rn
	    FROM core_restaurant_items c
	    JOIN core_entities f ON f.entity_id = c.food_id
	    JOIN public_connection_scores pcs
	      ON pcs.subject_id = c.connection_id
    WHERE c.restaurant_id = rr.restaurant_id
      -- Rollup rows are never dish rows, in EVERY lane (F9967): the profile
      -- already excludes them, and a restaurant card saying "12 dishes" with
      -- "taco" on it while the profile shows 5 real dishes is the same data
      -- contradicting itself on one screen.
      AND NOT c.is_category_item
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
    -- res.entity_id ASC is the unique tail: this subquery does not restrict
    -- entity type, so two DIFFERENT entities sharing a name and mention_count
    -- are fully tied and the LIMIT 5 cut would admit/drop them arbitrarily
    -- (F7602, the F3802 determinism family). entity_id is unique per row.
    ORDER BY res.mention_count DESC, e.name ASC, res.entity_id ASC
    LIMIT 5
  ) tag_rows
) tm ON ${signalMatch.hasConditions ? Prisma.sql`TRUE` : Prisma.sql`FALSE`}`;

    const openNowSupportedSelectSql = this.buildOpenNowSupportedSelectSql(plan);
    const countSql = pooledGateActive
      ? Prisma.sql`
WITH
  ${placeCte.sql},
		  ${filteredLocationsCte.sql},
	  ${selectedLocationsCte.sql},
	  ${placeVoteTotalsCte.sql},
	  ${publicPlaceScoresCte.sql}
	SELECT COUNT(DISTINCT rrx.restaurant_id)::bigint AS total_restaurants,
	  COALESCE(MAX(rrx.pooled_full_count), 0)::bigint AS full_restaurants,
	  ${
      softConceptsList.length > 0
        ? Prisma.sql`json_build_object(${Prisma.join(
            softConceptsList.map(
              (concept, i) =>
                Prisma.sql`${concept.id}::text, COALESCE(MAX(rrx.rswc_${Prisma.raw(String(i))}), 0)::int`,
            ),
            ', ',
          )})`
        : Prisma.sql`NULL`
    } AS soft_word_counts${openNowSupportedSelectSql}
	FROM (
	  SELECT fr.entity_id AS restaurant_id,
	    ${restTierExpr!} AS match_tier,
	    count(*) FILTER (WHERE ${restTierExpr!} = 0) OVER () AS pooled_full_count${
        softConceptsList.length
          ? Prisma.sql`,
	    ${Prisma.join(
        softConceptsList.map(
          (concept, i) =>
            Prisma.sql`count(*) FILTER (WHERE ${restConceptExpr(concept, 'fr')}) OVER () AS rswc_${Prisma.raw(String(i))}`,
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
  ${placeCte.sql},
		  ${filteredLocationsCte.sql},
	  ${selectedLocationsCte.sql},
	  ${placeVoteTotalsCte.sql},
	  ${publicPlaceScoresCte.sql}
	SELECT COUNT(DISTINCT fr.entity_id)::bigint AS total_restaurants${openNowSupportedSelectSql}
	FROM filtered_restaurants fr
	JOIN public_restaurant_scores prs ON prs.subject_id = fr.entity_id
	JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
	LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	${minimumVotesWhereSql}`;

    return {
      dataSql,
      countSql,
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
    const { sql: placeWhereSql } = this.buildPlaceConditions(filters);

    // Build location conditions (bounds)
    const { sql: locationWhereSql, boundsApplied } =
      this.buildLocationConditions(filters);

    // STEP-3 POOLED GATE (spec §1.4): tier 0 = the row satisfies EVERY soft
    // attribute id ("all words"); tier 1 = partial. Soft ids are OUT of the
    // WHERE membership (the service passes hard-only ids in the plan), so
    // one execution holds the whole pool; the gate below decides whether
    // tier-1 rows are admitted.
    const pooledGate = directives?.pooledGate ?? null;
    const concepts = directives?.concepts ?? [];
    const softConceptsList = pooledGate
      ? concepts.filter((c) => c.hardness === 'soft')
      : [];
    const wallConcepts = concepts.filter((c) => c.hardness === 'wall');
    // F3/F5 concept shape: AND across concepts, OR within one — a
    // dual-homed cuisine concept is satisfied by the dish carrying it OR
    // the venue carrying it, never required on both (the naive dual
    // projection that gets stricter).
    const dishConceptExpr = (concept: ConceptConstraint): Prisma.Sql =>
      conceptDishAxisSql(concept, { connection: 'c', restaurant: 'fr' }) ??
      Prisma.sql`TRUE`;
    const pooledFullExprSql = pooledGate
      ? softConceptsList.length
        ? Prisma.sql`(${Prisma.join(
            softConceptsList.map(dishConceptExpr),
            ' AND ',
          )})`
        : Prisma.sql`TRUE`
      : null;
    const similarRingIds = pooledGate?.similarItemIds ?? [];
    const pooledTierCteSelectSql = pooledFullExprSql
      ? Prisma.sql`,
    CASE ${
      similarRingIds.length
        ? Prisma.sql`WHEN c.food_id = ANY(${similarRingIds}::uuid[]) THEN 2 `
        : Prisma.sql``
    }WHEN ${pooledFullExprSql} THEN 0 ELSE 1 END AS pooled_tier`
      : Prisma.sql``;

    // Build connection conditions (food entity search)
    const { sql: connectionWhereSql, minimumVotesApplied } =
      this.buildConnectionConditions(filters);

    const excludeConnectionsSql = excludeConnectionIds.length
      ? Prisma.sql`AND NOT (${this.buildInClause(
          'c.connection_id',
          excludeConnectionIds,
        )})`
      : Prisma.sql``;

    // TIER-2 ring admission: ring rows enter the SCAN (so the window can
    // count them) but never the served page (the gate WHERE excludes
    // tier 2). Dish axis only — the restaurant query is untouched.
    const ringAdmissionSql = similarRingIds.length
      ? Prisma.sql`OR c.food_id = ANY(${similarRingIds}::uuid[])`
      : Prisma.sql``;
    const dishOpenNowSql = this.planRequestsOpenNow(plan)
      ? Prisma.sql`AND ${this.buildOpenNowPredicateSql('sl')}`
      : Prisma.sql``;
    // CONCEPT WALLS, dish projection (F3 — one renderer for dietary AND
    // cuisine): each wall's dish-axis arms, ORed within a concept and
    // ANDed across. A dietary wall carries only its dish-side arm here (a
    // dish serves ONLY when IT carries the attribute — owner semantics
    // 2026-08-04; a wall with no dish-side entity does not constrain
    // dishes). A cuisine wall carries both homes: the Mexican taco at the
    // Korean spot surfaces through the dish arm; the Mexican restaurant's
    // menu through the venue arm.
    const dishWallConditions = wallConcepts
      .map((concept) =>
        conceptDishAxisSql(concept, { connection: 'c', restaurant: 'fr' }),
      )
      .filter((sql): sql is Prisma.Sql => sql !== null);
    const dishWallsSql = dishWallConditions.length
      ? Prisma.sql`AND ${Prisma.join(dishWallConditions, ' AND ')}`
      : Prisma.sql``;
    const combinedConnectionWhereSql = Prisma.sql`(${connectionWhereSql} ${ringAdmissionSql}) ${dishWallsSql} ${dishOpenNowSql} ${excludeConnectionsSql}`;

    // Build CTEs
    const placeCte = Prisma.sql`
filtered_restaurants AS (
  SELECT
    r.entity_id,
    r.name,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${placeWhereSql}
)`;

    const filteredLocationsCte =
      this.buildFilteredLocationsCte(locationWhereSql);

    const { sql: selectedOrderSql } = this.buildDistanceOrder(
      searchCenter,
      'fl',
    );

    const selectedLocationsCte =
      this.buildSelectedLocationsCte(selectedOrderSql);

    const placeVoteTotalsCte = this.buildPlaceVoteTotalsCte();
    const publicPlaceScoresCte = this.buildPublicPlaceScoresCte();
    const publicConnectionScoresCte = this.buildPublicConnectionScoresCte();

    // Build filtered connections CTE with restaurant data for map pins
    const filteredConnectionsCte = Prisma.sql`
filtered_connections AS (
  SELECT
    c.connection_id,
    c.restaurant_id,
    c.food_id,
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
    -- Restaurant data for map pins
    fr.entity_id AS place_entity_id,
    fr.name AS place_name,
    fr.restaurant_attributes AS place_attributes_arr,
    prs.display_score AS place_crave_score,
    prs.percentile_rank AS place_crave_score_exact,
    prs.rising AS place_rising,
    prs.score_info AS place_score_info,
    fr.price_level AS place_price_level,
    fr.price_level_updated_at AS place_price_level_updated_at,
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

    const order = this.resolveDishOrderSql(plan.ranking.itemOrder);

    // match_tier on the wire: under the pooled gate it IS the pooled tier
    // (all-words vs partial); without the gate the column is NULL. (The
    // sectioned-relevancy CASE arm that used to sit between the two was
    // deleted with SEARCH_RANKING_MODE.)
    const tierSelectSql = pooledGate
      ? Prisma.sql`, fc.pooled_tier AS match_tier`
      : Prisma.sql`, NULL::int AS match_tier`;
    // OWNER RULING 2026-08-08: tier never orders — admission only.
    const tierOrderSql = Prisma.sql``;

    // THE GATE (owner ruling 2026-08-01: page 1 fills with all-word matches;
    // partial admitted only when they cannot fill it). ONE PASS, window
    // count — a gate CTE referenced from WHERE gets INLINED by Postgres and
    // re-executes per row (measured 20.9s); the window aggregate is
    // computed once over the pool (round-2's proven 5.98ms shape).
    // B1: openness lives in membership — the window count is openness-
    // aware by construction (gateFull died with the two-phase machine).
    // Tier 2 (the similar ring) is in the SCAN for the window counts but
    // never on the served page — the Include-similar chip re-queries with
    // the ring as tier-1 MEMBERS instead (membership flip, not a re-run).
    const pooledGateWhereSql = pooledGate
      ? // COUSIN AUTO-FILL (owner ruling 2026-08-06): the judged ring (tier
        // 2) serves ONLY when everything more exact — full matches plus
        // admitted partials — cannot fill the page. Same admission
        // discipline as partials themselves; one list, Crave Score order.
        // The Include-similar chip stays as the *intent* door (ring joins
        // membership outright), independent of fill.
        Prisma.sql`WHERE fc.pooled_tier = 0 OR (fc.pooled_tier = 1 AND fc.pooled_full_count < ${pooledGate.threshold}) OR (fc.pooled_tier = 2 AND fc.pooled_eligible_count < ${pooledGate.threshold})`
      : Prisma.sql``;

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${placeCte},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${placeVoteTotalsCte.sql},
  ${publicPlaceScoresCte.sql},
  ${publicConnectionScoresCte.sql},
  ${filteredConnectionsCte}
`;

    const dataSql = pooledGate
      ? Prisma.sql`
${withClause}
SELECT fc.*, fc.pooled_tier AS match_tier
FROM (
  SELECT fci.*,
    count(*) FILTER (WHERE fci.pooled_tier = 0) OVER () AS pooled_full_count,
    count(*) FILTER (WHERE fci.pooled_tier <= 1) OVER () AS pooled_eligible_count
  FROM filtered_connections fci
) fc
${pooledGateWhereSql}
ORDER BY ${order.sql}
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
    const softConcepts = softConceptsList;
    // One window — and ONE JSON key — per CONCEPT (F5: the two-list shape
    // gave a dual-homed cuisine id two identical JSON keys, last write
    // wins). The wrapper reads the CTE's output columns, so the food home
    // is fci.food_attributes and the venue home fci.place_attributes_arr.
    const conceptCountExpr = (concept: ConceptConstraint): Prisma.Sql =>
      conceptArmsOrSql(concept.dishArms, (arm) =>
        arm.column === 'food_attributes'
          ? Prisma.sql`fci.food_attributes @> ARRAY[${arm.id}]::uuid[]`
          : Prisma.sql`fci.place_attributes_arr @> ARRAY[${arm.id}]::uuid[]`,
      ) ?? Prisma.sql`TRUE`;
    const softCountWindowsSql = softConcepts.length
      ? Prisma.sql`,
    ${Prisma.join(
      softConcepts.map(
        (concept, i) =>
          Prisma.sql`count(*) FILTER (WHERE ${conceptCountExpr(concept)}) OVER () AS swc_${Prisma.raw(String(i))}`,
      ),
      ',\n    ',
    )}`
      : Prisma.sql``;
    const dishSoftWordCountsSql = softConcepts.length
      ? Prisma.sql`json_build_object(${Prisma.join(
          softConcepts.map(
            (concept, i) =>
              Prisma.sql`${concept.id}::text, COALESCE(MAX(fc.swc_${Prisma.raw(String(i))}), 0)::int`,
          ),
          ', ',
        )})`
      : Prisma.sql`NULL`;
    const openNowSupportedSelectSql = this.buildOpenNowSupportedSelectSql(plan);
    const countSql = pooledGate
      ? Prisma.sql`
${withClause}
SELECT
  COUNT(*)::bigint AS total_connections,
  COUNT(DISTINCT fc.restaurant_id)::bigint AS total_restaurants,
  COALESCE(MAX(fc.pooled_full_count), 0)::bigint AS full_connections,
  COALESCE(MAX(fc.similar_count), 0)::bigint AS similar_connections,
  ${dishSoftWordCountsSql} AS soft_word_counts${openNowSupportedSelectSql}
FROM (
  SELECT fci.*,
    count(*) FILTER (WHERE fci.pooled_tier = 0) OVER () AS pooled_full_count,
    count(*) FILTER (WHERE fci.pooled_tier <= 1) OVER () AS pooled_eligible_count,
    count(*) FILTER (WHERE fci.pooled_tier = 2) OVER () AS similar_count${softCountWindowsSql}
  FROM filtered_connections fci
) fc
${pooledGateWhereSql}`
      : Prisma.sql`
${withClause}
SELECT
  COUNT(*)::bigint AS total_connections,
  COUNT(DISTINCT fc.restaurant_id)::bigint AS total_restaurants${openNowSupportedSelectSql}
FROM filtered_connections fc`;

    return {
      dataSql,
      countSql,
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
      placeIds: this.collectEntityIds(plan.placeFilters, EntityScope.PLACE),
      connectionIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.CONNECTION,
      ),
      placeAttributeIds: this.collectEntityIds(
        plan.placeFilters,
        EntityScope.PLACE_ATTRIBUTE,
      ),
      itemIds: this.collectEntityIds(connectionFilters, EntityScope.ITEM),
      itemTextExpansionIds: directives?.primaryItemAttributeTextItemIds ?? [],
      twinIngredientIds: directives?.twinIngredientIds ?? [],
      itemAttributeIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.ITEM_ATTRIBUTE,
      ),
      ingredientIds: this.collectEntityIds(
        connectionFilters,
        EntityScope.INGREDIENT,
      ),
      itemAttributePrimary: Boolean(directives?.primaryItemAttributeQuery),
      boundsPayload: this.extractBoundsPayload(plan.placeFilters),
      polygonPayload: this.extractPolygonPayload(plan.placeFilters),
      priceLevels: this.extractPriceLevels(plan.placeFilters),
      minimumVotes: this.extractMinimumVotes(connectionFilters),
    };
  }

  private buildPlaceConditions(
    filters: ParsedFilters,
    options?: { includePlaceAttributes?: boolean },
  ): { sql: Prisma.Sql } {
    const includePlaceAttributes = options?.includePlaceAttributes ?? true;
    // THE SERVABLE-PLACE FLOOR, through the one shared fragment (red-team
    // L3 F1): place row, ARCHIVED IS NEVER SERVED (final-final red team
    // MEDIUM-1: 242 archived-but-scored restaurants hidden only by the
    // location gate), and MARKET MEMBERSHIP (v17 S4: out-of-market places
    // are excluded, never deleted; verdict stored by the market-membership
    // reconciler, NULL = in market). Never hand-roll these predicates —
    // compose servablePlaceConditionsSql.
    const conditions: Prisma.Sql[] = [
      Prisma.raw(servablePlaceConditionsSql('r')),
    ];

    if (filters.placeIds.length) {
      conditions.push(this.buildInClause('r.entity_id', filters.placeIds));
    }

    if (includePlaceAttributes && filters.placeAttributeIds.length) {
      conditions.push(
        this.buildArrayOverlapClause(
          'r.restaurant_attributes',
          filters.placeAttributeIds,
        ),
      );
    }

    if (filters.priceLevels.length) {
      conditions.push(
        this.buildNumberInClause('r.price_level', filters.priceLevels),
      );
    }

    return { sql: this.combineSqlClauses(conditions) };
  }

  private buildPlaceAttributeMatchConditions(filters: ParsedFilters): Clause {
    if (!filters.placeAttributeIds.length) {
      return { sql: Prisma.sql`TRUE` };
    }

    // Archived attribute ids must not be a working filter (final-final
    // red team MEDIUM-1: 11 live restaurants still match on archived
    // vocabulary through the raw array overlap).
    const directMatchSql = Prisma.sql`(${this.buildArrayOverlapClause(
      'r.restaurant_attributes',
      filters.placeAttributeIds,
    )} AND EXISTS (
      SELECT 1 FROM core_entities attr_live
      WHERE attr_live.entity_id = ANY(r.restaurant_attributes)
        AND attr_live.entity_id = ANY(${filters.placeAttributeIds}::uuid[])
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
    return { sql: Prisma.sql`(${directMatchSql})` };
  }

  private buildLocationConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    boundsApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
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
      boundsApplied = true;
    } else if (filters.boundsPayload) {
      conditions.push(
        Prisma.sql`rl.latitude BETWEEN ${filters.boundsPayload.southWest.lat} AND ${filters.boundsPayload.northEast.lat}`,
      );
      conditions.push(
        Prisma.sql`rl.longitude BETWEEN ${filters.boundsPayload.southWest.lng} AND ${filters.boundsPayload.northEast.lng}`,
      );
      boundsApplied = true;
    }

    // The viewport IS the geographic query (master plan §7): no market filter
    // exists here — results are whatever the polygon/bounds admit, worldwide.

    return {
      sql: this.combineSqlClauses(conditions),
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
    minimumVotesApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
    let minimumVotesApplied = false;

    // First-class inbound connection filter (favorites dish lists hydrate exact
    // connection IDs). Mirrors the excludeConnectionIds column + ANY style.
    if (opts.includeConnectionIdFilter && filters.connectionIds.length) {
      conditions.push(
        this.buildInClause('c.connection_id', filters.connectionIds),
      );
    }

    const shouldOrPrimaryItemAttributeEvidence =
      filters.itemAttributePrimary &&
      filters.itemAttributeIds.length > 0 &&
      filters.itemTextExpansionIds.length > 0 &&
      filters.itemIds.length === 0;
    if (shouldOrPrimaryItemAttributeEvidence) {
      const attributeClause = this.buildArrayOverlapClause(
        'c.food_attributes',
        filters.itemAttributeIds,
      );
      const itemIdClause = this.buildInClause(
        'c.food_id',
        filters.itemTextExpansionIds,
      );
      conditions.push(Prisma.sql`((${attributeClause}) OR (${itemIdClause}))`);
    } else {
      if (filters.itemIds.length) {
        // Category membership is resolved at PLAN time from the canonical
        // per-food edge table (derived_food_category_edges) and arrives here as
        // extra food ids — the per-connection `c.categories &&` arm is gone
        // (per-mention arrays made membership a coin flip per connection).
        // Name-containment variants also arrive as extra food ids (the
        // 2026-07-25 failsafe). Twin-ingredient union: when the query food's
        // name is also an ingredient ("burrata"), dishes CONTAINING it
        // qualify too — OR of the same two containment tiers the ingredient
        // clause uses.
        const itemIdClause = this.buildInClause('c.food_id', filters.itemIds);
        if (filters.twinIngredientIds.length) {
          const containment = this.buildEffectiveIngredientsClause(
            filters.twinIngredientIds,
          );
          conditions.push(
            Prisma.sql`((${itemIdClause}) OR ${containment.sql})`,
          );
        } else {
          conditions.push(Prisma.sql`(${itemIdClause})`);
        }
      }

      if (filters.itemAttributeIds.length) {
        conditions.push(
          this.buildArrayOverlapClause(
            'c.food_attributes',
            filters.itemAttributeIds,
          ),
        );
      }
    }

    if (filters.ingredientIds.length) {
      const clause = this.buildEffectiveIngredientsClause(
        filters.ingredientIds,
      );
      conditions.push(clause.sql);
    }

    if (filters.minimumVotes !== null) {
      conditions.push(Prisma.sql`c.total_upvotes >= ${filters.minimumVotes}`);
      if (opts.includeVoteRollupCoverage) {
        // COALESCE is load-bearing with the LEFT JOIN: a restaurant whose
        // direct mentions are all shadowed (or all support-kind) has NO rollup
        // row, and an INNER JOIN here silently dropped its dishes even with
        // minimumVotes unset (red team R3).
        conditions.push(
          Prisma.sql`COALESCE(rvt.total_upvotes, 0) >= ${filters.minimumVotes}`,
        );
      }
      minimumVotesApplied = true;
    }

    return { conditions, minimumVotesApplied };
  }

  private buildConnectionConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    minimumVotesApplied: boolean;
  } {
    const { conditions, minimumVotesApplied } =
      this.buildConnectionConditionParts(filters, {
        includeConnectionIdFilter: true,
        includeVoteRollupCoverage: true,
      });
    return {
      sql: this.combineSqlClauses(conditions),
      minimumVotesApplied,
    };
  }

  private buildConnectionMatchConditions(filters: ParsedFilters): MatchClause {
    const { conditions } = this.buildConnectionConditionParts(filters, {
      includeConnectionIdFilter: false,
      includeVoteRollupCoverage: false,
    });
    return {
      sql: this.combineSqlClauses(conditions),
      hasConditions: conditions.length > 0,
    };
  }

  private buildPlaceEntitySignalMatchConditions(
    filters: ParsedFilters,
  ): MatchClause {
    // Ingredient constraints are item-level claims by nature; name-level
    // praise signals carry no ingredient data, so a signal-only admission
    // cannot honor them (worst case: a restaurant card whose dish list is
    // entirely filtered out). With either ingredient lane active, admission
    // must come from connection evidence that passed the ingredient clause.
    if (filters.ingredientIds.length > 0) {
      return {
        sql: this.combineSqlClauses([]),
        hasConditions: false,
      };
    }

    const conditions: Prisma.Sql[] = [];

    const shouldOrPrimaryItemAttributeEvidence =
      filters.itemAttributePrimary &&
      filters.itemAttributeIds.length > 0 &&
      filters.itemTextExpansionIds.length > 0 &&
      filters.itemIds.length === 0;

    if (shouldOrPrimaryItemAttributeEvidence) {
      const attributeClause = this.buildInClause(
        'res.entity_id',
        filters.itemAttributeIds,
      );
      const itemClause = this.buildInClause(
        'res.entity_id',
        filters.itemTextExpansionIds,
      );
      conditions.push(Prisma.sql`((${attributeClause}) OR (${itemClause}))`);
    } else {
      if (filters.itemIds.length) {
        conditions.push(this.buildInClause('res.entity_id', filters.itemIds));
      }

      if (filters.itemAttributeIds.length) {
        conditions.push(
          this.buildInClause('res.entity_id', filters.itemAttributeIds),
        );
      }
    }

    return {
      sql: this.combineSqlClauses(conditions),
      hasConditions: conditions.length > 0,
    };
  }

  private buildPlaceItemOrSignalMatchConditions(
    connectionMatch: MatchClause,
    signalMatch: MatchClause,
  ): Clause {
    if (!connectionMatch.hasConditions && !signalMatch.hasConditions) {
      return { sql: Prisma.sql`TRUE` };
    }

    const branches: Prisma.Sql[] = [];

    if (connectionMatch.hasConditions) {
      branches.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM core_restaurant_items c
        WHERE c.restaurant_id = r.entity_id
          AND ${connectionMatch.sql}
      )`);
    }

    if (signalMatch.hasConditions) {
      branches.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM core_restaurant_entity_signals res
        WHERE res.restaurant_id = r.entity_id
          AND ${signalMatch.sql}
      )`);
    }

    if (branches.length === 1) {
      return { sql: branches[0] };
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
    };
  }

  private buildFilteredPlacesCte(whereSql: Prisma.Sql): {
    sql: Prisma.Sql;
  } {
    const sql = Prisma.sql`
filtered_restaurants AS (
  SELECT
    r.entity_id,
    r.name,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${whereSql}
)`;

    return { sql };
  }

  private buildFilteredLocationsCte(whereSql: Prisma.Sql): {
    sql: Prisma.Sql;
  } {
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

    return { sql };
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
  /** B1 (round-5 ideal): open-now as a SQL membership predicate over the
   *  derived interval table — DST-correct via the IANA zone, parity-proven
   *  500/500 against the JS evaluator. The second arm is the graceful-
   *  degradation contract: when NO location in the viewport pool carries
   *  hours at all, the filter is inapplicable and nothing is hidden
   *  (uncorrelated subquery — planned once as an InitPlan). Openness in
   *  MEMBERSHIP means every window count (gate, similar, per-word) is
   *  openness-aware by construction — the old two-phase candidate/hydrate
   *  machine and the gateFull parameterization dissolve.
   */
  private buildOpenNowPredicateSql(locationAlias: string): Prisma.Sql {
    const sl = Prisma.raw(locationAlias);
    return Prisma.sql`(
      EXISTS (
        SELECT 1 FROM derived_location_open_intervals oi
        WHERE oi.location_id = ${sl}.location_id
          AND oi.dow = EXTRACT(dow FROM (now() AT TIME ZONE ${sl}.time_zone))::int
          AND (EXTRACT(hour FROM (now() AT TIME ZONE ${sl}.time_zone))::int * 60
               + EXTRACT(minute FROM (now() AT TIME ZONE ${sl}.time_zone))::int) >= oi.start_min
          AND (EXTRACT(hour FROM (now() AT TIME ZONE ${sl}.time_zone))::int * 60
               + EXTRACT(minute FROM (now() AT TIME ZONE ${sl}.time_zone))::int) < oi.end_min
      )
      OR NOT EXISTS (
        SELECT 1 FROM filtered_locations fl_any
        JOIN derived_location_open_intervals oi_any ON oi_any.location_id = fl_any.location_id
      )
    )`;
  }

  /** OPEN-NOW FLAG HONESTY (⭐05 finding (e), 2026-08-19): the predicate
   *  above degrades gracefully — when NO location in the pool carries hours,
   *  its second arm admits everything and nothing was actually constrained.
   *  The executor used to report openNowApplied = "the filter was
   *  REQUESTED"; this select rides the count query and reports whether the
   *  pool held any hours at all — the exact negation of the degradation arm,
   *  so the flag states what actually constrained the results. Empty when
   *  open-now was not requested (column absent, executor reads undefined). */
  private buildOpenNowSupportedSelectSql(plan: QueryPlan): Prisma.Sql {
    if (!this.planRequestsOpenNow(plan)) {
      return Prisma.sql``;
    }
    return Prisma.sql`,
  EXISTS (
    SELECT 1 FROM filtered_locations fl_hours
    JOIN derived_location_open_intervals oi_hours
      ON oi_hours.location_id = fl_hours.location_id
  ) AS open_now_supported`;
  }

  private planRequestsOpenNow(plan: QueryPlan): boolean {
    return plan.placeFilters.some((filter) =>
      Boolean((filter.payload as { openNow?: unknown } | undefined)?.openNow),
    );
  }

  private buildDistanceOrder(
    searchCenter: { lat: number; lng: number } | null | undefined,
    alias: string,
  ): { sql: Prisma.Sql } {
    // STORED fame-pin verdict (ideal-abstraction round 5, measured): the
    // request-time ST_Covers EXISTS here was 99% of every pooled search's
    // cost (3.45s metro → 27ms). in_scoring_territory is recomputed off
    // the hot path (nightly + after score runs).
    const scoringTerritorySql = Prisma.sql`${Prisma.raw(alias)}.in_scoring_territory DESC`;

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
      };
    }

    const distanceSql = Prisma.sql`(POWER(${Prisma.raw(alias)}.latitude - ${
      searchCenter.lat
    }, 2) + POWER(${Prisma.raw(alias)}.longitude - ${searchCenter.lng}, 2))`;

    return {
      sql: Prisma.sql`${Prisma.raw(
        alias,
      )}.restaurant_id, ${scoringTerritorySql}, ${distanceSql} ASC, ${Prisma.raw(
        alias,
      )}.updated_at DESC`,
    };
  }

  private buildSelectedLocationsCte(orderSql: Prisma.Sql): {
    sql: Prisma.Sql;
  } {
    const sql = Prisma.sql`
selected_locations AS (
  SELECT DISTINCT ON (fl.restaurant_id)
    fl.*
  FROM filtered_locations fl
  ORDER BY ${orderSql}
)`;

    return { sql };
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

  private buildPlaceVoteTotalsCte(): { sql: Prisma.Sql } {
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
    };
  }

  private buildPublicPlaceScoresCte(): { sql: Prisma.Sql } {
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

    return { sql };
  }

  private buildPublicConnectionScoresCte(): { sql: Prisma.Sql } {
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

    return { sql };
  }

  private buildLocationAggregatesCte(
    searchCenter?: { lat: number; lng: number } | null,
  ): { sql: Prisma.Sql } {
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

    return { sql };
  }

  private resolveDishOrderSql(order?: string): { sql: Prisma.Sql } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`fc.connection_rising DESC NULLS LAST, fc.connection_crave_score_exact ${Prisma.raw(
          direction,
        )}, fc.total_upvotes ${Prisma.raw(
          direction,
        )}, fc.mention_count ${Prisma.raw(direction)}, fc.connection_id ASC`,
      };
    }
    return {
      // HIGH-PRECISION: connection_crave_score_exact (percentile_rank) is THE
      // score key. The rounded display score left the ORDER BY (2026-08-08):
      // it is derived from the exact key by rounding, so it can never split a
      // tie the exact key left — upvotes + mentions + id are the tiebreaks.
      sql: Prisma.sql`fc.connection_crave_score_exact ${Prisma.raw(direction)}, fc.total_upvotes ${Prisma.raw(
        direction,
      )}, fc.mention_count ${Prisma.raw(direction)}, fc.connection_id ASC`,
    };
  }

  private resolvePlaceOrderSql(order?: string): { sql: Prisma.Sql } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`prs.rising DESC NULLS LAST,
      prs.percentile_rank ${Prisma.raw(direction)},
      COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
      fr.entity_id ASC`,
      };
    }
    return {
      // HIGH-PRECISION CRAVE ORDER: percentile_rank (Decimal(6,5)) is THE score key, then upvotes, then a
      // stable id — the SAME chain the pooled wrapper uses (pooledOuterOrderSql), so the two restaurant
      // paths cannot disagree. display_score is derived from percentile_rank by rounding, so it can never
      // split a tie the exact key left; it left the ORDER BY with the rest of them.
      sql: Prisma.sql`prs.percentile_rank ${Prisma.raw(direction)},
      COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
      fr.entity_id ASC`,
    };
  }

  // THE ROUNDED SCORE NEVER ORDERS (2026-08-08 ruling, completed here): the
  // restaurant card's top-N membership AND its order ride the SAME exact chain
  // as the dish axis — percentile_rank, then upvotes, mentions, id. While these
  // two ordered by display_score (Decimal(4,2)) the map pin's top dish and the
  // card's top dish could disagree on the same screen over a rounding tie.
  private resolveTopDishOrderSql(order?: string): { sql: Prisma.Sql } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`sub.rising DESC NULLS LAST, sub.crave_score_exact ${Prisma.raw(
          direction,
        )}, sub.total_upvotes ${Prisma.raw(
          direction,
        )}, sub.mention_count ${Prisma.raw(direction)}`,
      };
    }
    return {
      sql: Prisma.sql`sub.crave_score_exact ${Prisma.raw(
        direction,
      )}, sub.total_upvotes ${Prisma.raw(
        direction,
      )}, sub.mention_count ${Prisma.raw(direction)}`,
    };
  }

  private resolveTopDishRankOrderSql(order?: string): { sql: Prisma.Sql } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    if (normalized.includes('rising')) {
      return {
        sql: Prisma.sql`pcs.rising DESC NULLS LAST, pcs.percentile_rank ${Prisma.raw(
          direction,
        )}, c.total_upvotes ${Prisma.raw(
          direction,
        )}, c.mention_count ${Prisma.raw(direction)}, c.connection_id ASC`,
      };
    }
    return {
      sql: Prisma.sql`pcs.percentile_rank ${Prisma.raw(
        direction,
      )}, c.total_upvotes ${Prisma.raw(
        direction,
      )}, c.mention_count ${Prisma.raw(direction)}, c.connection_id ASC`,
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
   * (The 'exclude' arm was DELETED 2026-07-30 and STAYS deleted under
   * negation v2 (owner ruling 2026-08-08, plan §12b): query text NEVER
   * produces exclusions — negated words ground positively. The only real
   * exclusions in the product are the dietary toggle walls, which act as
   * their own directive, not as ids on this clause.)
   */
  private buildEffectiveIngredientsClause(ingredientIds: string[]): {
    sql: Prisma.Sql;
  } {
    const overlap = Prisma.sql`((${this.buildArrayOverlapClause(
      'c.ingredients',
      ingredientIds,
    )}) OR c.food_id IN (SELECT entity_id FROM core_entities WHERE canonical_ingredients && ${this.buildUuidArray(
      ingredientIds,
    )}))`;
    // Include arm, third branch: the dish IS the ingredient by name — a food
    // entity whose name (or an alias) equals the linked ingredient entity's
    // name (or one of ITS aliases). Covers "burrata" returning dishes named
    // Burrata even when synthesis hasn't stamped their canon yet.
    const namedItem = Prisma.sql`c.food_id IN (
      SELECT f.entity_id FROM core_entities f
      JOIN core_entities i ON i.entity_id IN (${Prisma.join(
        ingredientIds.map((value) => Prisma.sql`${value}::uuid`),
        ', ',
      )})
      WHERE f.type = 'item'
        -- Fold-symmetric on both sides (identity_key = canonicalFold(name),
        -- form_folded = canonicalFold(form)); see the same three arms in
        -- search-sibling-expansion.getSameNamedIngredientIds.
        AND (
          f.identity_key = i.identity_key
          OR EXISTS (
            SELECT 1 FROM entity_surface s
             WHERE s.entity_id = f.entity_id
               AND ${identityScope('s')}
               AND s.form_folded = i.identity_key
          )
          OR EXISTS (
            SELECT 1 FROM entity_surface s
             WHERE s.entity_id = i.entity_id
               AND ${identityScope('s')}
               AND s.form_folded = f.identity_key
          )
        )
    )`;
    return { sql: Prisma.sql`(${overlap} OR ${namedItem})` };
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

  private buildSmallintArray(values: number[]): Prisma.Sql {
    const mapped = Prisma.join(
      values.map((value) => Prisma.sql`${value}`),
      ', ',
    );
    return Prisma.sql`ARRAY[${mapped}]::smallint[]`;
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
}
