import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import type { ShortcutCoverageRequestDto } from './dto/shortcut-coverage.dto';

type CoverageRestaurantRow = {
  restaurant_id: string;
  restaurant_name: string;
  longitude: unknown;
  latitude: unknown;
  contextual_score: unknown;
  contextual_percentile: unknown;
  restaurant_quality_score: unknown;
  top_connection_id?: unknown;
  top_food_name?: unknown;
  top_food_quality_score?: unknown;
  top_food_contextual_score?: unknown;
  top_food_contextual_percentile?: unknown;
};

@Injectable()
export class SearchCoverageService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchCoverageService');
  }

  async buildShortcutCoverageGeoJson(
    request: ShortcutCoverageRequestDto,
  ): Promise<unknown> {
    const restaurantEntityIds = this.collectEntityIds(
      request.entities?.restaurants,
    );
    const foodEntityIds = this.collectEntityIds(request.entities?.food);
    const foodAttributeIds = this.collectEntityIds(
      request.entities?.foodAttributes,
    );
    const restaurantAttributeIds = this.collectEntityIds(
      request.entities?.restaurantAttributes,
    );

    const bounds = request.bounds;
    const neLng = bounds?.northEast?.lng;
    const neLat = bounds?.northEast?.lat;
    const swLng = bounds?.southWest?.lng;
    const swLat = bounds?.southWest?.lat;
    const hasBounds =
      typeof neLng === 'number' &&
      typeof neLat === 'number' &&
      typeof swLng === 'number' &&
      typeof swLat === 'number';
    if (!hasBounds) {
      throw new BadRequestException('bounds are required');
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.type = 'restaurant'`,
      Prisma.sql`EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = e.entity_id)`,
    ];

    if (restaurantEntityIds.length) {
      conditions.push(
        Prisma.sql`e.entity_id = ANY(ARRAY[${Prisma.join(
          restaurantEntityIds,
        )}]::uuid[])`,
      );
    }

    if (restaurantAttributeIds.length) {
      conditions.push(
        Prisma.sql`e.restaurant_attributes && ARRAY[${Prisma.join(
          restaurantAttributeIds,
        )}]::uuid[]`,
      );
    }

    if (foodEntityIds.length) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM core_restaurant_items c
          WHERE c.restaurant_id = e.entity_id
            AND c.food_id = ANY(ARRAY[${Prisma.join(foodEntityIds)}]::uuid[])
        )`,
      );
    }

    if (foodAttributeIds.length) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM core_restaurant_items c
          WHERE c.restaurant_id = e.entity_id
            AND c.food_attributes && ARRAY[${Prisma.join(
              foodAttributeIds,
            )}]::uuid[]
        )`,
      );
    }

    const minLng = Math.min(swLng, neLng);
    const maxLng = Math.max(swLng, neLng);
    const minLat = Math.min(swLat, neLat);
    const maxLat = Math.max(swLat, neLat);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    const maxRestaurants = 50000;
    const includeTopDish = request.includeTopDish === true;
    const activeMarketKey =
      typeof request.marketKey === 'string' && request.marketKey.trim().length
        ? request.marketKey.trim().toLowerCase()
        : null;
    const topDishJoinSql = includeTopDish
      ? this.buildTopDishJoinSql({
          foodEntityIds,
          foodAttributeIds,
        })
      : Prisma.sql``;
    const topDishSelectSql = includeTopDish
      ? Prisma.sql`,
        td.connection_id AS top_connection_id,
        td.food_name AS top_food_name,
        td.food_quality_score AS top_food_quality_score,
        td.contextual_score AS top_food_contextual_score,
        td.contextual_percentile AS top_food_contextual_percentile`
      : Prisma.sql``;
    const coverageOrderSql = (() => {
      if (includeTopDish) {
        return Prisma.sql`COALESCE(td.contextual_score, td.food_quality_score, drs.rank_score_display, e.restaurant_quality_score, -1) DESC, e.entity_id ASC`;
      }
      return Prisma.sql`COALESCE(drs.rank_score_display, e.restaurant_quality_score, -1) DESC, e.entity_id ASC`;
    })();
    const marketLocationFilterSql = activeMarketKey
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM core_markets m
            WHERE m.market_key = ${activeMarketKey}
              AND m.is_active = true
              AND m.geometry IS NOT NULL
              AND m.bbox_ne_latitude >= rl.latitude
              AND m.bbox_sw_latitude <= rl.latitude
              AND m.bbox_ne_longitude >= rl.longitude
              AND m.bbox_sw_longitude <= rl.longitude
              AND ST_Contains(
                m.geometry,
                ST_SetSRID(
                  ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision),
                  4326
                )
              )
          )
        `
      : Prisma.sql``;
    const startedAt = Date.now();
    const rows = await this.prisma.$queryRaw<
      CoverageRestaurantRow[]
    >(Prisma.sql`
      WITH candidate_locations AS (
        SELECT
          rl.location_id,
          rl.restaurant_id,
          rl.longitude,
          rl.latitude,
          rl.updated_at
        FROM core_restaurant_locations rl
        WHERE rl.longitude IS NOT NULL
          AND rl.latitude IS NOT NULL
          AND rl.google_place_id IS NOT NULL
          AND rl.address IS NOT NULL
          AND rl.longitude BETWEEN ${minLng} AND ${maxLng}
          AND rl.latitude BETWEEN ${minLat} AND ${maxLat}
          ${marketLocationFilterSql}
      ),
      selected_locations AS (
        SELECT DISTINCT ON (cl.restaurant_id)
          cl.restaurant_id,
          cl.location_id,
          cl.longitude,
          cl.latitude
        FROM candidate_locations cl
        ORDER BY
          cl.restaurant_id,
          POWER(cl.latitude - ${centerLat}, 2) + POWER(cl.longitude - ${centerLng}, 2) ASC,
          cl.updated_at DESC
      ),
      geographic_restaurants AS (
        SELECT DISTINCT restaurant_id
        FROM candidate_locations
      ),
      restaurant_vote_totals AS (
        SELECT
          c.restaurant_id,
          SUM(c.total_upvotes) AS total_upvotes,
          SUM(c.mention_count) AS total_mentions
        FROM core_restaurant_items c
        JOIN geographic_restaurants gr ON gr.restaurant_id = c.restaurant_id
        GROUP BY c.restaurant_id
      ),
      contextual_restaurant_scores AS (
        WITH ranked AS (
          SELECT
            gr.restaurant_id AS subject_id,
            ROW_NUMBER() OVER (
              ORDER BY
                COALESCE(e.restaurant_quality_score, 0) DESC,
                COALESCE(rvt.total_upvotes, 0) DESC,
                COALESCE(rvt.total_mentions, 0) DESC,
                gr.restaurant_id ASC
            ) AS row_number,
            PERCENT_RANK() OVER (
              ORDER BY
                COALESCE(e.restaurant_quality_score, 0) DESC,
                COALESCE(rvt.total_upvotes, 0) DESC,
                COALESCE(rvt.total_mentions, 0) DESC,
                gr.restaurant_id ASC
            ) AS percent_rank
          FROM geographic_restaurants gr
          JOIN core_entities e ON e.entity_id = gr.restaurant_id
          LEFT JOIN restaurant_vote_totals rvt ON rvt.restaurant_id = gr.restaurant_id
        )
        SELECT
          subject_id,
          CASE
            WHEN row_number = 1 THEN 100::numeric
            ELSE floor(LEAST(99.9, GREATEST(0, 100 * (1 - percent_rank))) * 10)::numeric / 10
          END AS rank_score_display,
          (1 - percent_rank)::numeric AS rank_percentile
        FROM ranked
      ),
      contextual_connection_scores AS (
        WITH ranked AS (
          SELECT
            c.connection_id AS subject_id,
            ROW_NUMBER() OVER (
              ORDER BY
                COALESCE(c.food_quality_score, 0) DESC,
                COALESCE(c.total_upvotes, 0) DESC,
                COALESCE(c.mention_count, 0) DESC,
                c.connection_id ASC
            ) AS row_number,
            PERCENT_RANK() OVER (
              ORDER BY
                COALESCE(c.food_quality_score, 0) DESC,
                COALESCE(c.total_upvotes, 0) DESC,
                COALESCE(c.mention_count, 0) DESC,
                c.connection_id ASC
            ) AS percent_rank
          FROM core_restaurant_items c
          JOIN geographic_restaurants gr ON gr.restaurant_id = c.restaurant_id
        )
        SELECT
          subject_id,
          CASE
            WHEN row_number = 1 THEN 100::numeric
            ELSE floor(LEAST(99.9, GREATEST(0, 100 * (1 - percent_rank))) * 10)::numeric / 10
          END AS rank_score_display,
          (1 - percent_rank)::numeric AS rank_percentile
        FROM ranked
      )
      SELECT
        e.entity_id AS restaurant_id,
        e.name AS restaurant_name,
        pl.longitude AS longitude,
        pl.latitude AS latitude,
        drs.rank_score_display AS contextual_score,
        drs.rank_percentile AS contextual_percentile,
        e.restaurant_quality_score AS restaurant_quality_score
        ${topDishSelectSql}
      FROM core_entities e
      JOIN selected_locations pl ON pl.restaurant_id = e.entity_id
      LEFT JOIN contextual_restaurant_scores drs
        ON drs.subject_id = e.entity_id
      ${topDishJoinSql}
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${coverageOrderSql}
      LIMIT ${maxRestaurants};
    `);

    this.logger.debug('Built shortcut coverage restaurants', {
      count: rows.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      type: 'FeatureCollection',
      features: rows
        .map((row, index) => {
          const longitude = Number(row.longitude);
          const latitude = Number(row.latitude);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return null;
          }
          const contextualPercentile = Number(row.contextual_percentile);
          const contextualScore = Number(row.contextual_score);
          const restaurantQualityScore = Number(row.restaurant_quality_score);
          const topFoodQualityScore = Number(row.top_food_quality_score);
          const topFoodContextualScore = Number(row.top_food_contextual_score);
          const topFoodContextualPercentile = Number(
            row.top_food_contextual_percentile,
          );
          return {
            type: 'Feature',
            id: row.restaurant_id,
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
            properties: {
              restaurantId: row.restaurant_id,
              restaurantName: row.restaurant_name,
              contextualScore: includeTopDish
                ? Number.isFinite(topFoodContextualScore)
                  ? topFoodContextualScore
                  : Number.isFinite(topFoodQualityScore)
                    ? topFoodQualityScore
                    : 0
                : Number.isFinite(contextualScore)
                  ? contextualScore
                  : Number.isFinite(restaurantQualityScore)
                    ? restaurantQualityScore
                    : 0,
              contextualPercentile:
                includeTopDish && Number.isFinite(topFoodContextualPercentile)
                  ? topFoodContextualPercentile
                  : Number.isFinite(contextualPercentile)
                    ? contextualPercentile
                    : null,
              rank: index + 1,
              restaurantQualityScore: Number.isFinite(restaurantQualityScore)
                ? restaurantQualityScore
                : null,
              isDishPin: includeTopDish ? true : undefined,
              dishName:
                includeTopDish && typeof row.top_food_name === 'string'
                  ? row.top_food_name
                  : undefined,
              connectionId:
                includeTopDish && typeof row.top_connection_id === 'string'
                  ? row.top_connection_id
                  : undefined,
              topDishContextualPercentile:
                includeTopDish && Number.isFinite(topFoodContextualPercentile)
                  ? topFoodContextualPercentile
                  : null,
              topDishContextualScore:
                includeTopDish && Number.isFinite(topFoodContextualScore)
                  ? topFoodContextualScore
                  : null,
            },
          };
        })
        .filter(Boolean),
    };
  }

  private buildTopDishJoinSql(params: {
    foodEntityIds: string[];
    foodAttributeIds: string[];
  }): Prisma.Sql {
    const { foodEntityIds, foodAttributeIds } = params;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c.restaurant_id = e.entity_id`,
    ];
    if (foodEntityIds.length) {
      conditions.push(
        Prisma.sql`c.food_id = ANY(ARRAY[${Prisma.join(
          foodEntityIds,
        )}]::uuid[])`,
      );
    }
    if (foodAttributeIds.length) {
      conditions.push(
        Prisma.sql`c.food_attributes && ARRAY[${Prisma.join(
          foodAttributeIds,
        )}]::uuid[]`,
      );
    }
    const orderSql = Prisma.sql`COALESCE(drc.rank_score_display, c.food_quality_score, -1) DESC, c.connection_id ASC`;

    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT
          c.connection_id,
          f.name AS food_name,
          c.food_quality_score,
          drc.rank_score_display AS contextual_score,
          drc.rank_percentile AS contextual_percentile
        FROM core_restaurant_items c
        JOIN core_entities f ON f.entity_id = c.food_id
        LEFT JOIN contextual_connection_scores drc
          ON drc.subject_id = c.connection_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY ${orderSql}
        LIMIT 1
      ) td ON true
    `;
  }

  private collectEntityIds(
    value?: Array<{ entityIds: string[] }> | null,
  ): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }
    const ids = value.flatMap((entry) =>
      Array.isArray(entry?.entityIds) ? entry.entityIds : [],
    );
    const unique = new Set<string>();
    for (const id of ids) {
      if (typeof id === 'string' && id.length > 0) {
        unique.add(id);
      }
    }
    return Array.from(unique);
  }
}
