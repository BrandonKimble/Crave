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
  display_percentile: unknown;
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
      Prisma.sql`pl.longitude IS NOT NULL`,
      Prisma.sql`pl.latitude IS NOT NULL`,
    ];

    if (restaurantEntityIds.length) {
      conditions.push(
        Prisma.sql`e.entity_id = ANY(ARRAY[${Prisma.join(restaurantEntityIds)}]::uuid[])`,
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
            AND c.food_attributes && ARRAY[${Prisma.join(foodAttributeIds)}]::uuid[]
        )`,
      );
    }

    const minLng = Math.min(swLng, neLng);
    const maxLng = Math.max(swLng, neLng);
    const minLat = Math.min(swLat, neLat);
    const maxLat = Math.max(swLat, neLat);
    conditions.push(Prisma.sql`pl.longitude BETWEEN ${minLng} AND ${maxLng}`);
    conditions.push(Prisma.sql`pl.latitude BETWEEN ${minLat} AND ${maxLat}`);

    const maxRestaurants = 50000;
    const startedAt = Date.now();
    const rows = await this.prisma.$queryRaw<
      CoverageRestaurantRow[]
    >(Prisma.sql`
      SELECT
        e.entity_id AS restaurant_id,
        e.name AS restaurant_name,
        pl.longitude AS longitude,
        pl.latitude AS latitude,
        drs.rank_percentile AS display_percentile
      FROM core_entities e
      JOIN core_restaurant_locations pl
        ON pl.location_id = e.primary_location_id
      LEFT JOIN core_display_rank_scores drs
        ON drs.location_key = e.location_key
        AND drs.subject_type = 'restaurant'
        AND drs.subject_id = e.entity_id
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
          return {
            type: 'Feature',
            id: row.restaurant_id,
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
            properties: {
              restaurantId: row.restaurant_id,
              restaurantName: row.restaurant_name,
              contextualScore: 0,
              rank: 9999,
              displayPercentile: Number.isFinite(displayPercentile)
                ? displayPercentile
                : null,
            },
          };
        })
        .filter(Boolean),
    };
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
