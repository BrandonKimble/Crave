import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface LocationDemandRecord {
  locationKey: string;
  impressions: number;
}

export interface EntityDemandRecord {
  entityId: string;
  entityType: EntityType;
  locationKey: string;
  impressions: number;
  lastSeenAt: Date;
}

@Injectable()
export class SearchDemandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async listActiveLocations(params: {
    since: Date;
    minImpressions: number;
    limit?: number;
  }): Promise<LocationDemandRecord[]> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ location_key: string | null; impressions: bigint }>
      >(
        Prisma.sql`
          SELECT
            COALESCE(location_key, 'global') AS location_key,
            COUNT(*)::bigint AS impressions
          FROM search_log
          WHERE logged_at >= ${params.since}
          GROUP BY COALESCE(location_key, 'global')
          HAVING COUNT(*) >= ${params.minImpressions}
          ORDER BY impressions DESC
          ${params.limit ? Prisma.sql`LIMIT ${params.limit}` : Prisma.empty}
        `,
      );

      return rows.map((row) => ({
        locationKey: row.location_key ?? 'global',
        impressions: Number(row.impressions),
      }));
    } catch (error) {
      this.logger.warn('Failed to load active search locations', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  async getTopEntitiesForLocation(params: {
    locationKey: string | null;
    since: Date;
    entityTypes?: EntityType[];
    minImpressions: number;
    limit: number;
  }): Promise<EntityDemandRecord[]> {
    const locationKey = params.locationKey ?? 'global';
    const filters: Prisma.Sql[] = [Prisma.sql`logged_at >= ${params.since}`];

    if (locationKey === 'global') {
      filters.push(
        Prisma.sql`(location_key IS NULL OR location_key = 'global')`,
      );
    } else {
      filters.push(Prisma.sql`LOWER(location_key) = LOWER(${locationKey})`);
    }

    if (params.entityTypes?.length) {
      filters.push(
        Prisma.sql`entity_type IN (${Prisma.join(params.entityTypes)})`,
      );
    }

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          entity_id: string;
          entity_type: EntityType;
          location_key: string | null;
          impressions: bigint;
          last_logged_at: Date;
        }>
      >(
        Prisma.sql`
          SELECT
            entity_id,
            entity_type,
            COALESCE(location_key, 'global') AS location_key,
            COUNT(*)::bigint AS impressions,
            MAX(logged_at) AS last_logged_at
          FROM search_log
          WHERE ${Prisma.join(filters, ' AND ')}
          GROUP BY entity_id, entity_type, COALESCE(location_key, 'global')
          HAVING COUNT(*) >= ${params.minImpressions}
          ORDER BY impressions DESC
          LIMIT ${params.limit}
        `,
      );

      return rows.map((row) => ({
        entityId: row.entity_id,
        entityType: row.entity_type,
        locationKey: row.location_key ?? 'global',
        impressions: Number(row.impressions),
        lastSeenAt: row.last_logged_at,
      }));
    } catch (error) {
      this.logger.warn('Failed to load entity demand for location', {
        locationKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }
}
