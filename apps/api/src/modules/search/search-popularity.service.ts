import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

@Injectable()
export class SearchPopularityService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchPopularityService');
  }

  async getEntityPopularityScores(
    entityIds: string[],
  ): Promise<Map<string, number>> {
    if (!entityIds.length) {
      return new Map();
    }
    const entityIdArray = Prisma.sql`ARRAY[${Prisma.join(
      entityIds.map((id) => Prisma.sql`${id}::uuid`),
    )}]`;

    try {
      const rows = await this.prisma.$queryRaw<
        {
          entityId: string;
          score: number;
        }[]
      >(Prisma.sql`
        SELECT entity_id AS "entityId",
               COUNT(*)::float AS score
        FROM search_log
        WHERE entity_id = ANY(${entityIdArray})
        GROUP BY entity_id
      `);
      return new Map(rows.map((row) => [row.entityId, Number(row.score || 0)]));
    } catch (error) {
      this.logger.warn('Failed to load entity popularity scores', {
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }

  async getUserEntityAffinity(
    userId: string,
    entityIds: string[],
  ): Promise<Map<string, number>> {
    if (!userId || !entityIds.length) {
      return new Map();
    }
    const entityIdArray = Prisma.sql`ARRAY[${Prisma.join(
      entityIds.map((id) => Prisma.sql`${id}::uuid`),
    )}]`;
    const userUuid = Prisma.sql`${userId}::uuid`;

    try {
      const rows = await this.prisma.$queryRaw<
        {
          entityId: string;
          score: number;
        }[]
      >(Prisma.sql`
        SELECT entity_id AS "entityId",
               COUNT(*)::float AS score
        FROM search_log
        WHERE user_id = ${userUuid}
          AND entity_id = ANY(${entityIdArray})
        GROUP BY entity_id
      `);
      return new Map(rows.map((row) => [row.entityId, Number(row.score || 0)]));
    } catch (error) {
      this.logger.warn('Failed to load user affinity scores', {
        userId,
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }
}
