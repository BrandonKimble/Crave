import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const BATCH_SIZE = 100;

@Injectable()
export class PollCategoryReplayService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollCategoryReplayService');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async replayDeferredVotes(): Promise<void> {
    while (true) {
      const aggregates = await this.prisma.pollCategoryAggregate.findMany({
        take: BATCH_SIZE,
        orderBy: { updatedAt: 'asc' },
      });

      if (!aggregates.length) {
        break;
      }

      for (const aggregate of aggregates) {
        await this.processAggregate(aggregate).catch((error) => {
          this.logger.warn('Failed to replay poll category aggregate', {
            restaurantId: aggregate.restaurantId,
            categoryId: aggregate.categoryId,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : { message: String(error) },
          });
        });
      }

      if (aggregates.length < BATCH_SIZE) {
        break;
      }
    }
  }

  private async processAggregate(aggregate: {
    restaurantId: string;
    categoryId: string;
    pseudoMentions: Prisma.Decimal;
    pseudoUpvotes: Prisma.Decimal;
    voteCount: number;
  }): Promise<void> {
    const connections = await this.prisma.connection.findMany({
      where: {
        restaurantId: aggregate.restaurantId,
        OR: [
          { foodId: aggregate.categoryId },
          { categories: { has: aggregate.categoryId } },
        ],
      },
      select: { connectionId: true, foodId: true },
    });

    if (!connections.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const connection of connections) {
        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: {
            decayedMentionScore: {
              increment: aggregate.pseudoMentions,
            },
            decayedUpvoteScore: {
              increment: aggregate.pseudoUpvotes,
            },
            decayedScoresUpdatedAt: new Date(),
          },
        });
      }

      const affectedFoodIds = connections
        .map((connection) => connection.foodId)
        .filter((id): id is string => Boolean(id));

      await tx.entity.updateMany({
        where: { entityId: aggregate.restaurantId },
        data: { lastPolledAt: new Date() },
      });

      if (affectedFoodIds.length) {
        await tx.entity.updateMany({
          where: { entityId: { in: affectedFoodIds } },
          data: { lastPolledAt: new Date() },
        });
      }

      await tx.pollCategoryAggregate.delete({
        where: {
          restaurantId_categoryId: {
            restaurantId: aggregate.restaurantId,
            categoryId: aggregate.categoryId,
          },
        },
      });
    });
  }
}
