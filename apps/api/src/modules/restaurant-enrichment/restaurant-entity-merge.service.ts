import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Prisma, Entity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ProjectionRebuildService } from '../content-processing/reddit-collector/projection-rebuild.service';

type RestaurantEntity = Entity;

@Injectable()
export class RestaurantEntityMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProjectionRebuildService))
    private readonly projectionRebuildService: ProjectionRebuildService,
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
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await this.mergeRestaurantEvents(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.mergeRestaurantEntityEvents(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.rehomeRestaurantEntityReferences(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.mergeConnections(tx, canonical.entityId, duplicate.entityId);
      await this.mergePriorityMetrics(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.mergeMarketPresences(
        tx,
        canonical.entityId,
        duplicate.entityId,
      );
      await this.mergeLocations(tx, canonical.entityId, duplicate.entityId);

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

    const rebuildResult =
      await this.projectionRebuildService.rebuildForRestaurants([
        result.entityId,
      ]);
    await this.projectionRebuildService.refreshQualityScores({
      connectionIds: rebuildResult.connectionIds,
      restaurantIds: [result.entityId],
    });

    return result;
  }

  private async mergeRestaurantEvents(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateEvents = await tx.restaurantEvent.findMany({
      where: { restaurantId: duplicateId },
      select: {
        eventId: true,
        extractionRunId: true,
        mentionKey: true,
        evidenceType: true,
      },
    });

    for (const event of duplicateEvents) {
      const conflicting = await tx.restaurantEvent.findFirst({
        where: {
          extractionRunId: event.extractionRunId,
          mentionKey: event.mentionKey,
          restaurantId: canonicalId,
          evidenceType: event.evidenceType,
        },
        select: { eventId: true },
      });

      if (conflicting) {
        await tx.restaurantEvent.delete({
          where: { eventId: event.eventId },
        });
        continue;
      }

      await tx.restaurantEvent.update({
        where: { eventId: event.eventId },
        data: { restaurantId: canonicalId },
      });
    }
  }

  private async mergeRestaurantEntityEvents(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateEvents = await tx.restaurantEntityEvent.findMany({
      where: { restaurantId: duplicateId },
      select: {
        eventId: true,
        extractionRunId: true,
        mentionKey: true,
        entityId: true,
        evidenceType: true,
      },
    });

    for (const event of duplicateEvents) {
      const conflicting = await tx.restaurantEntityEvent.findFirst({
        where: {
          extractionRunId: event.extractionRunId,
          mentionKey: event.mentionKey,
          restaurantId: canonicalId,
          entityId: event.entityId,
          evidenceType: event.evidenceType,
        },
        select: { eventId: true },
      });

      if (conflicting) {
        await tx.restaurantEntityEvent.delete({
          where: { eventId: event.eventId },
        });
        continue;
      }

      await tx.restaurantEntityEvent.update({
        where: { eventId: event.eventId },
        data: { restaurantId: canonicalId },
      });
    }
  }

  private async rehomeRestaurantEntityReferences(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await this.rehomeSearchLogs(tx, canonicalId, duplicateId);
    await this.rehomeRestaurantViews(tx, canonicalId, duplicateId);
    await this.rehomeUserFavorites(tx, canonicalId, duplicateId);
    await this.rehomeFavoriteListRestaurantItems(tx, canonicalId, duplicateId);
    await this.rehomePollOptionRestaurantReferences(
      tx,
      canonicalId,
      duplicateId,
    );
    await this.rehomePollTopicRestaurantTargets(tx, canonicalId, duplicateId);
    await this.rehomeOnDemandRequestEntities(tx, canonicalId, duplicateId);
  }

  private async rehomeSearchLogs(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateLogs = await tx.searchLog.findMany({
      where: { entityId: duplicateId },
      select: {
        logId: true,
        searchRequestId: true,
        loggedAt: true,
        totalResults: true,
        totalFoodResults: true,
        totalRestaurantResults: true,
        queryExecutionTimeMs: true,
        marketStatus: true,
        metadata: true,
      },
    });

    for (const log of duplicateLogs) {
      const conflicting = log.searchRequestId
        ? await tx.searchLog.findFirst({
            where: {
              searchRequestId: log.searchRequestId,
              entityId: canonicalId,
              logId: { not: log.logId },
            },
            select: {
              logId: true,
              loggedAt: true,
              totalResults: true,
              totalFoodResults: true,
              totalRestaurantResults: true,
              queryExecutionTimeMs: true,
              marketStatus: true,
            },
          })
        : null;

      if (!conflicting) {
        await tx.searchLog.update({
          where: { logId: log.logId },
          data: { entityId: canonicalId },
        });
        continue;
      }

      await tx.searchLog.update({
        where: { logId: conflicting.logId },
        data: {
          loggedAt:
            this.maxDate(conflicting.loggedAt, log.loggedAt) ??
            conflicting.loggedAt,
          totalResults: Math.max(
            conflicting.totalResults ?? 0,
            log.totalResults ?? 0,
          ),
          totalFoodResults: Math.max(
            conflicting.totalFoodResults ?? 0,
            log.totalFoodResults ?? 0,
          ),
          totalRestaurantResults: Math.max(
            conflicting.totalRestaurantResults ?? 0,
            log.totalRestaurantResults ?? 0,
          ),
          queryExecutionTimeMs: this.minNumber(
            conflicting.queryExecutionTimeMs,
            log.queryExecutionTimeMs,
          ),
          marketStatus: conflicting.marketStatus ?? log.marketStatus,
        },
      });

      await tx.searchLog.delete({
        where: { logId: log.logId },
      });
    }
  }

  private async rehomeRestaurantViews(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateViews = await tx.restaurantView.findMany({
      where: { restaurantId: duplicateId },
      select: {
        userId: true,
        restaurantId: true,
        viewCount: true,
        lastViewedAt: true,
      },
    });

    for (const view of duplicateViews) {
      const conflicting = await tx.restaurantView.findUnique({
        where: {
          userId_restaurantId: {
            userId: view.userId,
            restaurantId: canonicalId,
          },
        },
        select: {
          userId: true,
          restaurantId: true,
          viewCount: true,
          lastViewedAt: true,
        },
      });

      if (!conflicting) {
        await tx.restaurantView.update({
          where: {
            userId_restaurantId: {
              userId: view.userId,
              restaurantId: view.restaurantId,
            },
          },
          data: { restaurantId: canonicalId },
        });
        continue;
      }

      await tx.restaurantView.update({
        where: {
          userId_restaurantId: {
            userId: conflicting.userId,
            restaurantId: conflicting.restaurantId,
          },
        },
        data: {
          viewCount: conflicting.viewCount + view.viewCount,
          lastViewedAt:
            this.maxDate(conflicting.lastViewedAt, view.lastViewedAt) ??
            conflicting.lastViewedAt,
        },
      });

      await tx.restaurantView.delete({
        where: {
          userId_restaurantId: {
            userId: view.userId,
            restaurantId: view.restaurantId,
          },
        },
      });
    }
  }

  private async rehomeUserFavorites(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateFavorites = await tx.userFavorite.findMany({
      where: { entityId: duplicateId },
      select: { favoriteId: true, userId: true },
    });

    for (const favorite of duplicateFavorites) {
      const conflicting = await tx.userFavorite.findFirst({
        where: {
          userId: favorite.userId,
          entityId: canonicalId,
          favoriteId: { not: favorite.favoriteId },
        },
        select: { favoriteId: true },
      });

      if (conflicting) {
        await tx.userFavorite.delete({
          where: { favoriteId: favorite.favoriteId },
        });
        continue;
      }

      await tx.userFavorite.update({
        where: { favoriteId: favorite.favoriteId },
        data: { entityId: canonicalId },
      });
    }
  }

  private async rehomeFavoriteListRestaurantItems(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const sourceItems = await tx.favoriteListItem.findMany({
      where: { restaurantId: duplicateId },
      select: { itemId: true, listId: true },
    });

    for (const item of sourceItems) {
      const conflicting = await tx.favoriteListItem.findFirst({
        where: {
          listId: item.listId,
          restaurantId: canonicalId,
          itemId: { not: item.itemId },
        },
        select: { itemId: true },
      });

      if (conflicting) {
        await tx.favoriteListItem.delete({
          where: { itemId: item.itemId },
        });
        continue;
      }

      await tx.favoriteListItem.update({
        where: { itemId: item.itemId },
        data: { restaurantId: canonicalId },
      });
    }
  }

  private async rehomePollOptionRestaurantReferences(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.pollOption.updateMany({
      where: { restaurantId: duplicateId },
      data: { restaurantId: canonicalId },
    });

    await tx.pollOption.updateMany({
      where: { entityId: duplicateId },
      data: { entityId: canonicalId },
    });
  }

  private async rehomePollTopicRestaurantTargets(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.pollTopic.updateMany({
      where: { targetRestaurantId: duplicateId },
      data: { targetRestaurantId: canonicalId },
    });
  }

  private async rehomeOnDemandRequestEntities(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.onDemandRequest.updateMany({
      where: { entityId: duplicateId },
      data: { entityId: canonicalId },
    });
  }

  private async mergeMarketPresences(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicatePresences = await tx.entityMarketPresence.findMany({
      where: { entityId: duplicateId },
      select: { marketKey: true },
    });

    if (!duplicatePresences.length) {
      return;
    }

    const canonicalPresences = new Set(
      (
        await tx.entityMarketPresence.findMany({
          where: { entityId: canonicalId },
          select: { marketKey: true },
        })
      ).map((row) => row.marketKey.trim().toLowerCase()),
    );

    for (const presence of duplicatePresences) {
      const normalizedKey = presence.marketKey.trim().toLowerCase();
      if (!normalizedKey || canonicalPresences.has(normalizedKey)) {
        continue;
      }

      await tx.entityMarketPresence.create({
        data: {
          entityId: canonicalId,
          marketKey: normalizedKey,
        },
      });
      canonicalPresences.add(normalizedKey);
    }
  }

  private async mergeLocations(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateLocations = await tx.restaurantLocation.findMany({
      where: { restaurantId: duplicateId },
    });

    if (!duplicateLocations.length) {
      return;
    }

    const canonicalLocations = await tx.restaurantLocation.findMany({
      where: { restaurantId: canonicalId },
    });
    const canonicalByPlaceId = new Map(
      canonicalLocations
        .filter((loc) => loc.googlePlaceId)
        .map((loc) => [loc.googlePlaceId as string, loc]),
    );

    for (const location of duplicateLocations) {
      if (
        location.googlePlaceId &&
        canonicalByPlaceId.has(location.googlePlaceId)
      ) {
        // Drop duplicate location row; prefer canonical's
        await tx.restaurantLocation.delete({
          where: { locationId: location.locationId },
        });
        continue;
      }

      await tx.restaurantLocation.update({
        where: { locationId: location.locationId },
        data: {
          restaurantId: canonicalId,
          isPrimary: location.isPrimary || canonicalLocations.length === 0,
          updatedAt: new Date(),
        },
      });
    }

    // Ensure canonical has a primary location
    let primary = await tx.restaurantLocation.findFirst({
      where: { restaurantId: canonicalId, isPrimary: true },
    });

    if (!primary) {
      const firstLocation = await tx.restaurantLocation.findFirst({
        where: { restaurantId: canonicalId },
        orderBy: { updatedAt: 'desc' },
      });
      if (firstLocation) {
        await tx.restaurantLocation.update({
          where: { locationId: firstLocation.locationId },
          data: { isPrimary: true },
        });
        primary = firstLocation;
      }
    }

    if (primary) {
      await tx.entity.update({
        where: { entityId: canonicalId },
        data: {
          primaryLocation: { connect: { locationId: primary.locationId } },
        },
      });
    }
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
        select: {
          connectionId: true,
          foodId: true,
        },
      });

      if (conflicting) {
        await this.rehomeConnectionReferences(
          tx,
          connection.connectionId,
          conflicting.connectionId,
          conflicting.foodId,
        );
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

  private async rehomeConnectionReferences(
    tx: Prisma.TransactionClient,
    sourceConnectionId: string,
    targetConnectionId: string,
    targetFoodId: string,
  ): Promise<void> {
    await this.rehomePollOptionConnections(
      tx,
      sourceConnectionId,
      targetConnectionId,
    );
    await this.rehomeFavoriteListItemConnections(
      tx,
      sourceConnectionId,
      targetConnectionId,
    );
    await this.rehomeFoodViews(
      tx,
      sourceConnectionId,
      targetConnectionId,
      targetFoodId,
    );
  }

  private async rehomePollOptionConnections(
    tx: Prisma.TransactionClient,
    sourceConnectionId: string,
    targetConnectionId: string,
  ): Promise<void> {
    await tx.pollOption.updateMany({
      where: { connectionId: sourceConnectionId },
      data: { connectionId: targetConnectionId },
    });
  }

  private async rehomeFavoriteListItemConnections(
    tx: Prisma.TransactionClient,
    sourceConnectionId: string,
    targetConnectionId: string,
  ): Promise<void> {
    const sourceItems = await tx.favoriteListItem.findMany({
      where: { connectionId: sourceConnectionId },
      select: {
        itemId: true,
        listId: true,
      },
    });

    for (const item of sourceItems) {
      const conflicting = await tx.favoriteListItem.findFirst({
        where: {
          listId: item.listId,
          connectionId: targetConnectionId,
          itemId: { not: item.itemId },
        },
        select: { itemId: true },
      });

      if (conflicting) {
        await tx.favoriteListItem.delete({
          where: { itemId: item.itemId },
        });
        continue;
      }

      await tx.favoriteListItem.update({
        where: { itemId: item.itemId },
        data: { connectionId: targetConnectionId },
      });
    }
  }

  private async rehomeFoodViews(
    tx: Prisma.TransactionClient,
    sourceConnectionId: string,
    targetConnectionId: string,
    targetFoodId: string,
  ): Promise<void> {
    const sourceViews = await tx.foodView.findMany({
      where: { connectionId: sourceConnectionId },
      select: {
        userId: true,
        connectionId: true,
        viewCount: true,
        lastViewedAt: true,
      },
    });

    for (const view of sourceViews) {
      const conflicting = await tx.foodView.findUnique({
        where: {
          userId_connectionId: {
            userId: view.userId,
            connectionId: targetConnectionId,
          },
        },
        select: {
          userId: true,
          connectionId: true,
          viewCount: true,
          lastViewedAt: true,
        },
      });

      if (conflicting) {
        await tx.foodView.update({
          where: {
            userId_connectionId: {
              userId: conflicting.userId,
              connectionId: conflicting.connectionId,
            },
          },
          data: {
            viewCount: conflicting.viewCount + view.viewCount,
            lastViewedAt:
              this.maxDate(conflicting.lastViewedAt, view.lastViewedAt) ??
              conflicting.lastViewedAt,
            foodId: targetFoodId,
          },
        });

        await tx.foodView.delete({
          where: {
            userId_connectionId: {
              userId: view.userId,
              connectionId: view.connectionId,
            },
          },
        });
        continue;
      }

      await tx.foodView.update({
        where: {
          userId_connectionId: {
            userId: view.userId,
            connectionId: view.connectionId,
          },
        },
        data: {
          connectionId: targetConnectionId,
          foodId: targetFoodId,
        },
      });
    }
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
          queryImpressions: Math.max(
            canonicalPriority.queryImpressions,
            duplicatePriority.queryImpressions,
          ),
          viewImpressions: Math.max(
            canonicalPriority.viewImpressions,
            duplicatePriority.viewImpressions,
          ),
          favoriteCount: Math.max(
            canonicalPriority.favoriteCount,
            duplicatePriority.favoriteCount,
          ),
          autocompleteSelections: Math.max(
            canonicalPriority.autocompleteSelections,
            duplicatePriority.autocompleteSelections,
          ),
          lastCalculatedAt: this.maxDate(
            canonicalPriority.lastCalculatedAt,
            duplicatePriority.lastCalculatedAt,
          ),
          lastQueryAt: this.maxDate(
            canonicalPriority.lastQueryAt,
            duplicatePriority.lastQueryAt,
          ),
          lastViewAt: this.maxDate(
            canonicalPriority.lastViewAt,
            duplicatePriority.lastViewAt,
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

  private maxDate(
    a: Date | null | undefined,
    b: Date | null | undefined,
  ): Date | undefined {
    if (a && b) {
      return a.getTime() >= b.getTime() ? a : b;
    }
    return a ?? b ?? undefined;
  }

  private minNumber(
    a: number | null | undefined,
    b: number | null | undefined,
  ): number | undefined {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.min(a, b);
    }
    return a ?? b ?? undefined;
  }
}
