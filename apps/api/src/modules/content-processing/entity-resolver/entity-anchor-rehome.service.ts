import { Injectable, Inject } from '@nestjs/common';
import { DemandSubjectKind, Prisma } from '@prisma/client';
import { LoggerService } from '../../../shared';

/**
 * USER-ANCHOR REHOMING, shared by BOTH merge services (restaurant +
 * food dedupe). One law, one implementation: when a duplicate entity (or
 * connection) is merged into a canonical survivor, every table a USER'S
 * data points at is hard-rekeyed to the survivor inside the merge
 * transaction — user links must never be left on an archived loser or,
 * worse, cascade-deleted with a folded connection.
 *
 * Found the hard way (red team 2026-07-31): the food merge repointed only
 * user_list_items; poll dish/attribute targets, curated list items,
 * photos, and on-demand requests were left behind — and because
 * curated_list_items.connection_id and photos.connection_id are
 * onDelete: Cascade, folding a duplicate connection could silently DELETE
 * a user's photo or curated pick. The restaurant merge had the same photo
 * and curated-list holes.
 *
 * The signals/event LEDGERS are deliberately NOT rekeyed — readers resolve
 * loser ids through entity_redirects at read (that design is the merge
 * services' own; this service only owns the hard-rekeyed user tables).
 */
@Injectable()
export class EntityAnchorRehomeService {
  private readonly logger: LoggerService;

  constructor(@Inject(LoggerService) loggerService: LoggerService) {
    this.logger = loggerService.setContext('EntityAnchorRehomeService');
  }

  /** Every entity-keyed user anchor. Column writes that cannot match the
   *  duplicate's type (e.g. targetRestaurantId for a food merge) are
   *  no-op updateManys — generic on purpose, so neither merge can forget
   *  a table the other one remembered. */
  async rehomeEntityAnchors(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.pollTopic.updateMany({
      where: { targetRestaurantId: duplicateId },
      data: { targetRestaurantId: canonicalId },
    });
    await tx.pollTopic.updateMany({
      where: { targetDishId: duplicateId },
      data: { targetDishId: canonicalId },
    });
    await tx.pollTopic.updateMany({
      where: { targetFoodAttributeId: duplicateId },
      data: { targetFoodAttributeId: canonicalId },
    });
    await tx.pollTopic.updateMany({
      where: { targetRestaurantAttributeId: duplicateId },
      data: { targetRestaurantAttributeId: canonicalId },
    });
    // topic id ARRAYS (category seeds / ballot seeds) carry entity ids too
    await tx.$executeRaw`
      UPDATE poll_topics
      SET category_entity_ids =
            array_replace(category_entity_ids, ${duplicateId}::uuid, ${canonicalId}::uuid)
      WHERE ${duplicateId}::uuid = ANY(category_entity_ids)`;
    await tx.$executeRaw`
      UPDATE poll_topics
      SET seed_entity_ids =
            array_replace(seed_entity_ids, ${duplicateId}::uuid, ${canonicalId}::uuid)
      WHERE ${duplicateId}::uuid = ANY(seed_entity_ids)`;

    // curated_list_items PK is (listId, rank) — no unique on the entity
    // columns, so blunt repoints are safe
    await tx.curatedListItem.updateMany({
      where: { entityId: duplicateId },
      data: { entityId: canonicalId },
    });
    await tx.curatedListItem.updateMany({
      where: { restaurantId: duplicateId },
      data: { restaurantId: canonicalId },
    });

    await tx.photo.updateMany({
      where: { restaurantId: duplicateId },
      data: { restaurantId: canonicalId },
    });

    await this.rehomeOnDemandRequests(tx, canonicalId, duplicateId);
    await this.rehomeDemandScoringCandidates(tx, canonicalId, duplicateId);
  }

  /** Connection-keyed user anchors, called BEFORE a folded duplicate
   *  connection row is deleted (curated items and photos cascade on
   *  connection delete — repoint-before-delete is the whole point). */
  async rehomeConnectionAnchors(
    tx: Prisma.TransactionClient,
    canonicalConnectionId: string,
    duplicateConnectionId: string,
  ): Promise<void> {
    await tx.curatedListItem.updateMany({
      where: { connectionId: duplicateConnectionId },
      data: { connectionId: canonicalConnectionId },
    });
    await tx.photo.updateMany({
      where: { connectionId: duplicateConnectionId },
      data: { connectionId: canonicalConnectionId },
    });
  }

  private async rehomeOnDemandRequests(
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
      const subjectKey =
        candidate.subjectKind === DemandSubjectKind.entity
          ? canonicalId
          : candidate.subjectKey;
      const canonicalCandidate = await tx.demandScoringCandidate.findFirst({
        where: {
          runId: candidate.runId,
          consumerKind: candidate.consumerKind,
          candidateKind: candidate.candidateKind,
          subjectKind: candidate.subjectKind,
          subjectKey,
          entityId: canonicalId,
          entityType: candidate.entityType,
          engineName: candidate.engineName,
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

  private minDate(a: Date | null, b: Date | null): Date | null {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  private maxDate(a: Date | null, b: Date | null): Date | null {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }
}
