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

    await this.rehomePollEndorsements(tx, canonicalId, duplicateId);
    await this.rehomeCommentEntitySpans(tx, canonicalId, duplicateId);
    await this.rehomeOnDemandRequests(tx, canonicalId, duplicateId);
    await this.rehomeDemandScoringCandidates(tx, canonicalId, duplicateId);
  }

  /** Red team 2026-08-01 (R2): poll_endorsements.subject_id is a bare
   *  string (no FK) in THREE shapes — a raw entity uuid (restaurant axis)
   *  and either half of the "restaurantId::foodId" dish composite. A merge
   *  that leaves any shape behind silently stops counting the user's vote.
   *  Where rekeying would collide with an existing endorsement by the same
   *  user in the same poll (PK pollId+subjectType+subjectId+userId), the
   *  duplicate-keyed row is dropped — the user's voice already counts on
   *  the survivor. */
  private async rehomePollEndorsements(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    // `toForExists` MUST qualify the surviving half with the OUTER row (e).
    // Final red team F1: an unqualified split_part(subject_id, …) inside the
    // EXISTS binds to `k`, the subquery's own relation — so the guard
    // compared k's half against itself (always true) instead of comparing
    // the outer row's other half. A user holding canonicalR::dishA and
    // dupR::dishB in one poll had the dishB vote DELETED instead of
    // converted, inside the merge transaction, with no error.
    const shapes: Array<{
      from: Prisma.Sql;
      to: Prisma.Sql;
      toForExists: Prisma.Sql;
    }> = [
      {
        from: Prisma.sql`${duplicateId}`,
        to: Prisma.sql`${canonicalId}`,
        toForExists: Prisma.sql`${canonicalId}`,
      },
      {
        from: Prisma.sql`${duplicateId} || '::' || split_part(subject_id, '::', 2)`,
        to: Prisma.sql`${canonicalId} || '::' || split_part(subject_id, '::', 2)`,
        toForExists: Prisma.sql`${canonicalId} || '::' || split_part(e.subject_id, '::', 2)`,
      },
      {
        from: Prisma.sql`split_part(subject_id, '::', 1) || '::' || ${duplicateId}`,
        to: Prisma.sql`split_part(subject_id, '::', 1) || '::' || ${canonicalId}`,
        toForExists: Prisma.sql`split_part(e.subject_id, '::', 1) || '::' || ${canonicalId}`,
      },
    ];
    for (const shape of shapes) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM poll_endorsements e
        WHERE e.subject_id = ${shape.from}
          AND EXISTS (
            SELECT 1 FROM poll_endorsements k
            WHERE k.poll_id = e.poll_id
              AND k.subject_type = e.subject_type
              AND k.user_id = e.user_id
              AND k.subject_id = ${shape.toForExists}
          )`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE poll_endorsements
        SET subject_id = ${shape.to}
        WHERE subject_id = ${shape.from}`);
    }
  }

  /** Red team 2026-08-01 (R2): poll_comments.entity_spans is a JSONB array
   *  of {entityId,...} objects with no FK. Rewrite the loser id in place so
   *  span taps keep resolving. Name/text inside the span stays as written —
   *  it is the user's comment text, not derived display. */
  private async rehomeCommentEntitySpans(
    tx: Prisma.TransactionClient,
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE poll_comments
      SET entity_spans = (
        SELECT jsonb_agg(
          CASE WHEN span->>'entityId' = ${duplicateId}
               THEN jsonb_set(span, '{entityId}', to_jsonb(${canonicalId}::text))
               ELSE span END
          ORDER BY ord
        )
        FROM jsonb_array_elements(entity_spans) WITH ORDINALITY AS s(span, ord)
      )
      WHERE entity_spans @> ${JSON.stringify([{ entityId: duplicateId }])}::jsonb`);
  }

  /** ONE conflict-aware rekey for user_list_items, shared by both merges
   *  (red team 2026-08-01 R3: the food merge's blunt updateMany aborted the
   *  whole merge on the (listId, connectionId) unique when a user had both
   *  dishes in one list; the restaurant merge handled the conflict but
   *  resolved it by DELETING the losing row, discarding the user's note).
   *  Policy: repoint when free; on conflict, fold the losing row into the
   *  survivor — keep the user's note if the survivor has none, keep the
   *  earlier position — then delete the fold source. The user's authored
   *  content survives every merge. */
  async rehomeUserListItems(
    tx: Prisma.TransactionClient,
    key: 'restaurantId' | 'connectionId',
    canonicalId: string,
    duplicateId: string,
  ): Promise<void> {
    const sourceItems = await tx.userListItem.findMany({
      where: { [key]: duplicateId },
      select: { itemId: true, listId: true, note: true, position: true },
    });

    for (const item of sourceItems) {
      const conflicting = await tx.userListItem.findFirst({
        where: {
          listId: item.listId,
          [key]: canonicalId,
          itemId: { not: item.itemId },
        },
        select: { itemId: true, note: true, position: true },
      });

      if (conflicting) {
        const fold: { note?: string; position?: number } = {};
        if (item.note && !conflicting.note) fold.note = item.note;
        if (item.position < conflicting.position) fold.position = item.position;
        if (Object.keys(fold).length > 0) {
          await tx.userListItem.update({
            where: { itemId: conflicting.itemId },
            data: fold,
          });
        }
        await tx.userListItem.delete({ where: { itemId: item.itemId } });
        continue;
      }

      await tx.userListItem.update({
        where: { itemId: item.itemId },
        data: { [key]: canonicalId },
      });
    }
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
