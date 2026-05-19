import { Injectable, Inject } from '@nestjs/common';
import { EntityType, OnDemandReason, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';

export interface OnDemandRequestInput {
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  entityId?: string | null;
  marketKey?: string | null;
  collectableMarketKeys?: string[];
  metadata?: Record<string, unknown>;
}

export interface OnDemandRequestRecordOptions {
  userId?: string | null;
  seenAt?: Date;
}

@Injectable()
export class OnDemandRequestService {
  private readonly logger: LoggerService;
  private readonly cooldownMs: number;
  private readonly maxEntities: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OnDemandRequestService');
    this.cooldownMs = this.resolveCooldownMs();
    this.maxEntities = this.resolveMaxEntities();
  }

  async recordRequests(
    requests: OnDemandRequestInput[],
    options: OnDemandRequestRecordOptions = {},
    context: Record<string, unknown> = {},
  ): Promise<OnDemandRequestInput[]> {
    const scopedRequests = requests.filter((request) => {
      const marketKey =
        typeof request.marketKey === 'string' ? request.marketKey.trim() : '';
      return marketKey.length > 0;
    });
    const deduped = this.deduplicateRequests(scopedRequests);
    const capped =
      this.maxEntities > 0 ? deduped.slice(0, this.maxEntities) : deduped;
    if (!capped.length) {
      return [];
    }

    const userId = this.normalizeUserId(options.userId);
    const seenAt =
      options.seenAt instanceof Date && !Number.isNaN(options.seenAt.getTime())
        ? options.seenAt
        : new Date();

    const queueCandidates = capped.flatMap((request) =>
      this.expandCollectableQueueTargets(request),
    );
    const queueable =
      this.cooldownMs > 0
        ? await this.filterByCooldown(queueCandidates, seenAt)
        : queueCandidates;
    const queueableKeys = new Set(
      queueable.map((request) => this.composeQueueTargetKey(request)),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const request of capped) {
        const resultRestaurantCount = this.extractInteger(
          context.restaurantCount,
        );
        const resultFoodCount = this.extractInteger(context.foodCount);
        const marketKey = this.normalizeMarketKey(request.marketKey);
        const queueTargets = this.expandCollectableQueueTargets(request);
        const metadata = this.buildMetadata(request.metadata, context);
        let firstRequestId: string | null = null;
        const requestIdByCollectableMarketKey = new Map<string, string>();

        for (const queueTarget of queueTargets) {
          const requestIsQueueable = queueableKeys.has(
            this.composeQueueTargetKey(queueTarget),
          );

          const createData: Prisma.OnDemandRequestCreateInput = {
            term: request.term,
            entityType: request.entityType,
            reason: request.reason,
            marketKey: queueTarget.collectableMarketKey,
            entityIdentityKey: queueTarget.entityIdentityKey,
            lastSeenAt: seenAt,
            lastQueuedAt: requestIsQueueable ? seenAt : undefined,
            metadata,
          };

          if (request.entityId) {
            createData.entity = {
              connect: { entityId: request.entityId },
            };
          }

          if (resultRestaurantCount !== null) {
            createData.resultRestaurantCount = resultRestaurantCount;
          }
          if (resultFoodCount !== null) {
            createData.resultFoodCount = resultFoodCount;
          }

          const updateData: Prisma.OnDemandRequestUpdateInput = {
            lastSeenAt: seenAt,
            marketKey: queueTarget.collectableMarketKey,
            entityIdentityKey: queueTarget.entityIdentityKey,
          };
          if (requestIsQueueable) {
            updateData.lastQueuedAt = seenAt;
          }

          if (metadata) {
            updateData.metadata = metadata;
          }

          if (request.entityId !== undefined) {
            updateData.entity = request.entityId
              ? { connect: { entityId: request.entityId } }
              : { disconnect: true };
          }
          if (resultRestaurantCount !== null) {
            updateData.resultRestaurantCount = resultRestaurantCount;
          }
          if (resultFoodCount !== null) {
            updateData.resultFoodCount = resultFoodCount;
          }

          const record = await tx.onDemandRequest.upsert({
            where: {
              term_entityType_reason_marketKey_entityIdentityKey: {
                term: request.term,
                entityType: request.entityType,
                reason: request.reason,
                marketKey: queueTarget.collectableMarketKey,
                entityIdentityKey: queueTarget.entityIdentityKey,
              },
            },
            create: createData,
            update: updateData,
            select: { requestId: true },
          });

          firstRequestId ??= record.requestId;
          requestIdByCollectableMarketKey.set(
            queueTarget.collectableMarketKey,
            record.requestId,
          );

          if (userId) {
            await tx.onDemandRequestUser.upsert({
              where: {
                requestId_userId: {
                  requestId: record.requestId,
                  userId,
                },
              },
              create: {
                requestId: record.requestId,
                userId,
                firstSeenAt: seenAt,
                lastSeenAt: seenAt,
                askCount: 1,
              },
              update: {
                lastSeenAt: seenAt,
                askCount: { increment: 1 },
              },
            });

            const distinctUserCount = await tx.onDemandRequestUser.count({
              where: { requestId: record.requestId },
            });

            await tx.onDemandRequest.update({
              where: { requestId: record.requestId },
              data: { distinctUserCount },
            });
          }
        }

        const askEventCollectableMarketKeys =
          queueTargets.length > 0
            ? queueTargets.map((target) => target.collectableMarketKey)
            : [null];

        for (const collectableMarketKey of askEventCollectableMarketKeys) {
          await tx.onDemandAskEvent.create({
            data: {
              requestId: collectableMarketKey
                ? (requestIdByCollectableMarketKey.get(collectableMarketKey) ??
                  firstRequestId)
                : firstRequestId,
              userId: userId ?? null,
              term: request.term,
              entityType: request.entityType,
              entityId: request.entityId ?? null,
              reason: request.reason,
              marketKey,
              collectableMarketKey,
              resultRestaurantCount,
              resultFoodCount,
              askedAt: seenAt,
              metadata,
            },
          });
        }
      }
    });

    this.logger.debug('Recorded on-demand requests', {
      requests: capped.map((request) => ({
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
      })),
      queueable: queueable.length,
      userId: userId ?? undefined,
    });

    return capped.filter((request) =>
      this.expandCollectableQueueTargets(request).some((target) =>
        queueableKeys.has(this.composeQueueTargetKey(target)),
      ),
    );
  }

  private deduplicateRequests(
    requests: OnDemandRequestInput[],
  ): OnDemandRequestInput[] {
    const seen = new Set<string>();
    const result: OnDemandRequestInput[] = [];
    for (const request of requests) {
      const sanitizedTerm = this.sanitizeTerm(request.term);
      if (!sanitizedTerm) {
        continue;
      }
      const marketKey = this.normalizeMarketKey(request.marketKey);
      const entityId = this.normalizeEntityId(request.entityId);
      const key = `${request.reason}:${
        request.entityType
      }:${entityId ?? 'no_entity'}:${sanitizedTerm.toLowerCase()}`;
      const scopedKey = `${key}:${marketKey}`;
      if (seen.has(scopedKey)) {
        continue;
      }
      seen.add(scopedKey);
      result.push({
        term: sanitizedTerm,
        entityType: request.entityType,
        reason: request.reason,
        entityId,
        marketKey,
        collectableMarketKeys: this.normalizeCollectableMarketKeys(
          request.collectableMarketKeys,
        ),
        metadata: request.metadata,
      });
    }
    return result;
  }

  private normalizeMarketKey(marketKey?: string | null): string {
    const normalized =
      typeof marketKey === 'string' ? marketKey.trim().toLowerCase() : '';
    return normalized;
  }

  private normalizeUserId(userId?: string | null): string | null {
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized.length ? normalized : null;
  }

  private normalizeEntityId(entityId?: string | null): string | null {
    const normalized = typeof entityId === 'string' ? entityId.trim() : '';
    return normalized.length ? normalized : null;
  }

  private sanitizeTerm(term: string): string {
    const stripped = stripGenericTokens(term);
    return stripped.isGenericOnly ? '' : stripped.text;
  }

  private resolveCooldownMs(): number {
    const raw = process.env.SEARCH_ON_DEMAND_COOLDOWN_MS;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 300_000;
  }

  private resolveMaxEntities(): number {
    const raw = process.env.SEARCH_ON_DEMAND_MAX_ENTITIES;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 5;
  }

  private composeQueueTargetKey(request: {
    term: string;
    entityType: EntityType;
    reason: OnDemandReason;
    collectableMarketKey: string;
    entityIdentityKey: string;
  }): string {
    return `${request.reason}:${
      request.entityType
    }:${request.entityIdentityKey}:${request.term.toLowerCase()}:${
      request.collectableMarketKey
    }`;
  }

  private async filterByCooldown(
    requests: Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      collectableMarketKey: string;
      entityIdentityKey: string;
    }>,
    seenAt: Date,
  ): Promise<
    Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      collectableMarketKey: string;
      entityIdentityKey: string;
    }>
  > {
    if (this.cooldownMs <= 0) {
      return requests;
    }
    if (!requests.length) {
      return [];
    }

    const ors = requests.map((request) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      marketKey: request.collectableMarketKey,
      entityIdentityKey: request.entityIdentityKey,
    }));

    const existing = await this.prisma.onDemandRequest.findMany({
      where: { OR: ors },
      select: {
        term: true,
        entityType: true,
        reason: true,
        marketKey: true,
        entityIdentityKey: true,
        lastQueuedAt: true,
      },
    });

    const cutoffByKey = new Map<string, Date | null>();
    for (const row of existing) {
      cutoffByKey.set(
        `${row.reason}:${row.entityType}:${row.entityIdentityKey}:${row.term.toLowerCase()}:${
          row.marketKey
        }`,
        row.lastQueuedAt,
      );
    }

    const nowMs = seenAt.getTime();
    return requests.filter((request) => {
      const key = this.composeQueueTargetKey(request);
      const lastQueuedAt = cutoffByKey.get(key);
      if (!lastQueuedAt) {
        return true;
      }
      return nowMs - lastQueuedAt.getTime() >= this.cooldownMs;
    });
  }

  private expandCollectableQueueTargets(request: OnDemandRequestInput): Array<{
    term: string;
    entityType: EntityType;
    reason: OnDemandReason;
    collectableMarketKey: string;
    entityIdentityKey: string;
  }> {
    const entityIdentityKey = this.composeEntityIdentityKey(request.entityId);
    return this.normalizeCollectableMarketKeys(
      request.collectableMarketKeys,
    ).map((collectableMarketKey) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      collectableMarketKey,
      entityIdentityKey,
    }));
  }

  private composeEntityIdentityKey(entityId?: string | null): string {
    return this.normalizeEntityId(entityId) ?? 'no_entity';
  }

  private normalizeCollectableMarketKeys(
    marketKeys?: string[] | null,
  ): string[] {
    if (!Array.isArray(marketKeys)) {
      return [];
    }
    return Array.from(
      new Set(
        marketKeys
          .map((marketKey) => this.normalizeMarketKey(marketKey))
          .filter((marketKey) => marketKey.length > 0),
      ),
    );
  }

  private buildMetadata(
    metadata: Record<string, unknown> | undefined,
    context: Record<string, unknown>,
  ): Prisma.JsonObject | undefined {
    const base: Record<string, unknown> = {
      ...(metadata ?? {}),
    };
    if (Object.keys(context).length > 0) {
      base.context = {
        ...(typeof base.context === 'object' && base.context !== null
          ? (base.context as Record<string, unknown>)
          : {}),
        ...context,
      };
    }
    return Object.keys(base).length ? (base as Prisma.JsonObject) : undefined;
  }

  private extractInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
    return null;
  }
}
