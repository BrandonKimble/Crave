import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { QualityScoreService } from '../content-processing/quality-score/quality-score.service';
import { PublicCraveScoreService } from '../content-processing/public-crave-score';

@Injectable()
export class PollScoreRefreshService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityScoreService: QualityScoreService,
    private readonly publicCraveScoreService: PublicCraveScoreService,
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
    await this.refreshPublicCraveScores();
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

    await this.refreshPublicCraveScores();
  }

  private async refreshPublicCraveScores(): Promise<void> {
    await this.publicCraveScoreService.rebuildAllScores();
  }
}
