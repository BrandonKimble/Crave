import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntityScope, FilterClause, QueryPlan } from './dto/search-query.dto';
import type { SearchExecutionDirectives } from './search-execution-directives';

interface BuildQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
  searchCenter?: { lat: number; lng: number } | null;
}

interface BuildQueryResult {
  dataSql: Prisma.Sql;
  countSql: Prisma.Sql;
  preview: string;
  metadata: {
    boundsApplied: boolean;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
}

interface BuildRestaurantQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
  searchCenter?: { lat: number; lng: number } | null;
  topDishesLimit?: number;
  excludeRestaurantIds?: string[];
  directives?: SearchExecutionDirectives;
}

interface BuildRestaurantQueryResult {
  dataSql: Prisma.Sql;
  countSql: Prisma.Sql;
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

interface PriceFilterPayload {
  priceLevels: number[];
}

interface MinimumVotesPayload extends Record<string, unknown> {
  minimumVotes?: number | null;
}

interface ParsedFilters {
  restaurantIds: string[];
  restaurantAttributeIds: string[];
  foodIds: string[];
  foodTextExpansionIds: string[];
  foodAttributeIds: string[];
  foodAttributePrimary: boolean;
  boundsPayload: BoundsPayload | null;
  priceLevels: number[];
  minimumVotes: number | null;
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
    } = options;
    const filters = this.parseFilters(plan, directives);

    // Build restaurant conditions (restaurant IDs / restaurant attributes / price)
    const { sql: restaurantWhereSql, preview: restaurantWherePreview } =
      this.buildRestaurantConditions(filters);

    // Always require at least one connection; if food/attribute filters exist, require a matching connection.
    const { sql: connectionMatchSql, preview: connectionMatchPreview } =
      this.buildConnectionMatchConditions(filters);

    const connectionExistsSql = Prisma.sql`EXISTS (
      SELECT 1
      FROM core_connections c
      WHERE c.restaurant_id = r.entity_id
        AND ${connectionMatchSql}
    )`;
    const connectionExistsPreview = `EXISTS (SELECT 1 FROM core_connections c WHERE c.restaurant_id = r.entity_id AND ${connectionMatchPreview})`;

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

    const combinedRestaurantWhereSql = Prisma.sql`${restaurantWhereSql} AND ${connectionExistsSql} ${excludeRestaurantsSql}`;
    const combinedRestaurantWherePreview =
      `${restaurantWherePreview} AND ${connectionExistsPreview} ${excludeRestaurantsPreview}`.trim();

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

    const { sql: selectedOrderSql, preview: distanceOrderPreview } =
      this.buildDistanceOrder(searchCenter, 'fl');

    const selectedLocationsCte = this.buildSelectedLocationsCte(
      selectedOrderSql,
      distanceOrderPreview,
    );

    const restaurantVoteTotalsCte = this.buildRestaurantVoteTotalsCte();

    const locationAggregatesCte = this.buildLocationAggregatesCte();

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
    const restaurantTopDishOrder = this.resolveTopDishOrderSql(
      plan.ranking.foodOrder,
    );
    const restaurantTopDishRankOrder = this.resolveTopDishRankOrderSql(
      plan.ranking.foodOrder,
    );

    // Build the ranked restaurants CTE with LATERAL JOIN for top dishes
    const rankedRestaurantsCte = Prisma.sql`
ranked_restaurants AS (
  SELECT
    fr.entity_id AS restaurant_id,
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    fr.restaurant_quality_score,
    fr.location_key,
    fr.restaurant_metadata,
    fr.price_level,
    fr.price_level_updated_at,
    COALESCE(drr.rank_score_display, 0) AS display_score,
    COALESCE(drr.rank_percentile, 0) AS display_percentile,
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
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  LEFT JOIN core_display_rank_scores drr
    ON drr.subject_type = 'restaurant'
    AND drr.subject_id = fr.entity_id
    AND drr.location_key = fr.location_key
	  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
	  ${minimumVotesWhereSql}
	  ORDER BY ${restaurantOrder.sql}
	  OFFSET ${pagination.skip}
	  LIMIT ${pagination.take}
	)`;

    const rankedRestaurantsCtePreview = `
ranked_restaurants AS (
  SELECT fr.entity_id AS restaurant_id, fr.name AS restaurant_name, fr.aliases AS restaurant_aliases,
         fr.restaurant_quality_score, fr.location_key, fr.restaurant_metadata,
         fr.price_level, fr.price_level_updated_at,
         COALESCE(drr.rank_score_display, 0) AS display_score,
         COALESCE(drr.rank_percentile, 0) AS display_percentile,
         COALESCE(rvt.total_upvotes, 0) AS total_upvotes, COALESCE(rvt.total_mentions, 0) AS total_mentions,
         sl.location_id, sl.google_place_id, sl.latitude, sl.longitude, sl.address, sl.city, sl.region, sl.country, sl.postal_code, sl.phone_number, sl.website_url, sl.hours, sl.utc_offset_minutes, sl.time_zone, sl.is_primary, sl.last_polled_at, sl.created_at AS location_created_at, sl.updated_at AS location_updated_at,
         la.locations_json, la.location_count
  FROM filtered_restaurants fr
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
	  LEFT JOIN core_display_rank_scores drr ON drr.subject_type = 'restaurant' AND drr.subject_id = fr.entity_id AND drr.location_key = fr.location_key
	  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
	  ${minimumVotesWherePreview}
	  ORDER BY ${restaurantOrder.preview}
	  OFFSET ${pagination.skip} LIMIT ${pagination.take}
	)`.trim();

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${restaurantCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${locationAggregatesCte.sql},
  ${rankedRestaurantsCte}
`;

    const withPreview = `WITH
  ${restaurantCte.preview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
  ${locationAggregatesCte.preview},
  ${rankedRestaurantsCtePreview}`;

    // Final SELECT with LATERAL JOIN for top dishes
    const dataSql = Prisma.sql`
${withClause}
SELECT
  rr.*,
  COALESCE(td.top_dishes, '[]'::json) AS top_dishes,
  COALESCE(td.total_dish_count, 0)::int AS total_dish_count
FROM ranked_restaurants rr
LEFT JOIN LATERAL (
  SELECT
	    json_agg(
	      json_build_object(
	        'connectionId', sub.connection_id,
	        'foodId', sub.food_id,
	        'foodName', sub.food_name,
	        'qualityScore', sub.food_quality_score,
	        'displayScore', sub.display_score,
	        'displayPercentile', sub.display_percentile,
	        'activityLevel', sub.activity_level
	      )
      ORDER BY ${restaurantTopDishOrder.sql}, sub.connection_id ASC
	    ) FILTER (WHERE sub.rn <= ${topDishesLimit}) AS top_dishes,
	    COUNT(*)::int AS total_dish_count
	  FROM (
	    SELECT
	      c.connection_id,
	      c.food_id,
	      f.name AS food_name,
	      c.food_quality_score,
	      c.total_upvotes,
	      c.mention_count,
		      drc.rank_score_display AS display_score,
		      drc.rank_percentile AS display_percentile,
		      c.activity_level,
		      ROW_NUMBER() OVER (ORDER BY ${restaurantTopDishRankOrder.sql}) AS rn
	    FROM core_connections c
	    JOIN core_entities f ON f.entity_id = c.food_id
	    LEFT JOIN core_display_rank_scores drc
	      ON drc.subject_type = 'connection'
      AND drc.subject_id = c.connection_id
      AND drc.location_key = rr.location_key
    WHERE c.restaurant_id = rr.restaurant_id
      AND ${connectionMatchSql}
  ) sub
) td ON true`;

    const countSql = Prisma.sql`
WITH
  ${restaurantCte.sql},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql}
SELECT COUNT(DISTINCT fr.entity_id)::bigint AS total_restaurants
FROM filtered_restaurants fr
JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
${minimumVotesWhereSql}`;

    const preview = `
${withPreview}
SELECT rr.*, COALESCE(td.top_dishes, '[]') AS top_dishes, COALESCE(td.total_dish_count, 0) AS total_dish_count
FROM ranked_restaurants rr
LEFT JOIN LATERAL (...top dishes subquery with LIMIT ${topDishesLimit}...) td ON true`.trim();

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
    r.location_key,
    r.restaurant_quality_score,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${restaurantWhereSql}
)`;

    const restaurantCtePreview = `
filtered_restaurants AS (
  SELECT r.entity_id, r.name, r.aliases, r.location_key, r.restaurant_quality_score, r.restaurant_attributes, r.restaurant_metadata, r.price_level, r.price_level_updated_at
  FROM core_entities r
  WHERE ${restaurantWherePreview}
)`.trim();

    const filteredLocationsCte = this.buildFilteredLocationsCte(
      locationWhereSql,
      locationWherePreview,
    );

    const { sql: selectedOrderSql, preview: distanceOrderPreview } =
      this.buildDistanceOrder(searchCenter, 'fl');

    const selectedLocationsCte = this.buildSelectedLocationsCte(
      selectedOrderSql,
      distanceOrderPreview,
    );

    const restaurantVoteTotalsCte = this.buildRestaurantVoteTotalsCte();

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
    c.recent_mention_count,
    c.last_mentioned_at,
    c.activity_level,
    c.food_quality_score,
    drc.rank_score_display AS connection_display_score,
    drc.rank_percentile AS connection_display_percentile,
    f.name AS food_name,
    f.aliases AS food_aliases,
    fr.location_key AS coverage_key,
    -- Restaurant data for map pins
    fr.entity_id AS restaurant_entity_id,
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    drr.rank_score_display AS restaurant_display_score,
    drr.rank_percentile AS restaurant_display_percentile,
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
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  LEFT JOIN core_display_rank_scores drr
    ON drr.subject_type = 'restaurant'
    AND drr.subject_id = fr.entity_id
    AND drr.location_key = fr.location_key
  LEFT JOIN core_display_rank_scores drc
    ON drc.subject_type = 'connection'
    AND drc.subject_id = c.connection_id
    AND drc.location_key = fr.location_key
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${combinedConnectionWhereSql}
)`;

    const filteredConnectionsCtePreview = `
filtered_connections AS (
  SELECT c.connection_id, c.restaurant_id, c.food_id, c.categories, c.food_attributes, c.mention_count, c.total_upvotes, c.recent_mention_count, c.last_mentioned_at, c.activity_level, c.food_quality_score,
         drc.rank_score_display AS connection_display_score, drc.rank_percentile AS connection_display_percentile,
         f.name AS food_name, f.aliases AS food_aliases, fr.location_key AS coverage_key,
         fr.entity_id AS restaurant_entity_id, fr.name AS restaurant_name, fr.aliases AS restaurant_aliases,
         drr.rank_score_display AS restaurant_display_score, drr.rank_percentile AS restaurant_display_percentile,
         fr.price_level AS restaurant_price_level, fr.price_level_updated_at AS restaurant_price_level_updated_at,
         sl.location_id, sl.google_place_id, sl.latitude, sl.longitude, sl.address, sl.city, sl.hours, sl.utc_offset_minutes, sl.time_zone
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  LEFT JOIN core_display_rank_scores drr ON drr.subject_type = 'restaurant' AND drr.subject_id = fr.entity_id AND drr.location_key = fr.location_key
  LEFT JOIN core_display_rank_scores drc ON drc.subject_type = 'connection' AND drc.subject_id = c.connection_id AND drc.location_key = fr.location_key
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${combinedConnectionWherePreview}
)`.trim();

    const order = this.resolveDishOrderSql(plan.ranking.foodOrder);

    // Build WITH clause
    const withClause = Prisma.sql`
WITH
  ${restaurantCte},
  ${filteredLocationsCte.sql},
  ${selectedLocationsCte.sql},
  ${restaurantVoteTotalsCte.sql},
  ${filteredConnectionsCte}
`;

    const withPreview = `WITH
  ${restaurantCtePreview},
  ${filteredLocationsCte.preview},
  ${selectedLocationsCte.preview},
  ${restaurantVoteTotalsCte.preview},
  ${filteredConnectionsCtePreview}`;

    const dataSql = Prisma.sql`
${withClause}
SELECT *
FROM filtered_connections fc
ORDER BY ${order.sql}
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
ORDER BY ${order.preview}
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

  /**
   * @deprecated Use buildDishQuery instead. This method is kept for backward compatibility.
   */
  build(options: BuildQueryOptions): BuildQueryResult {
    return this.buildDishQuery(options);
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
      foodAttributePrimary: Boolean(directives?.primaryFoodAttributeQuery),
      boundsPayload: this.extractBoundsPayload(plan.restaurantFilters),
      priceLevels: this.extractPriceLevels(plan.restaurantFilters),
      minimumVotes: this.extractMinimumVotes(connectionFilters),
    };
  }

  private buildRestaurantConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const conditions: Prisma.Sql[] = [Prisma.sql`r.type = 'restaurant'`];
    const conditionPreview: string[] = [`r.type = 'restaurant'`];

    if (filters.restaurantIds.length) {
      conditions.push(this.buildInClause('r.entity_id', filters.restaurantIds));
      conditionPreview.push(
        `r.entity_id = ANY(${this.formatUuidArray(filters.restaurantIds)})`,
      );
    }

    if (filters.restaurantAttributeIds.length) {
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

  private buildLocationConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
    boundsApplied: boolean;
  } {
    const conditions: Prisma.Sql[] = [];
    const conditionPreview: string[] = [];
    let boundsApplied = false;

    if (filters.boundsPayload) {
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
      const categoryClause = this.buildArrayOverlapClause(
        'c.categories',
        filters.foodTextExpansionIds,
      );
      conditions.push(
        Prisma.sql`((${attributeClause}) OR (${foodIdClause} OR ${categoryClause}))`,
      );
      conditionPreview.push(
        `((c.food_attributes && ${this.formatUuidArray(
          filters.foodAttributeIds,
        )}) OR (c.food_id = ANY(${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )}) OR c.categories && ${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )}))`,
      );
    } else {
      if (filters.foodIds.length) {
        const foodIdClause = this.buildInClause('c.food_id', filters.foodIds);
        const categoryClause = this.buildArrayOverlapClause(
          'c.categories',
          filters.foodIds,
        );
        conditions.push(Prisma.sql`(${foodIdClause} OR ${categoryClause})`);
        conditionPreview.push(
          `(c.food_id = ANY(${this.formatUuidArray(
            filters.foodIds,
          )}) OR c.categories && ${this.formatUuidArray(filters.foodIds)})`,
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

  private buildConnectionMatchConditions(filters: ParsedFilters): {
    sql: Prisma.Sql;
    preview: string;
  } {
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
      const categoryClause = this.buildArrayOverlapClause(
        'c.categories',
        filters.foodTextExpansionIds,
      );
      conditions.push(
        Prisma.sql`((${attributeClause}) OR (${foodIdClause} OR ${categoryClause}))`,
      );
      conditionPreview.push(
        `((c.food_attributes && ${this.formatUuidArray(
          filters.foodAttributeIds,
        )}) OR (c.food_id = ANY(${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )}) OR c.categories && ${this.formatUuidArray(
          filters.foodTextExpansionIds,
        )}))`,
      );
    } else {
      if (filters.foodIds.length) {
        const foodIdClause = this.buildInClause('c.food_id', filters.foodIds);
        const categoryClause = this.buildArrayOverlapClause(
          'c.categories',
          filters.foodIds,
        );
        conditions.push(Prisma.sql`(${foodIdClause} OR ${categoryClause})`);
        conditionPreview.push(
          `(c.food_id = ANY(${this.formatUuidArray(
            filters.foodIds,
          )}) OR c.categories && ${this.formatUuidArray(filters.foodIds)})`,
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

    if (filters.minimumVotes !== null) {
      conditions.push(Prisma.sql`c.total_upvotes >= ${filters.minimumVotes}`);
      conditionPreview.push(`c.total_upvotes >= ${filters.minimumVotes}`);
    }

    return {
      sql: this.combineSqlClauses(conditions),
      preview: this.combinePreviewClauses(conditionPreview),
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
    r.location_key,
    r.restaurant_quality_score,
    r.restaurant_attributes,
    r.restaurant_metadata,
    r.price_level,
    r.price_level_updated_at
  FROM core_entities r
  WHERE ${whereSql}
)`;

    const preview = `
filtered_restaurants AS (
  SELECT r.entity_id, r.name, r.aliases, r.location_key, r.restaurant_quality_score, r.restaurant_attributes, r.restaurant_metadata, r.price_level, r.price_level_updated_at
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

  private buildDistanceOrder(
    searchCenter: { lat: number; lng: number } | null | undefined,
    alias: string,
  ): { sql: Prisma.Sql; preview: string | null } {
    if (
      !searchCenter ||
      !Number.isFinite(searchCenter.lat) ||
      !Number.isFinite(searchCenter.lng)
    ) {
      return {
        sql: Prisma.sql`${Prisma.raw(alias)}.restaurant_id, ${Prisma.raw(
          alias,
        )}.updated_at DESC`,
        preview: null,
      };
    }

    const distanceSql = Prisma.sql`(POWER(${Prisma.raw(alias)}.latitude - ${
      searchCenter.lat
    }, 2) + POWER(${Prisma.raw(alias)}.longitude - ${searchCenter.lng}, 2))`;
    const distancePreview = `(POWER(${alias}.latitude - ${searchCenter.lat}, 2) + POWER(${alias}.longitude - ${searchCenter.lng}, 2))`;

    return {
      sql: Prisma.sql`${Prisma.raw(
        alias,
      )}.restaurant_id, ${distanceSql} ASC, ${Prisma.raw(
        alias,
      )}.updated_at DESC`,
      preview: distancePreview,
    };
  }

  private buildSelectedLocationsCte(
    orderSql: Prisma.Sql,
    distanceOrderPreview: string | null,
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
  ORDER BY fl.restaurant_id${
    distanceOrderPreview ? `, ${distanceOrderPreview} ASC` : ''
  }, fl.updated_at DESC
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
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`;

    const preview = `
restaurant_vote_totals AS (
  SELECT c.restaurant_id, SUM(c.total_upvotes) AS total_upvotes, SUM(c.mention_count) AS total_mentions
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`.trim();

    return { sql, preview };
  }

  private buildLocationAggregatesCte(): { sql: Prisma.Sql; preview: string } {
    const sql = Prisma.sql`
location_aggregates AS (
  SELECT
    rl.restaurant_id,
    COUNT(*) AS location_count,
    json_agg(
      jsonb_build_object(
        'locationId', rl.location_id,
        'googlePlaceId', rl.google_place_id,
        'latitude', rl.latitude,
        'longitude', rl.longitude,
        'address', rl.address,
        'city', rl.city,
        'region', rl.region,
        'country', rl.country,
        'postalCode', rl.postal_code,
        'phoneNumber', rl.phone_number,
        'websiteUrl', rl.website_url,
        'hours', rl.hours,
        'utcOffsetMinutes', rl.utc_offset_minutes,
        'timeZone', rl.time_zone,
        'isPrimary', rl.is_primary,
        'lastPolledAt', rl.last_polled_at,
        'createdAt', rl.created_at,
        'updatedAt', rl.updated_at
      )
      ORDER BY rl.updated_at DESC
    ) AS locations_json
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE rl.latitude IS NOT NULL
    AND rl.longitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
  GROUP BY rl.restaurant_id
)`;

    const preview = `
location_aggregates AS (
  SELECT rl.restaurant_id, COUNT(*) AS location_count, json_agg(...) AS locations_json
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL AND rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL
  GROUP BY rl.restaurant_id
)`.trim();

    return { sql, preview };
  }

  private resolveDishOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    const isQualityScore = normalized.includes('quality_score');
    const scoreSql = isQualityScore
      ? Prisma.sql`fc.food_quality_score`
      : Prisma.sql`COALESCE(fc.connection_display_percentile, fc.food_quality_score / 100)`;
    const scorePreview = isQualityScore
      ? 'fc.food_quality_score'
      : 'COALESCE(fc.connection_display_percentile, fc.food_quality_score / 100)';
    const tieBreakerSql = isQualityScore
      ? Prisma.sql`, fc.total_upvotes ${Prisma.raw(
          direction,
        )}, fc.mention_count ${Prisma.raw(direction)}, fc.connection_id ASC`
      : Prisma.sql`, fc.connection_id ASC`;
    const tieBreakerPreview = isQualityScore
      ? `, fc.total_upvotes ${direction}, fc.mention_count ${direction}, fc.connection_id ASC`
      : ', fc.connection_id ASC';
    return {
      sql: Prisma.sql`${scoreSql} ${Prisma.raw(direction)}${tieBreakerSql}`,
      preview: `${scorePreview} ${direction}${tieBreakerPreview}`,
    };
  }

  private resolveRestaurantOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    const isQualityScore = normalized.includes('quality_score');
    if (isQualityScore) {
      return {
        sql: Prisma.sql`fr.restaurant_quality_score ${Prisma.raw(direction)},
        COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
        COALESCE(rvt.total_mentions, 0) ${Prisma.raw(direction)},
        fr.entity_id ASC`,
        preview: `fr.restaurant_quality_score ${direction}, COALESCE(rvt.total_upvotes, 0) ${direction}, COALESCE(rvt.total_mentions, 0) ${direction}, fr.entity_id ASC`,
      };
    }
    return {
      sql: Prisma.sql`COALESCE(drr.rank_percentile, fr.restaurant_quality_score / 100) ${Prisma.raw(
        direction,
      )},
      COALESCE(rvt.total_upvotes, 0) ${Prisma.raw(direction)},
      fr.entity_id ASC`,
      preview: `COALESCE(drr.rank_percentile, fr.restaurant_quality_score / 100) ${direction}, COALESCE(rvt.total_upvotes, 0) ${direction}, fr.entity_id ASC`,
    };
  }

  private resolveTopDishOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    const isQualityScore = normalized.includes('quality_score');
    if (isQualityScore) {
      return {
        sql: Prisma.sql`sub.food_quality_score ${Prisma.raw(direction)},
        sub.total_upvotes ${Prisma.raw(direction)},
        sub.mention_count ${Prisma.raw(direction)},
        sub.connection_id ASC`,
        preview: `sub.food_quality_score ${direction}, sub.total_upvotes ${direction}, sub.mention_count ${direction}, sub.connection_id ASC`,
      };
    }
    return {
      sql: Prisma.sql`COALESCE(sub.display_percentile, sub.food_quality_score / 100) ${Prisma.raw(
        direction,
      )}`,
      preview: `COALESCE(sub.display_percentile, sub.food_quality_score / 100) ${direction}`,
    };
  }

  private resolveTopDishRankOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    const isQualityScore = normalized.includes('quality_score');
    if (isQualityScore) {
      return {
        sql: Prisma.sql`c.food_quality_score ${Prisma.raw(direction)},
        c.total_upvotes ${Prisma.raw(direction)},
        c.mention_count ${Prisma.raw(direction)},
        c.connection_id ASC`,
        preview: `c.food_quality_score ${direction}, c.total_upvotes ${direction}, c.mention_count ${direction}, c.connection_id ASC`,
      };
    }
    return {
      sql: Prisma.sql`COALESCE(drc.rank_percentile, c.food_quality_score / 100) ${Prisma.raw(
        direction,
      )}, c.total_upvotes ${Prisma.raw(direction)}, c.connection_id ASC`,
      preview: `COALESCE(drc.rank_percentile, c.food_quality_score / 100) ${direction}, c.total_upvotes ${direction}, c.connection_id ASC`,
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
