import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { QualityScoreService } from '../content-processing/quality-score/quality-score.service';
import { RankScoreRefreshQueueService } from '../content-processing/rank-score/rank-score-refresh.service';

@Injectable()
export class PollScoreRefreshService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityScoreService: QualityScoreService,
    private readonly rankScoreRefreshQueue: RankScoreRefreshQueueService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollScoreRefreshService');
  }

  async refreshForConnections(connectionIds: string[]): Promise<void> {
    const unique = Array.from(new Set(connectionIds)).filter(Boolean);
    if (!unique.length) {
      return;
    }

    await this.qualityScoreService.updateQualityScoresForConnections(unique);
    const coverageKeys = await this.fetchCoverageKeysForConnections(unique);
    await this.refreshRankScores(coverageKeys);
  }

  async refreshForRestaurants(restaurantIds: string[]): Promise<void> {
    const unique = Array.from(new Set(restaurantIds)).filter(Boolean);
    if (!unique.length) {
      return;
    }

    for (const restaurantId of unique) {
      try {
        const score =
          await this.qualityScoreService.calculateRestaurantQualityScore(
            restaurantId,
          );
        await this.prisma.entity.update({
          where: { entityId: restaurantId },
          data: { restaurantQualityScore: score, lastUpdated: new Date() },
        });
      } catch (error) {
        this.logger.warn('Failed to update restaurant score', {
          restaurantId,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      }
    }

    const coverageKeys = await this.fetchCoverageKeysForRestaurants(unique);
    await this.refreshRankScores(coverageKeys);
  }

  async refreshRankScores(coverageKeys: string[]): Promise<void> {
    await this.rankScoreRefreshQueue.queueRefreshForLocations(coverageKeys, {
      source: 'poll',
    });
  }

  private async fetchCoverageKeysForConnections(
    connectionIds: string[],
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ location_key: string }>>(
      Prisma.sql`
SELECT DISTINCT r.location_key
FROM core_connections c
JOIN core_entities r ON r.entity_id = c.restaurant_id
WHERE c.connection_id = ANY(${this.buildUuidArray(connectionIds)})`,
    );

    return Array.from(
      new Set(
        rows
          .map((row) => row.location_key)
          .filter((value): value is string => Boolean(value))
          .map((value) => value.trim().toLowerCase()),
      ),
    );
  }

  private async fetchCoverageKeysForRestaurants(
    restaurantIds: string[],
  ): Promise<string[]> {
    const rows = await this.prisma.entity.findMany({
      where: { entityId: { in: restaurantIds } },
      select: { locationKey: true },
    });

    return Array.from(
      new Set(
        rows
          .map((row) => row.locationKey)
          .filter((value): value is string => Boolean(value))
          .map((value) => value.trim().toLowerCase()),
      ),
    );
  }

  private buildUuidArray(values: string[]): Prisma.Sql {
    const mapped = Prisma.join(
      values.map((value) => Prisma.sql`${value}::uuid`),
      ', ',
    );
    return Prisma.sql`ARRAY[${mapped}]::uuid[]`;
  }
}
