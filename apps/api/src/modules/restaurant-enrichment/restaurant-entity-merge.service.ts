import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { DemandSubjectKind, Prisma, Entity } from '@prisma/client';
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

      // ARCHIVE, never delete (audit §1: entity rows are FK-load-bearing —
      // an in-flight extraction holding this id writes events AFTER the merge
      // and a hard delete turns that into an FK crash, the exact class that
      // wedged the stage-2 load). Bank the duplicate's name as an alias on
      // the canonical so future mentions forward via the alias tier
      // (resolution excludes archived rows from matching).
      await tx.$executeRaw`
        UPDATE core_entities y
        SET aliases = (
          SELECT array_agg(DISTINCT a)
          FROM unnest(y.aliases || ARRAY[x.name] || x.aliases) a
        )
        FROM core_entities x
        WHERE y.entity_id = ${canonical.entityId}::uuid
          AND x.entity_id = ${duplicate.entityId}::uuid`;
      await tx.entity.update({
        where: { entityId: duplicate.entityId },
        data: { status: 'archived' },
      });

      // Identity is a judgment (§3, red-team 2b): merges WRITE redirects; the
      // signals ledger is never rekeyed — readers resolve duplicate
      // subjectIds to the canonical at read. Chains are flattened so the
      // readers' one-hop COALESCE stays complete (A→B then B→C rewrites
      // A→C), and any stale redirect FROM the live canonical is dropped.
      await tx.entityRedirect.updateMany({
        where: { toEntityId: duplicate.entityId },
        data: { toEntityId: canonical.entityId },
      });
      await tx.entityRedirect.deleteMany({
        where: { fromEntityId: canonical.entityId },
      });
      await tx.entityRedirect.upsert({
        where: { fromEntityId: duplicate.entityId },
        update: { toEntityId: canonical.entityId },
        create: {
          fromEntityId: duplicate.entityId,
          toEntityId: canonical.entityId,
        },
      });

      return updatedCanonical;
    });

    this.logger.info('Restaurant entity merge completed', {
      canonicalId: result.entityId,
    });

    await this.projectionRebuildService.rebuildForRestaurants([
      result.entityId,
    ]);

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
    // Phase C: the dead event tables (search_event_entities,
    // user_restaurant_views, user_entity_view_events, user_search_demand_daily,
    // collection_on_demand_ask_events) need NO rekey — user-act history lives
    // in the immutable signals ledger, resolved through entity_redirects at
    // read (the redirect row is written by the merge flow itself).
    await this.rehomeUserFavorites(tx, canonicalId, duplicateId);
    await this.rehomeUserFavoriteEvents(tx, canonicalId, duplicateId);
    await this.rehomeFavoriteListRestaurantItems(tx, canonicalId, duplicateId);
    await this.rehomePollTopicRestaurantTargets(tx, canonicalId, duplicateId);
    await this.rehomeOnDemandRequestEntities(tx, canonicalId, duplicateId);
    await this.rehomeDemandScoringCandidates(tx, canonicalId, duplicateId);
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

  private async rehomeUserFavoriteEvents(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.userFavoriteEvent.updateMany({
      where: { entityId: duplicateId },
      data: { entityId: canonicalId },
    });
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
    const duplicateRequests = await tx.onDemandRequest.findMany({
      where: {
        OR: [{ entityId: duplicateId }, { entityIdentityKey: duplicateId }],
      },
      select: {
        requestId: true,
        term: true,
        entityType: true,
        reason: true,
        engineId: true,
        lastSeenAt: true,
        lastQueuedAt: true,
        resultRestaurantCount: true,
        resultFoodCount: true,
      },
    });

    const touchedRequestIds = new Set<string>();

    for (const request of duplicateRequests) {
      const canonicalRequest = await tx.onDemandRequest.findFirst({
        where: {
          requestId: { not: request.requestId },
          term: request.term,
          entityType: request.entityType,
          reason: request.reason,
          engineId: request.engineId,
          entityIdentityKey: canonicalId,
        },
        select: {
          requestId: true,
          lastSeenAt: true,
          lastQueuedAt: true,
          resultRestaurantCount: true,
          resultFoodCount: true,
        },
      });

      if (canonicalRequest) {
        const users = await tx.onDemandRequestUser.findMany({
          where: { requestId: request.requestId },
        });

        for (const user of users) {
          const existingUser = await tx.onDemandRequestUser.findUnique({
            where: {
              requestId_userId: {
                requestId: canonicalRequest.requestId,
                userId: user.userId,
              },
            },
          });

          if (existingUser) {
            await tx.onDemandRequestUser.update({
              where: {
                requestId_userId: {
                  requestId: canonicalRequest.requestId,
                  userId: user.userId,
                },
              },
              data: {
                askCount: existingUser.askCount + user.askCount,
                firstSeenAt:
                  this.minDate(existingUser.firstSeenAt, user.firstSeenAt) ??
                  existingUser.firstSeenAt,
                lastSeenAt:
                  this.maxDate(existingUser.lastSeenAt, user.lastSeenAt) ??
                  existingUser.lastSeenAt,
              },
            });
            continue;
          }

          await tx.onDemandRequestUser.create({
            data: {
              requestId: canonicalRequest.requestId,
              userId: user.userId,
              firstSeenAt: user.firstSeenAt,
              lastSeenAt: user.lastSeenAt,
              askCount: user.askCount,
            },
          });
        }

        await tx.onDemandRequest.update({
          where: { requestId: canonicalRequest.requestId },
          data: {
            lastSeenAt:
              this.maxDate(canonicalRequest.lastSeenAt, request.lastSeenAt) ??
              canonicalRequest.lastSeenAt,
            lastQueuedAt:
              this.maxDate(
                canonicalRequest.lastQueuedAt,
                request.lastQueuedAt,
              ) ?? canonicalRequest.lastQueuedAt,
            resultRestaurantCount: Math.max(
              canonicalRequest.resultRestaurantCount,
              request.resultRestaurantCount,
            ),
            resultFoodCount: Math.max(
              canonicalRequest.resultFoodCount,
              request.resultFoodCount,
            ),
          },
        });

        await tx.onDemandRequest.delete({
          where: { requestId: request.requestId },
        });
        touchedRequestIds.add(canonicalRequest.requestId);
        continue;
      }

      await tx.onDemandRequest.update({
        where: { requestId: request.requestId },
        data: {
          entityId: canonicalId,
          entityIdentityKey: canonicalId,
        },
      });
      touchedRequestIds.add(request.requestId);
    }

    for (const requestId of touchedRequestIds) {
      const distinctUserCount = await tx.onDemandRequestUser.count({
        where: { requestId },
      });
      await tx.onDemandRequest.update({
        where: { requestId },
        data: { distinctUserCount },
      });
    }
  }

  private async rehomeDemandScoringCandidates(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const duplicateCandidates = await tx.demandScoringCandidate.findMany({
      where: { entityId: duplicateId },
    });

    for (const candidate of duplicateCandidates) {
      const subjectKey = this.rehomeSubjectKey({
        subjectKind: candidate.subjectKind,
        subjectKey: candidate.subjectKey,
        canonicalId,
      });
      const canonicalCandidate = await tx.demandScoringCandidate.findFirst({
        where: {
          runId: candidate.runId,
          consumerKind: candidate.consumerKind,
          candidateKind: candidate.candidateKind,
          subjectKind: candidate.subjectKind,
          subjectKey,
          entityId: canonicalId,
          entityType: candidate.entityType,
          marketKey: candidate.marketKey,
          collectableMarketKey: candidate.collectableMarketKey,
          bucket: candidate.bucket,
          lane: candidate.lane,
          reason: candidate.reason,
        },
      });

      if (canonicalCandidate) {
        await tx.demandScoringCandidate.delete({
          where: { candidateId: candidate.candidateId },
        });
        continue;
      }

      await tx.demandScoringCandidate.update({
        where: { candidateId: candidate.candidateId },
        data: {
          entityId: canonicalId,
          subjectKey,
        },
      });
    }
  }

  private rehomeSubjectKey(params: {
    subjectKind: DemandSubjectKind;
    subjectKey: string;
    canonicalId: string;
  }): string {
    return params.subjectKind === DemandSubjectKind.entity
      ? params.canonicalId
      : params.subjectKey;
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
  ): Promise<void> {
    // Phase C: view history lives in the signals ledger; the recently-viewed
    // reader resolves dead connections to the survivor via entity_redirects +
    // (food, restaurant) at read (SignalDemandReadService.recentlyViewedFoods)
    // — no per-merge rekey of view rows exists anymore.
    await this.rehomeFavoriteListItemConnections(
      tx,
      sourceConnectionId,
      targetConnectionId,
    );
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

  private minDate(
    a: Date | null | undefined,
    b: Date | null | undefined,
  ): Date | undefined {
    if (a && b) {
      return a.getTime() <= b.getTime() ? a : b;
    }
    return a ?? b ?? undefined;
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
