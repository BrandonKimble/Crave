import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntityScope, FilterClause, QueryPlan } from './dto/search-query.dto';

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

@Injectable()
export class SearchQueryBuilder {
  build(options: BuildQueryOptions): BuildQueryResult {
    const { plan, pagination, searchCenter } = options;

    const restaurantIds = this.collectEntityIds(
      plan.restaurantFilters,
      EntityScope.RESTAURANT,
    );
    const restaurantAttributeIds = this.collectEntityIds(
      plan.restaurantFilters,
      EntityScope.RESTAURANT_ATTRIBUTE,
    );
    const boundsPayload = this.extractBoundsPayload(plan.restaurantFilters);
    const priceLevels = this.extractPriceLevels(plan.restaurantFilters);

    const foodIds = this.collectEntityIds(
      plan.connectionFilters,
      EntityScope.FOOD,
    );
    const foodAttributeIds = this.collectEntityIds(
      plan.connectionFilters,
      EntityScope.FOOD_ATTRIBUTE,
    );
    const minimumVotes = this.extractMinimumVotes(plan.connectionFilters);

    const restaurantConditions: Prisma.Sql[] = [
      Prisma.sql`r.type = 'restaurant'`,
    ];
    const restaurantConditionPreview: string[] = [`r.type = 'restaurant'`];
    let priceFilterApplied = false;

    if (restaurantIds.length) {
      restaurantConditions.push(
        this.buildInClause('r.entity_id', restaurantIds),
      );
      restaurantConditionPreview.push(
        `r.entity_id = ANY(${this.formatUuidArray(restaurantIds)})`,
      );
    }

    if (restaurantAttributeIds.length) {
      restaurantConditions.push(
        this.buildArrayOverlapClause(
          'r.restaurant_attributes',
          restaurantAttributeIds,
        ),
      );
      restaurantConditionPreview.push(
        `r.restaurant_attributes && ${this.formatUuidArray(
          restaurantAttributeIds,
        )}`,
      );
    }

    if (priceLevels.length) {
      restaurantConditions.push(
        this.buildNumberInClause('r.price_level', priceLevels),
      );
      restaurantConditionPreview.push(
        `r.price_level = ANY(${this.formatNumberArray(priceLevels)})`,
      );
      priceFilterApplied = true;
    }

    let boundsApplied = false;
    const locationConditions: Prisma.Sql[] = [];
    const locationConditionPreview: string[] = [];

    if (boundsPayload) {
      locationConditions.push(
        Prisma.sql`rl.latitude BETWEEN ${boundsPayload.southWest.lat} AND ${boundsPayload.northEast.lat}`,
      );
      locationConditions.push(
        Prisma.sql`rl.longitude BETWEEN ${boundsPayload.southWest.lng} AND ${boundsPayload.northEast.lng}`,
      );
      locationConditionPreview.push(
        `rl.latitude BETWEEN ${boundsPayload.southWest.lat} AND ${boundsPayload.northEast.lat}`,
      );
      locationConditionPreview.push(
        `rl.longitude BETWEEN ${boundsPayload.southWest.lng} AND ${boundsPayload.northEast.lng}`,
      );
      boundsApplied = true;
    }

    const connectionConditions: Prisma.Sql[] = [];
    const connectionConditionPreview: string[] = [];
    let minimumVotesApplied = false;

    if (foodIds.length) {
      const foodIdClause = this.buildInClause('c.food_id', foodIds);
      const categoryClause = this.buildArrayOverlapClause(
        'c.categories',
        foodIds,
      );

      connectionConditions.push(
        Prisma.sql`${foodIdClause} OR ${categoryClause}`,
      );
      connectionConditionPreview.push(
        `(c.food_id = ANY(${this.formatUuidArray(
          foodIds,
        )}) OR c.categories && ${this.formatUuidArray(foodIds)})`,
      );
    }

    if (foodAttributeIds.length) {
      connectionConditions.push(
        this.buildArrayOverlapClause('c.food_attributes', foodAttributeIds),
      );
      connectionConditionPreview.push(
        `c.food_attributes && ${this.formatUuidArray(foodAttributeIds)}`,
      );
    }

    if (minimumVotes !== null) {
      connectionConditions.push(Prisma.sql`c.total_upvotes >= ${minimumVotes}`);
      connectionConditionPreview.push(`c.total_upvotes >= ${minimumVotes}`);
      connectionConditions.push(
        Prisma.sql`rvt.total_upvotes >= ${minimumVotes}`,
      );
      connectionConditionPreview.push(`rvt.total_upvotes >= ${minimumVotes}`);
      minimumVotesApplied = true;
    }

    const restaurantWhereSql = this.combineSqlClauses(restaurantConditions);
    const restaurantWherePreview = this.combinePreviewClauses(
      restaurantConditionPreview,
    );

    const locationWhereSql = this.combineSqlClauses(locationConditions);
    const locationWherePreview = this.combinePreviewClauses(
      locationConditionPreview,
    );

    const connectionWhereSql = this.combineSqlClauses(connectionConditions);
    const connectionWherePreview = this.combinePreviewClauses(
      connectionConditionPreview,
    );

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

    const filteredLocationsCte = Prisma.sql`
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
  WHERE ${locationWhereSql}
    AND rl.latitude IS NOT NULL
    AND rl.longitude IS NOT NULL
    AND rl.google_place_id IS NOT NULL
    AND rl.address IS NOT NULL
)`;

    const filteredLocationsPreview = `
filtered_locations AS (
  SELECT rl.location_id, rl.restaurant_id, rl.google_place_id, rl.latitude, rl.longitude, rl.address, rl.city, rl.region, rl.country, rl.postal_code, rl.phone_number, rl.website_url, rl.hours, rl.utc_offset_minutes, rl.time_zone, rl.is_primary, rl.last_polled_at, rl.created_at, rl.updated_at
  FROM core_restaurant_locations rl
  JOIN filtered_restaurants fr ON fr.entity_id = rl.restaurant_id
  WHERE ${locationWherePreview} AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL AND rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL
)`.trim();

    const distanceOrderSql =
      searchCenter &&
      Number.isFinite(searchCenter.lat) &&
      Number.isFinite(searchCenter.lng)
        ? Prisma.sql`(POWER(fl.latitude - ${searchCenter.lat}, 2) + POWER(fl.longitude - ${searchCenter.lng}, 2))`
        : null;
    const selectedOrderSql = distanceOrderSql
      ? Prisma.sql`fl.restaurant_id, ${distanceOrderSql} ASC, fl.updated_at DESC`
      : Prisma.sql`fl.restaurant_id, fl.updated_at DESC`;
    const distanceOrderPreview = distanceOrderSql
      ? `(POWER(fl.latitude - ${
          searchCenter?.lat ?? 0
        }, 2) + POWER(fl.longitude - ${searchCenter?.lng ?? 0}, 2))`
      : null;

    const selectedLocationsCte = Prisma.sql`
selected_locations AS (
  SELECT DISTINCT ON (fl.restaurant_id)
    fl.*
  FROM filtered_locations fl
  ORDER BY ${selectedOrderSql}
)`;

    const selectedLocationsPreview = `
selected_locations AS (
  SELECT DISTINCT ON (fl.restaurant_id) fl.*
  FROM filtered_locations fl
  ORDER BY fl.restaurant_id${
    distanceOrderPreview ? `, ${distanceOrderPreview} ASC` : ''
  }, fl.updated_at DESC
)`.trim();

    const locationAggregatesCte = Prisma.sql`
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

    const locationAggregatesPreview = `
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
  WHERE rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL AND rl.google_place_id IS NOT NULL AND rl.address IS NOT NULL
  GROUP BY rl.restaurant_id
)`.trim();

    const restaurantVoteTotalsCte = Prisma.sql`
restaurant_vote_totals AS (
  SELECT
    c.restaurant_id,
    SUM(c.total_upvotes) AS total_upvotes,
    SUM(c.mention_count) AS total_mentions
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`;

    const restaurantVoteTotalsPreview = `
restaurant_vote_totals AS (
  SELECT c.restaurant_id, SUM(c.total_upvotes) AS total_upvotes, SUM(c.mention_count) AS total_mentions
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`.trim();

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
    rvt.total_upvotes AS restaurant_total_upvotes,
    rvt.total_mentions AS restaurant_total_mentions,
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    fr.restaurant_quality_score,
    fr.location_key AS restaurant_location_key,
    fr.restaurant_metadata AS restaurant_metadata,
    drr.rank_score_display AS restaurant_display_score,
    drr.rank_percentile AS restaurant_display_percentile,
    drc.rank_score_display AS connection_display_score,
    drc.rank_percentile AS connection_display_percentile,
    fr.price_level AS restaurant_price_level,
    fr.price_level_updated_at AS restaurant_price_level_updated_at,
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
    sl.is_primary AS location_is_primary,
    sl.last_polled_at AS location_last_polled_at,
    sl.created_at AS location_created_at,
    sl.updated_at AS location_updated_at,
    la.locations_json,
    la.location_count,
    f.name AS food_name,
    f.aliases AS food_aliases
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
  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${connectionWhereSql}
)`;

    const filteredConnectionsPreview = `
filtered_connections AS (
  SELECT c.connection_id, c.restaurant_id, c.food_id, c.categories, c.food_attributes, c.mention_count, c.total_upvotes, c.recent_mention_count, c.last_mentioned_at, c.activity_level, c.food_quality_score,
         rvt.total_upvotes AS restaurant_total_upvotes, rvt.total_mentions AS restaurant_total_mentions,
         fr.name AS restaurant_name, fr.aliases AS restaurant_aliases, fr.restaurant_quality_score, fr.location_key AS restaurant_location_key, fr.restaurant_metadata AS restaurant_metadata,
         drr.rank_score_display AS restaurant_display_score, drr.rank_percentile AS restaurant_display_percentile,
         drc.rank_score_display AS connection_display_score, drc.rank_percentile AS connection_display_percentile,
         fr.price_level AS restaurant_price_level, fr.price_level_updated_at AS restaurant_price_level_updated_at, sl.location_id, sl.google_place_id, sl.latitude, sl.longitude, sl.address, sl.city, sl.region, sl.country, sl.postal_code, sl.phone_number, sl.website_url, sl.hours, sl.utc_offset_minutes, sl.time_zone, sl.is_primary AS location_is_primary, sl.last_polled_at AS location_last_polled_at, sl.created_at AS location_created_at, sl.updated_at AS location_updated_at, la.locations_json, la.location_count,
         f.name AS food_name, f.aliases AS food_aliases
  FROM core_connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN selected_locations sl ON sl.restaurant_id = fr.entity_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  LEFT JOIN core_display_rank_scores drr ON drr.subject_type = 'restaurant' AND drr.subject_id = fr.entity_id AND drr.location_key = fr.location_key
  LEFT JOIN core_display_rank_scores drc ON drc.subject_type = 'connection' AND drc.subject_id = c.connection_id AND drc.location_key = fr.location_key
  LEFT JOIN location_aggregates la ON la.restaurant_id = fr.entity_id
  JOIN core_entities f ON f.entity_id = c.food_id
  WHERE ${connectionWherePreview}
)`.trim();

    const order = this.resolveFoodOrderSql(plan.ranking.foodOrder);

    const withClause = Prisma.sql`
WITH
  ${restaurantCte},
  ${filteredLocationsCte},
  ${selectedLocationsCte},
  ${restaurantVoteTotalsCte},
  ${locationAggregatesCte},
  ${filteredConnectionsCte}
`;

    const withPreview = `WITH
  ${restaurantCtePreview},
  ${filteredLocationsPreview},
  ${selectedLocationsPreview},
  ${restaurantVoteTotalsPreview},
  ${locationAggregatesPreview},
  ${filteredConnectionsPreview}`;

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
        priceFilterApplied,
        minimumVotesApplied,
      },
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

  private resolveFoodOrderSql(order?: string): {
    sql: Prisma.Sql;
    preview: string;
  } {
    const normalized = (order || '').toLowerCase();
    const direction = normalized.includes('asc') ? 'ASC' : 'DESC';
    return {
      sql: Prisma.sql`fc.food_quality_score ${Prisma.raw(direction)}`,
      preview: `fc.food_quality_score ${direction}`,
    };
  }
}
