import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntityScope, FilterClause, QueryPlan } from './dto/search-query.dto';

interface BuildQueryOptions {
  plan: QueryPlan;
  pagination: { skip: number; take: number };
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
    const { plan, pagination } = options;

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

    let boundsApplied = false;
    let priceFilterApplied = false;
    if (boundsPayload) {
      restaurantConditions.push(
        Prisma.sql`r.latitude BETWEEN ${boundsPayload.southWest.lat} AND ${boundsPayload.northEast.lat}`,
      );
      restaurantConditions.push(
        Prisma.sql`r.longitude BETWEEN ${boundsPayload.southWest.lng} AND ${boundsPayload.northEast.lng}`,
      );
      restaurantConditionPreview.push(
        `r.latitude BETWEEN ${boundsPayload.southWest.lat} AND ${boundsPayload.northEast.lat}`,
      );
      restaurantConditionPreview.push(
        `r.longitude BETWEEN ${boundsPayload.southWest.lng} AND ${boundsPayload.northEast.lng}`,
      );
      boundsApplied = true;
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
    r.restaurant_quality_score,
    r.latitude,
    r.longitude,
    r.address,
    r.price_level,
    r.price_level_updated_at,
    r.restaurant_attributes,
    r.restaurant_metadata
  FROM entities r
  WHERE ${restaurantWhereSql}
)`;

    const restaurantCtePreview = `
filtered_restaurants AS (
  SELECT r.entity_id, r.name, r.aliases, r.restaurant_quality_score, r.latitude, r.longitude, r.address, r.price_level, r.price_level_updated_at, r.restaurant_attributes, r.restaurant_metadata
  FROM entities r
  WHERE ${restaurantWherePreview}
)`.trim();

    const restaurantVoteTotalsCte = Prisma.sql`
restaurant_vote_totals AS (
  SELECT
    c.restaurant_id,
    SUM(c.total_upvotes) AS total_upvotes
  FROM connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  GROUP BY c.restaurant_id
)`;

    const restaurantVoteTotalsPreview = `
restaurant_vote_totals AS (
  SELECT c.restaurant_id, SUM(c.total_upvotes) AS total_upvotes
  FROM connections c
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
    fr.name AS restaurant_name,
    fr.aliases AS restaurant_aliases,
    fr.restaurant_quality_score,
    fr.latitude,
    fr.longitude,
    fr.address,
    fr.price_level,
    fr.price_level_updated_at,
    fr.restaurant_attributes,
    fr.restaurant_metadata,
    f.name AS food_name,
    f.aliases AS food_aliases
  FROM connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN entities f ON f.entity_id = c.food_id
  WHERE ${connectionWhereSql}
)`;

    const filteredConnectionsPreview = `
filtered_connections AS (
  SELECT c.connection_id, c.restaurant_id, c.food_id, c.categories, c.food_attributes, c.mention_count, c.total_upvotes, c.recent_mention_count, c.last_mentioned_at, c.activity_level, c.food_quality_score,
         rvt.total_upvotes AS restaurant_total_upvotes,
         fr.name AS restaurant_name, fr.aliases AS restaurant_aliases, fr.restaurant_quality_score, fr.latitude, fr.longitude, fr.address, fr.price_level, fr.price_level_updated_at, fr.restaurant_attributes, fr.restaurant_metadata,
         f.name AS food_name, f.aliases AS food_aliases
  FROM connections c
  JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id
  JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = fr.entity_id
  JOIN entities f ON f.entity_id = c.food_id
  WHERE ${connectionWherePreview}
)`.trim();

    const order = this.resolveFoodOrderSql(plan.ranking.foodOrder);

    const withClause = Prisma.sql`
WITH
  ${restaurantCte},
  ${restaurantVoteTotalsCte},
  ${filteredConnectionsCte}
`;

    const withPreview = `WITH
  ${restaurantCtePreview},
  ${restaurantVoteTotalsPreview},
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
