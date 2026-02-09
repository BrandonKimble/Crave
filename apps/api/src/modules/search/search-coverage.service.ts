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
  display_score: unknown;
  display_percentile: unknown;
  restaurant_quality_score: unknown;
  top_connection_id?: unknown;
  top_food_name?: unknown;
  top_food_quality_score?: unknown;
  top_food_display_score?: unknown;
  top_food_display_percentile?: unknown;
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
      Prisma.sql`EXISTS (SELECT 1 FROM core_connections c WHERE c.restaurant_id = e.entity_id)`,
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
          FROM core_connections c
          WHERE c.restaurant_id = e.entity_id
            AND c.food_id = ANY(ARRAY[${Prisma.join(foodEntityIds)}]::uuid[])
        )`,
      );
    }

    if (foodAttributeIds.length) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM core_connections c
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
    const scoreMode = request.scoreMode ?? 'global_quality';
    const topDishJoinSql = includeTopDish
      ? this.buildTopDishJoinSql({
          foodEntityIds,
          foodAttributeIds,
          scoreMode,
        })
      : Prisma.sql``;
    const topDishSelectSql = includeTopDish
      ? Prisma.sql`,
        td.connection_id AS top_connection_id,
        td.food_name AS top_food_name,
        td.food_quality_score AS top_food_quality_score,
        td.display_score AS top_food_display_score,
        td.display_percentile AS top_food_display_percentile`
      : Prisma.sql``;
    const locationJoinSql = Prisma.sql`
      JOIN LATERAL (
        SELECT
          rl.location_id,
          rl.longitude,
          rl.latitude
        FROM core_restaurant_locations rl
        WHERE rl.restaurant_id = e.entity_id
          AND rl.longitude IS NOT NULL
          AND rl.latitude IS NOT NULL
          AND rl.google_place_id IS NOT NULL
          AND rl.address IS NOT NULL
          AND rl.longitude BETWEEN ${minLng} AND ${maxLng}
          AND rl.latitude BETWEEN ${minLat} AND ${maxLat}
        ORDER BY
          POWER(rl.latitude - ${centerLat}, 2) + POWER(rl.longitude - ${centerLng}, 2) ASC,
          rl.updated_at DESC
        LIMIT 1
      ) pl ON true
    `;
    const startedAt = Date.now();
    const rows = await this.prisma.$queryRaw<
      CoverageRestaurantRow[]
    >(Prisma.sql`
      SELECT
        e.entity_id AS restaurant_id,
        e.name AS restaurant_name,
        pl.longitude AS longitude,
        pl.latitude AS latitude,
        drs.rank_score_display AS display_score,
        drs.rank_percentile AS display_percentile,
        e.restaurant_quality_score AS restaurant_quality_score
        ${topDishSelectSql}
      FROM core_entities e
      ${locationJoinSql}
      LEFT JOIN core_display_rank_scores drs
        ON drs.location_key = e.location_key
        AND drs.subject_type = 'restaurant'
        AND drs.subject_id = e.entity_id
      ${topDishJoinSql}
      WHERE ${Prisma.join(conditions, ' AND ')}
      LIMIT ${maxRestaurants};
    `);

    this.logger.debug('Built shortcut coverage restaurants', {
      count: rows.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      type: 'FeatureCollection',
      features: rows
        .map((row) => {
          const longitude = Number(row.longitude);
          const latitude = Number(row.latitude);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return null;
          }
          const displayPercentile = Number(row.display_percentile);
          const displayScore = Number(row.display_score);
          const restaurantQualityScore = Number(row.restaurant_quality_score);
          const topFoodQualityScore = Number(row.top_food_quality_score);
          const topFoodDisplayScore = Number(row.top_food_display_score);
          const topFoodDisplayPercentile = Number(
            row.top_food_display_percentile,
          );
          return {
            type: 'Feature',
            id: row.restaurant_id,
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
            properties: {
              restaurantId: row.restaurant_id,
              restaurantName: row.restaurant_name,
              contextualScore:
                includeTopDish && Number.isFinite(topFoodQualityScore)
                  ? topFoodQualityScore
                  : 0,
              rank: 9999,
              displayScore: Number.isFinite(displayScore) ? displayScore : null,
              displayPercentile: Number.isFinite(displayPercentile)
                ? displayPercentile
                : null,
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
              topDishDisplayPercentile:
                includeTopDish && Number.isFinite(topFoodDisplayPercentile)
                  ? topFoodDisplayPercentile
                  : null,
              topDishDisplayScore:
                includeTopDish && Number.isFinite(topFoodDisplayScore)
                  ? topFoodDisplayScore
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
    scoreMode: 'global_quality' | 'coverage_display';
  }): Prisma.Sql {
    const { foodEntityIds, foodAttributeIds, scoreMode } = params;
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

    const orderSql =
      scoreMode === 'global_quality'
        ? Prisma.sql`c.food_quality_score DESC, c.connection_id ASC`
        : Prisma.sql`COALESCE(drc.rank_score_raw, -1) DESC, c.connection_id ASC`;

    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT
          c.connection_id,
          f.name AS food_name,
          c.food_quality_score,
          drc.rank_score_display AS display_score,
          drc.rank_percentile AS display_percentile
        FROM core_connections c
        JOIN core_entities f ON f.entity_id = c.food_id
        LEFT JOIN core_display_rank_scores drc
          ON drc.location_key = e.location_key
          AND drc.subject_type = 'connection'
          AND drc.subject_id = c.connection_id
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
