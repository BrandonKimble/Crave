import { Injectable, Inject } from '@nestjs/common';
import { Prisma, Entity, ActivityLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

type RestaurantEntity = Entity;

@Injectable()
export class RestaurantEntityMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantEntityMergeService');
  }

  async mergeDuplicateRestaurant(params: {
    canonical: RestaurantEntity;
    duplicate: RestaurantEntity;
    canonicalUpdate: Prisma.EntityUpdateInput;
  }): Promise<RestaurantEntity> {
    const { canonical, duplicate, canonicalUpdate } = params;

    this.logger.info('Merging duplicate restaurant entity', {
      canonicalId: canonical.entityId,
      duplicateId: duplicate.entityId,
      googlePlaceId: canonical.googlePlaceId || canonicalUpdate.googlePlaceId,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await this.mergeConnections(tx, canonical.entityId, duplicate.entityId);
      await this.mergeCategoryAggregates(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.mergeBoosts(tx, canonical.entityId, duplicate.entityId);
      await this.mergePriorityMetrics(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );

      const updatedCanonical = await tx.entity.update({
        where: { entityId: canonical.entityId },
        data: canonicalUpdate,
      });

      await tx.entity.delete({
        where: { entityId: duplicate.entityId },
      });

      return updatedCanonical;
    });

    this.logger.info('Restaurant entity merge completed', {
      canonicalId: result.entityId,
    });

    return result;
  }

  private async mergeConnections(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const connections = await tx.connection.findMany({
      where: { restaurantId: duplicateId },
    });

    if (!connections.length) {
      return;
    }

    for (const connection of connections) {
      const conflicting = await tx.connection.findFirst({
        where: {
          restaurantId: canonicalId,
          foodId: connection.foodId,
        },
      });

      if (conflicting) {
        await tx.connection.update({
          where: { connectionId: conflicting.connectionId },
          data: this.mergeConnectionRecords(conflicting, connection),
        });

        await tx.connection.delete({
          where: { connectionId: connection.connectionId },
        });
      } else {
        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: { restaurantId: canonicalId },
        });
      }
    }
  }

  private mergeConnectionRecords(
    target: Prisma.ConnectionGetPayload<{
      select: {
        connectionId: true;
        categories: true;
        foodAttributes: true;
        mentionCount: true;
        totalUpvotes: true;
        recentMentionCount: true;
        lastMentionedAt: true;
        activityLevel: true;
        foodQualityScore: true;
        decayedMentionScore: true;
        decayedUpvoteScore: true;
        decayedScoresUpdatedAt: true;
        boostLastAppliedAt: true;
      };
    }>,
    source: Prisma.ConnectionGetPayload<{
      select: {
        categories: true;
        foodAttributes: true;
        mentionCount: true;
        totalUpvotes: true;
        recentMentionCount: true;
        lastMentionedAt: true;
        activityLevel: true;
        foodQualityScore: true;
        decayedMentionScore: true;
        decayedUpvoteScore: true;
        decayedScoresUpdatedAt: true;
        boostLastAppliedAt: true;
      };
    }>,
  ): Prisma.ConnectionUpdateInput {
    const categories = this.mergeStringArrays(
      target.categories,
      source.categories,
    );
    const foodAttributes = this.mergeStringArrays(
      target.foodAttributes,
      source.foodAttributes,
    );
    const mentionCount = target.mentionCount + source.mentionCount;
    const totalUpvotes = target.totalUpvotes + source.totalUpvotes;
    const recentMentionCount =
      target.recentMentionCount + source.recentMentionCount;
    const lastMentionedAt = this.maxDate(
      target.lastMentionedAt,
      source.lastMentionedAt,
    );
    const boostLastAppliedAt = this.maxDate(
      target.boostLastAppliedAt,
      source.boostLastAppliedAt,
    );
    const activityLevel = this.mergeActivityLevel(
      target.activityLevel,
      source.activityLevel,
    );
    const foodQualityScore = this.sumDecimal(
      target.foodQualityScore,
      source.foodQualityScore,
    );
    const decayedMentionScore = this.sumDecimal(
      target.decayedMentionScore,
      source.decayedMentionScore,
    );
    const decayedUpvoteScore = this.sumDecimal(
      target.decayedUpvoteScore,
      source.decayedUpvoteScore,
    );
    const decayedScoresUpdatedAt = this.maxDate(
      target.decayedScoresUpdatedAt,
      source.decayedScoresUpdatedAt,
    );

    return {
      categories,
      foodAttributes,
      mentionCount,
      totalUpvotes,
      recentMentionCount,
      lastMentionedAt,
      boostLastAppliedAt,
      activityLevel,
      foodQualityScore,
      decayedMentionScore,
      decayedUpvoteScore,
      decayedScoresUpdatedAt,
      lastUpdated: new Date(),
    };
  }

  private async mergeCategoryAggregates(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const aggregates = await tx.categoryAggregate.findMany({
      where: { restaurantId: duplicateId },
    });

    if (!aggregates.length) {
      return;
    }

    for (const aggregate of aggregates) {
      const existing = await tx.categoryAggregate.findUnique({
        where: {
          restaurantId_categoryId: {
            restaurantId: canonicalId,
            categoryId: aggregate.categoryId,
          },
        },
      });

      if (existing) {
        await tx.categoryAggregate.update({
          where: {
            restaurantId_categoryId: {
              restaurantId: canonicalId,
              categoryId: aggregate.categoryId,
            },
          },
          data: {
            mentionsCount: existing.mentionsCount + aggregate.mentionsCount,
            totalUpvotes: existing.totalUpvotes + aggregate.totalUpvotes,
            lastMentionedAt:
              this.maxDate(
                existing.lastMentionedAt,
                aggregate.lastMentionedAt,
              ) ??
              existing.lastMentionedAt ??
              aggregate.lastMentionedAt ??
              new Date(),
            firstMentionedAt:
              this.minDate(
                existing.firstMentionedAt,
                aggregate.firstMentionedAt,
              ) ??
              existing.firstMentionedAt ??
              aggregate.firstMentionedAt ??
              new Date(),
            decayedMentionScore: this.sumDecimal(
              existing.decayedMentionScore,
              aggregate.decayedMentionScore,
            ),
            decayedUpvoteScore: this.sumDecimal(
              existing.decayedUpvoteScore,
              aggregate.decayedUpvoteScore,
            ),
            decayedScoresUpdatedAt: this.maxDate(
              existing.decayedScoresUpdatedAt,
              aggregate.decayedScoresUpdatedAt,
            ),
          },
        });

        await tx.categoryAggregate.delete({
          where: {
            restaurantId_categoryId: {
              restaurantId: duplicateId,
              categoryId: aggregate.categoryId,
            },
          },
        });
      } else {
        await tx.categoryAggregate.update({
          where: {
            restaurantId_categoryId: {
              restaurantId: duplicateId,
              categoryId: aggregate.categoryId,
            },
          },
          data: {
            restaurantId: canonicalId,
          },
        });
      }
    }
  }

  private async mergeBoosts(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.boost.updateMany({
      where: { restaurantId: duplicateId },
      data: { restaurantId: canonicalId },
    });
  }

  private async mergePriorityMetrics(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicatePriority = await tx.entityPriorityMetric.findUnique({
      where: { entityId: duplicateId },
    });

    if (!duplicatePriority) {
      return;
    }

    const canonicalPriority = await tx.entityPriorityMetric.findUnique({
      where: { entityId: canonicalId },
    });

    if (canonicalPriority) {
      await tx.entityPriorityMetric.update({
        where: { entityId: canonicalId },
        data: {
          priorityScore: this.maxDecimal(
            canonicalPriority.priorityScore,
            duplicatePriority.priorityScore,
          ),
          dataRecencyScore: this.maxDecimal(
            canonicalPriority.dataRecencyScore,
            duplicatePriority.dataRecencyScore,
          ),
          dataQualityScore: this.maxDecimal(
            canonicalPriority.dataQualityScore,
            duplicatePriority.dataQualityScore,
          ),
          userDemandScore: this.maxDecimal(
            canonicalPriority.userDemandScore,
            duplicatePriority.userDemandScore,
          ),
          queryImpressions:
            canonicalPriority.queryImpressions +
            duplicatePriority.queryImpressions,
          isNewEntity:
            canonicalPriority.isNewEntity || duplicatePriority.isNewEntity,
          lastCalculatedAt: this.maxDate(
            canonicalPriority.lastCalculatedAt,
            duplicatePriority.lastCalculatedAt,
          ),
          lastSelectedAt: this.maxDate(
            canonicalPriority.lastSelectedAt,
            duplicatePriority.lastSelectedAt,
          ),
          lastQueryAt: this.maxDate(
            canonicalPriority.lastQueryAt,
            duplicatePriority.lastQueryAt,
          ),
        },
      });

      await tx.entityPriorityMetric.delete({
        where: { entityId: duplicateId },
      });
    } else {
      await tx.entityPriorityMetric.update({
        where: { entityId: duplicateId },
        data: { entityId: canonicalId },
      });
    }
  }

  private mergeStringArrays(
    target: string[] | null | undefined,
    source: string[] | null | undefined,
  ): string[] {
    const merged = new Set<string>();
    for (const value of target ?? []) {
      if (value) merged.add(value);
    }
    for (const value of source ?? []) {
      if (value) merged.add(value);
    }
    return Array.from(merged);
  }

  private sumDecimal(
    a: Prisma.Decimal | number | string | null | undefined,
    b: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal {
    return this.toDecimal(a).add(this.toDecimal(b));
  }

  private maxDecimal(
    a: Prisma.Decimal | number | string | null | undefined,
    b: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal | null {
    if (a === null || a === undefined) {
      return b === null || b === undefined ? null : this.toDecimal(b);
    }
    if (b === null || b === undefined) {
      return this.toDecimal(a);
    }
    const decA = this.toDecimal(a);
    const decB = this.toDecimal(b);
    return decA.greaterThan(decB) ? decA : decB;
  }

  private toDecimal(
    value: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal {
    if (value === null || value === undefined) {
      return new Prisma.Decimal(0);
    }
    if (value instanceof Prisma.Decimal) {
      return value;
    }
    return new Prisma.Decimal(value);
  }

  private maxDate(
    a: Date | null | undefined,
    b: Date | null | undefined,
  ): Date | undefined {
    if (a && b) {
      return a.getTime() >= b.getTime() ? a : b;
    }
    return a ?? b ?? undefined;
  }

  private minDate(
    a: Date | null | undefined,
    b: Date | null | undefined,
  ): Date | undefined {
    if (a && b) {
      return a.getTime() <= b.getTime() ? a : b;
    }
    return a ?? b ?? undefined;
  }

  private mergeActivityLevel(
    a: ActivityLevel,
    b: ActivityLevel,
  ): ActivityLevel {
    const priority: Record<ActivityLevel, number> = {
      trending: 3,
      active: 2,
      normal: 1,
    };

    return priority[a] >= priority[b] ? a : b;
  }
}
