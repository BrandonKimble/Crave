import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface LocationDemandRecord {
  marketKey: string;
  impressions: number;
}

export interface EntityDemandRecord {
  entityId: string;
  entityType: EntityType;
  marketKey: string;
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
        Array<{ market_key: string | null; impressions: bigint }>
      >(
        Prisma.sql`
          SELECT
            market_key,
            COUNT(*)::bigint AS impressions
          FROM user_search_logs
          WHERE logged_at >= ${params.since}
            AND market_key IS NOT NULL
          GROUP BY market_key
          HAVING COUNT(*) >= ${params.minImpressions}
          ORDER BY impressions DESC
          ${params.limit ? Prisma.sql`LIMIT ${params.limit}` : Prisma.empty}
        `,
      );

      return rows
        .filter(
          (row): row is { market_key: string; impressions: bigint } =>
            typeof row.market_key === 'string' &&
            row.market_key.trim().length > 0,
        )
        .map((row) => ({
          marketKey: row.market_key.trim().toLowerCase(),
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
    marketKey: string | null;
    since: Date;
    entityTypes?: EntityType[];
    minImpressions: number;
    limit: number;
  }): Promise<EntityDemandRecord[]> {
    const marketKey =
      typeof params.marketKey === 'string' ? params.marketKey.trim() : '';
    if (!marketKey) {
      return [];
    }

    const filters: Prisma.Sql[] = [Prisma.sql`logged_at >= ${params.since}`];
    filters.push(Prisma.sql`LOWER(market_key) = LOWER(${marketKey})`);

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
          market_key: string | null;
          impressions: bigint;
          last_logged_at: Date;
        }>
      >(
        Prisma.sql`
          SELECT
            entity_id,
            entity_type,
            market_key,
            COUNT(*)::bigint AS impressions,
            MAX(logged_at) AS last_logged_at
          FROM user_search_logs
          WHERE ${Prisma.join(filters, ' AND ')}
          GROUP BY entity_id, entity_type, market_key
          HAVING COUNT(*) >= ${params.minImpressions}
          ORDER BY impressions DESC
          LIMIT ${params.limit}
        `,
      );

      return rows
        .filter(
          (
            row,
          ): row is {
            entity_id: string;
            entity_type: EntityType;
            market_key: string;
            impressions: bigint;
            last_logged_at: Date;
          } =>
            typeof row.market_key === 'string' &&
            row.market_key.trim().length > 0,
        )
        .map((row) => ({
          entityId: row.entity_id,
          entityType: row.entity_type,
          marketKey: row.market_key.trim().toLowerCase(),
          impressions: Number(row.impressions),
          lastSeenAt: row.last_logged_at,
        }));
    } catch (error) {
      this.logger.warn('Failed to load entity demand for location', {
        marketKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }
}
