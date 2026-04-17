import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ActivityLevel, Connection, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { QualityScoreService } from '../quality-score/quality-score.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
type PrismaTransaction = Prisma.TransactionClient;

type ActiveRestaurantEvent = {
  extractionRunId: string;
  restaurantId: string;
  mentionKey: string;
  evidenceType: string;
  mentionedAt: Date;
  sourceUpvotes: number;
  sourceDocument: {
    activeExtractionRunId: string | null;
  };
};

type ActiveRestaurantEntityEvent = {
  extractionRunId: string;
  restaurantId: string;
  mentionKey: string;
  entityId: string;
  entityType: EntityType;
  evidenceType: string;
  isMenuItem: boolean | null;
  mentionedAt: Date;
  sourceUpvotes: number;
  sourceDocument: {
    activeExtractionRunId: string | null;
  };
};

type MentionEventGroup = {
  restaurantId: string;
  mentionKey: string;
  events: ActiveRestaurantEntityEvent[];
};

type ItemSupportMention = {
  restaurantId: string;
  foodId: string | null;
  categoryIds: string[];
  mentionedAt: Date;
  sourceUpvotes: number;
  foodAttributeIds: string[];
};

type RestaurantItemProjection = {
  restaurantId: string;
  foodId: string;
  categories: string[];
  baseFoodAttributes: string[];
  foodAttributes: string[];
  mentionCount: number;
  totalUpvotes: number;
  recentMentionCount: number;
  supportMentionCount: number;
  supportTotalUpvotes: number;
  supportRecentMentionCount: number;
  lastMentionedAt: Date | null;
  firstMentionedAt: Date | null;
  activityLevel: ActivityLevel;
  decayedMentionScore: number;
  decayedUpvoteScore: number;
  supportDecayedMentionScore: number;
  supportDecayedUpvoteScore: number;
  decayedScoresUpdatedAt: Date;
};

@Injectable()
export class ProjectionRebuildService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly qualityScoreService: QualityScoreService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ProjectionRebuildService');
  }

  /**
   * Rebuild all restaurant-level projections from the currently active event set.
   * This is the authoritative, order-independent path used after ingestion and replay cutovers.
   */
  async rebuildForRestaurants(
    restaurantIds: string[],
    tx?: PrismaTransaction,
  ): Promise<{ connectionIds: string[]; restaurantIds: string[] }> {
    const uniqueRestaurantIds = Array.from(
      new Set(restaurantIds.filter((value): value is string => Boolean(value))),
    );
    if (!uniqueRestaurantIds.length) {
      return { connectionIds: [], restaurantIds: [] };
    }

    if (tx) {
      const connectionIds = await this.rebuildForRestaurantsTx(
        tx,
        uniqueRestaurantIds,
      );
      return { connectionIds, restaurantIds: uniqueRestaurantIds };
    }

    const connectionIds = await this.prismaService.$transaction(
      async (transaction) =>
        this.rebuildForRestaurantsTx(transaction, uniqueRestaurantIds),
      { timeout: 15 * 60 * 1000 },
    );

    return { connectionIds, restaurantIds: uniqueRestaurantIds };
  }

  async refreshQualityScores(params: {
    connectionIds: string[];
    restaurantIds?: string[];
  }): Promise<void> {
    const connectionIds = Array.from(
      new Set(params.connectionIds.filter((value): value is string => !!value)),
    );
    const restaurantIds = Array.from(
      new Set(
        (params.restaurantIds ?? []).filter(
          (value): value is string => !!value,
        ),
      ),
    );

    if (connectionIds.length > 0) {
      await this.qualityScoreService.updateQualityScoresForConnections(
        connectionIds,
      );
    }

    if (!restaurantIds.length) {
      return;
    }

    for (const restaurantId of restaurantIds) {
      try {
        const restaurantQualityScore =
          await this.qualityScoreService.calculateRestaurantQualityScore(
            restaurantId,
          );
        await this.prismaService.entity.update({
          where: { entityId: restaurantId },
          data: {
            restaurantQualityScore,
            lastUpdated: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn('Failed to refresh restaurant quality score', {
          restaurantId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async rebuildForRestaurantsTx(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<string[]> {
    const [restaurantEvents, entityEvents] = await Promise.all([
      this.loadActiveRestaurantEvents(tx, restaurantIds),
      this.loadActiveRestaurantEntityEvents(tx, restaurantIds),
    ]);

    await Promise.all([
      this.replaceRestaurantPraise(tx, restaurantIds, restaurantEvents),
      this.replaceRestaurantEntitySignals(tx, restaurantIds, entityEvents),
    ]);

    const mentionGroups = this.groupEntityEventsByMention(entityEvents);
    const itemSupportMentions = this.buildItemSupportMentions(mentionGroups);
    const itemProjections = this.buildRestaurantItemProjections(
      mentionGroups,
      itemSupportMentions,
    );

    const connectionIds = await this.replaceRestaurantItems(
      tx,
      restaurantIds,
      itemProjections,
    );

    this.logger.debug('Rebuilt restaurant projections from active evidence', {
      restaurantCount: restaurantIds.length,
      restaurantEventCount: restaurantEvents.length,
      restaurantEntityEventCount: entityEvents.length,
      itemSupportMentionCount: itemSupportMentions.length,
      rebuiltConnectionCount: connectionIds.length,
    });

    return connectionIds;
  }

  private async loadActiveRestaurantEvents(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<ActiveRestaurantEvent[]> {
    const rows = await tx.restaurantEvent.findMany({
      where: {
        restaurantId: { in: restaurantIds },
      },
      select: {
        extractionRunId: true,
        restaurantId: true,
        mentionKey: true,
        evidenceType: true,
        mentionedAt: true,
        sourceUpvotes: true,
        sourceDocument: {
          select: { activeExtractionRunId: true },
        },
      },
    });

    return rows.filter(
      (row): row is ActiveRestaurantEvent =>
        row.sourceDocument.activeExtractionRunId === row.extractionRunId,
    );
  }

  private async loadActiveRestaurantEntityEvents(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<ActiveRestaurantEntityEvent[]> {
    const rows = await tx.restaurantEntityEvent.findMany({
      where: {
        restaurantId: { in: restaurantIds },
      },
      select: {
        extractionRunId: true,
        restaurantId: true,
        mentionKey: true,
        entityId: true,
        entityType: true,
        evidenceType: true,
        isMenuItem: true,
        mentionedAt: true,
        sourceUpvotes: true,
        sourceDocument: {
          select: { activeExtractionRunId: true },
        },
      },
    });

    return rows.filter(
      (row) => row.sourceDocument.activeExtractionRunId === row.extractionRunId,
    );
  }

  private groupEntityEventsByMention(
    entityEvents: ActiveRestaurantEntityEvent[],
  ): MentionEventGroup[] {
    const groups = new Map<string, MentionEventGroup>();

    entityEvents.forEach((event) => {
      const key = `${event.restaurantId}:${event.mentionKey}`;
      const existing = groups.get(key);
      if (existing) {
        existing.events.push(event);
        return;
      }

      groups.set(key, {
        restaurantId: event.restaurantId,
        mentionKey: event.mentionKey,
        events: [event],
      });
    });

    return Array.from(groups.values());
  }

  private buildItemSupportMentions(
    mentionGroups: MentionEventGroup[],
  ): ItemSupportMention[] {
    const mentions: ItemSupportMention[] = [];

    mentionGroups.forEach((group) => {
      const foodEvent = group.events.find(
        (event) =>
          event.entityType === 'food' &&
          (event.evidenceType === 'menu_item_food' ||
            event.evidenceType === 'food_mention'),
      );
      if (foodEvent?.isMenuItem === true) {
        return;
      }

      const supportFoodId =
        foodEvent?.evidenceType === 'food_mention' ? foodEvent.entityId : null;
      const categoryIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const foodAttributeIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_attribute')
            .map((event) => event.entityId),
        ),
      );
      if (
        !supportFoodId &&
        categoryIds.length === 0 &&
        foodAttributeIds.length === 0
      ) {
        return;
      }

      mentions.push({
        restaurantId: group.restaurantId,
        foodId: supportFoodId,
        categoryIds,
        mentionedAt:
          foodEvent?.mentionedAt ?? group.events[0]?.mentionedAt ?? new Date(0),
        sourceUpvotes:
          foodEvent?.sourceUpvotes ?? group.events[0]?.sourceUpvotes ?? 0,
        foodAttributeIds,
      });
    });

    return mentions.sort(
      (left, right) => left.mentionedAt.getTime() - right.mentionedAt.getTime(),
    );
  }

  private buildRestaurantItemProjections(
    mentionGroups: MentionEventGroup[],
    itemSupportMentions: ItemSupportMention[],
  ): RestaurantItemProjection[] {
    const config = this.qualityScoreService.getConfig();
    const now = new Date();
    const mentionDecayMs = Math.max(
      1,
      config.timeDecay.mentionCountDecayDays * MS_PER_DAY,
    );
    const upvoteDecayMs = Math.max(
      1,
      config.timeDecay.upvoteDecayDays * MS_PER_DAY,
    );
    const recentThresholdMs =
      config.timeDecay.recentMentionThresholdDays * MS_PER_DAY;
    const activeThresholdMs = 7 * MS_PER_DAY;

    const items = new Map<string, RestaurantItemProjection>();

    mentionGroups.forEach((group) => {
      const foodEvent = group.events.find(
        (event) =>
          event.entityType === 'food' &&
          event.isMenuItem === true &&
          event.evidenceType === 'menu_item_food',
      );
      if (!foodEvent) {
        return;
      }

      const categories = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const foodAttributes = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_attribute')
            .map((event) => event.entityId),
        ),
      );
      const key = `${foodEvent.restaurantId}:${foodEvent.entityId}`;
      const aggregate =
        items.get(key) ??
        ({
          restaurantId: foodEvent.restaurantId,
          foodId: foodEvent.entityId,
          categories: [],
          baseFoodAttributes: [],
          foodAttributes: [],
          mentionCount: 0,
          totalUpvotes: 0,
          recentMentionCount: 0,
          supportMentionCount: 0,
          supportTotalUpvotes: 0,
          supportRecentMentionCount: 0,
          lastMentionedAt: null,
          firstMentionedAt: null,
          activityLevel: 'normal',
          decayedMentionScore: 0,
          decayedUpvoteScore: 0,
          supportDecayedMentionScore: 0,
          supportDecayedUpvoteScore: 0,
          decayedScoresUpdatedAt: now,
        } satisfies RestaurantItemProjection);

      aggregate.categories = Array.from(
        new Set([...aggregate.categories, ...categories]),
      ).sort();
      aggregate.baseFoodAttributes = Array.from(
        new Set([...aggregate.baseFoodAttributes, ...foodAttributes]),
      ).sort();
      aggregate.foodAttributes = Array.from(
        new Set([...aggregate.foodAttributes, ...foodAttributes]),
      ).sort();

      this.applyTimedContribution(
        aggregate,
        foodEvent.mentionedAt,
        foodEvent.sourceUpvotes ?? 0,
        now,
        mentionDecayMs,
        upvoteDecayMs,
        recentThresholdMs,
        activeThresholdMs,
      );

      items.set(key, aggregate);
    });

    const itemsByRestaurant = new Map<string, RestaurantItemProjection[]>();
    items.forEach((aggregate) => {
      const existing = itemsByRestaurant.get(aggregate.restaurantId) ?? [];
      existing.push(aggregate);
      itemsByRestaurant.set(aggregate.restaurantId, existing);
    });

    itemSupportMentions.forEach((support) => {
      const restaurantItems = itemsByRestaurant.get(support.restaurantId) ?? [];
      if (restaurantItems.length === 0) {
        return;
      }

      restaurantItems.forEach((aggregate) => {
        const matchesFood =
          support.foodId !== null && aggregate.foodId === support.foodId;
        const matchesCategory =
          support.categoryIds.length > 0 &&
          support.categoryIds.some((categoryId) =>
            aggregate.categories.includes(categoryId),
          );
        const matchesAttribute =
          support.foodAttributeIds.length > 0 &&
          support.foodAttributeIds.some((attributeId) =>
            aggregate.baseFoodAttributes.includes(attributeId),
          );

        if (!matchesFood && !matchesCategory && !matchesAttribute) {
          return;
        }

        if (
          support.foodAttributeIds.length > 0 &&
          !matchesAttribute &&
          (matchesFood || matchesCategory)
        ) {
          return;
        }

        this.applySupportContribution(
          aggregate,
          support.mentionedAt,
          support.sourceUpvotes,
          now,
          mentionDecayMs,
          upvoteDecayMs,
          recentThresholdMs,
          activeThresholdMs,
        );
      });
    });

    return Array.from(items.values());
  }

  private applyTimedContribution(
    aggregate: RestaurantItemProjection,
    mentionedAt: Date,
    upvotes: number,
    now: Date,
    mentionDecayMs: number,
    upvoteDecayMs: number,
    recentThresholdMs: number,
    activeThresholdMs: number,
  ): void {
    aggregate.mentionCount += 1;
    aggregate.totalUpvotes += Math.max(0, upvotes);

    if (
      !aggregate.firstMentionedAt ||
      mentionedAt.getTime() < aggregate.firstMentionedAt.getTime()
    ) {
      aggregate.firstMentionedAt = mentionedAt;
    }
    if (
      !aggregate.lastMentionedAt ||
      mentionedAt.getTime() > aggregate.lastMentionedAt.getTime()
    ) {
      aggregate.lastMentionedAt = mentionedAt;
    }

    const elapsedMs = Math.max(0, now.getTime() - mentionedAt.getTime());
    aggregate.decayedMentionScore += Math.exp(-elapsedMs / mentionDecayMs);
    aggregate.decayedUpvoteScore +=
      Math.max(0, upvotes) * Math.exp(-elapsedMs / upvoteDecayMs);

    if (elapsedMs <= recentThresholdMs) {
      aggregate.recentMentionCount += 1;
    }
    if (elapsedMs <= activeThresholdMs) {
      aggregate.activityLevel = 'active';
    }
  }

  private applySupportContribution(
    aggregate: RestaurantItemProjection,
    mentionedAt: Date,
    upvotes: number,
    now: Date,
    mentionDecayMs: number,
    upvoteDecayMs: number,
    recentThresholdMs: number,
    activeThresholdMs: number,
  ): void {
    aggregate.supportMentionCount += 1;
    aggregate.supportTotalUpvotes += Math.max(0, upvotes);

    if (
      !aggregate.lastMentionedAt ||
      mentionedAt.getTime() > aggregate.lastMentionedAt.getTime()
    ) {
      aggregate.lastMentionedAt = mentionedAt;
    }

    const elapsedMs = Math.max(0, now.getTime() - mentionedAt.getTime());
    aggregate.supportDecayedMentionScore += Math.exp(
      -elapsedMs / mentionDecayMs,
    );
    aggregate.supportDecayedUpvoteScore +=
      Math.max(0, upvotes) * Math.exp(-elapsedMs / upvoteDecayMs);

    if (elapsedMs <= recentThresholdMs) {
      aggregate.supportRecentMentionCount += 1;
    }
    if (elapsedMs <= activeThresholdMs) {
      aggregate.activityLevel = 'active';
    }
  }

  private async replaceRestaurantPraise(
    tx: PrismaTransaction,
    restaurantIds: string[],
    restaurantEvents: ActiveRestaurantEvent[],
  ): Promise<void> {
    const praiseTotals = new Map<string, number>();

    restaurantEvents
      .filter((event) => event.evidenceType === 'general_praise')
      .forEach((event) => {
        praiseTotals.set(
          event.restaurantId,
          (praiseTotals.get(event.restaurantId) ?? 0) +
            (event.sourceUpvotes ?? 0),
        );
      });

    await tx.entity.updateMany({
      where: { entityId: { in: restaurantIds } },
      data: {
        generalPraiseUpvotes: 0,
        lastUpdated: new Date(),
      },
    });

    for (const restaurantId of restaurantIds) {
      const total = praiseTotals.get(restaurantId) ?? 0;
      if (total <= 0) {
        continue;
      }

      await tx.entity.update({
        where: { entityId: restaurantId },
        data: {
          generalPraiseUpvotes: total,
          lastUpdated: new Date(),
        },
      });
    }
  }

  private async replaceRestaurantEntitySignals(
    tx: PrismaTransaction,
    restaurantIds: string[],
    entityEvents: ActiveRestaurantEntityEvent[],
  ): Promise<void> {
    const counts = new Map<
      string,
      {
        restaurantId: string;
        entityId: string;
        entityType: EntityType;
        mentionCount: number;
      }
    >();

    entityEvents.forEach((event) => {
      const key = `${event.restaurantId}:${event.entityId}`;
      const existing =
        counts.get(key) ??
        ({
          restaurantId: event.restaurantId,
          entityId: event.entityId,
          entityType: event.entityType,
          mentionCount: 0,
        } as {
          restaurantId: string;
          entityId: string;
          entityType: EntityType;
          mentionCount: number;
        });
      existing.mentionCount += 1;
      counts.set(key, existing);
    });

    await tx.restaurantEntitySignal.deleteMany({
      where: { restaurantId: { in: restaurantIds } },
    });

    if (counts.size === 0) {
      return;
    }

    await tx.restaurantEntitySignal.createMany({
      data: Array.from(counts.values()).map((row) => ({
        restaurantId: row.restaurantId,
        entityId: row.entityId,
        entityType: row.entityType,
        mentionCount: row.mentionCount,
      })),
    });
  }

  private async replaceRestaurantItems(
    tx: PrismaTransaction,
    restaurantIds: string[],
    items: RestaurantItemProjection[],
  ): Promise<string[]> {
    const existingConnections = await tx.connection.findMany({
      where: { restaurantId: { in: restaurantIds } },
    });

    const existingByKey = new Map<string, Connection>();
    existingConnections.forEach((connection) => {
      existingByKey.set(
        `${connection.restaurantId}:${connection.foodId}`,
        connection,
      );
    });

    const retainedKeys = new Set<string>();
    const affectedConnectionIds: string[] = [];
    const now = new Date();

    for (const item of items) {
      const key = `${item.restaurantId}:${item.foodId}`;
      retainedKeys.add(key);

      const existing = existingByKey.get(key);
      if (existing) {
        await tx.connection.update({
          where: { connectionId: existing.connectionId },
          data: {
            categories: item.categories,
            foodAttributes: item.foodAttributes,
            mentionCount: item.mentionCount,
            totalUpvotes: item.totalUpvotes,
            recentMentionCount: item.recentMentionCount,
            supportMentionCount: item.supportMentionCount,
            supportTotalUpvotes: item.supportTotalUpvotes,
            supportRecentMentionCount: item.supportRecentMentionCount,
            lastMentionedAt: item.lastMentionedAt,
            activityLevel: item.activityLevel,
            lastUpdated: now,
            decayedMentionScore: item.decayedMentionScore,
            decayedUpvoteScore: item.decayedUpvoteScore,
            supportDecayedMentionScore: item.supportDecayedMentionScore,
            supportDecayedUpvoteScore: item.supportDecayedUpvoteScore,
            decayedScoresUpdatedAt: item.decayedScoresUpdatedAt,
          },
        });
        affectedConnectionIds.push(existing.connectionId);
        continue;
      }

      const created = await tx.connection.create({
        data: {
          restaurantId: item.restaurantId,
          foodId: item.foodId,
          categories: item.categories,
          foodAttributes: item.foodAttributes,
          mentionCount: item.mentionCount,
          totalUpvotes: item.totalUpvotes,
          recentMentionCount: item.recentMentionCount,
          supportMentionCount: item.supportMentionCount,
          supportTotalUpvotes: item.supportTotalUpvotes,
          supportRecentMentionCount: item.supportRecentMentionCount,
          lastMentionedAt: item.lastMentionedAt,
          activityLevel: item.activityLevel,
          foodQualityScore: 0,
          lastUpdated: now,
          createdAt: item.firstMentionedAt ?? now,
          decayedMentionScore: item.decayedMentionScore,
          decayedUpvoteScore: item.decayedUpvoteScore,
          supportDecayedMentionScore: item.supportDecayedMentionScore,
          supportDecayedUpvoteScore: item.supportDecayedUpvoteScore,
          decayedScoresUpdatedAt: item.decayedScoresUpdatedAt,
        },
        select: { connectionId: true },
      });
      affectedConnectionIds.push(created.connectionId);
    }

    const staleConnectionIds = existingConnections
      .filter(
        (connection) =>
          !retainedKeys.has(`${connection.restaurantId}:${connection.foodId}`),
      )
      .map((connection) => connection.connectionId);

    if (staleConnectionIds.length > 0) {
      await tx.connection.deleteMany({
        where: { connectionId: { in: staleConnectionIds } },
      });
    }

    return Array.from(new Set(affectedConnectionIds));
  }
}
