import { Injectable, Inject } from '@nestjs/common';
import { EntityType, OnDemandReason, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';
import { SignalsService } from '../signals/signals.service';

export interface OnDemandRequestInput {
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  entityId?: string | null;
  /** ENGINE re-key (§10/§11): the engines whose territory covers the ask's
   *  viewport. Queue rows are minted per engine; an ask with NO covering
   *  engine mints no queue row but STILL records its on_demand_ask signal —
   *  that is the uncovered-ask lane the ledger's territory read serves. */
  engineIds?: string[];
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
    private readonly signals: SignalsService,
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
    const deduped = this.deduplicateRequests(requests);
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

    // One search request can signal on-demand from TWO sites (interpretation-time
    // 'unresolved' + search-time 'low_result'); the shared searchRequestId dedupes
    // ask events across them (the request row itself is idempotent by identity).
    const searchRequestId =
      typeof context.searchRequestId === 'string' && context.searchRequestId
        ? context.searchRequestId
        : null;

    await this.prisma.$transaction(async (tx) => {
      for (const request of capped) {
        const resultRestaurantCount = this.extractInteger(
          context.restaurantCount,
        );
        const resultFoodCount = this.extractInteger(context.foodCount);
        const queueTargets = this.expandCollectableQueueTargets(request);
        const metadata = this.buildMetadata(request.metadata, context);

        for (const queueTarget of queueTargets) {
          const requestIsQueueable = queueableKeys.has(
            this.composeQueueTargetKey(queueTarget),
          );

          const createData: Prisma.OnDemandRequestCreateInput = {
            term: request.term,
            entityType: request.entityType,
            reason: request.reason,
            engineId: queueTarget.engineId,
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
            engineId: queueTarget.engineId,
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

          // Demand identity excludes `reason` — the same demand arriving as
          // 'unresolved' and later 'low_result' is ONE row; reason is a
          // last-writer-wins attribute on it.
          updateData.reason = request.reason;
          const record = await tx.onDemandRequest.upsert({
            where: {
              term_entityType_engineId_entityIdentityKey: {
                term: request.term,
                entityType: request.entityType,
                engineId: queueTarget.engineId,
                entityIdentityKey: queueTarget.entityIdentityKey,
              },
            },
            create: createData,
            update: updateData,
            select: { requestId: true },
          });

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

        // Phase C: the gap record IS a signal (kind = 'on_demand_ask',
        // replacing collection_on_demand_ask_events). Subject carries the
        // asked term (+ resolved entity for low-result asks); geo is the
        // searcher's viewport bounds — the same bbox as the search act, so
        // the §11 unmet family reads asks by TERRITORY, not engine name.
        // Fire-and-forget by law; the two ask sites of one search share
        // meta.askSearchRequestId and are deduped AT READ (deliberately NOT
        // meta.searchRequestId — that key is the ledger-wide act-dedupe key
        // and would collapse the ask into its originating search act).
        this.signals.record({
          kind: 'on_demand_ask',
          userId,
          subject: {
            entityId: request.entityId ?? null,
            term: request.term,
          },
          geo: this.signals.bboxFromBounds(
            this.extractBounds(context.bounds) ?? null,
          ),
          occurredAt: seenAt,
          meta: {
            askSearchRequestId: searchRequestId ?? undefined,
            reason: request.reason,
            entityType: request.entityType,
            resultRestaurantCount: resultRestaurantCount ?? undefined,
            resultFoodCount: resultFoodCount ?? undefined,
            source:
              typeof context.source === 'string' ? context.source : undefined,
          },
        });
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
      const entityId = this.normalizeEntityId(request.entityId);
      const key = `${request.reason}:${
        request.entityType
      }:${entityId ?? 'no_entity'}:${sanitizedTerm.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        term: sanitizedTerm,
        entityType: request.entityType,
        reason: request.reason,
        entityId,
        engineIds: this.normalizeEngineIds(request.engineIds),
        metadata: request.metadata,
      });
    }
    return result;
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

  // §16 K1 (owner sentences; 2026-07-11 fold-in from env): "the same
  // target/bounds may re-trigger at most every 5 minutes" (a per-ask
  // debounce — the collection it queues takes minutes to land, so faster
  // re-asks can only duplicate work), and "one ask queues at most 5
  // entities" (the ask's blast-radius sentence). Both falsifiable product
  // sentences; what changes them: owner re-ratify, never tuning.
  private resolveCooldownMs(): number {
    return 300_000;
  }

  private resolveMaxEntities(): number {
    return 5;
  }

  private composeQueueTargetKey(request: {
    term: string;
    entityType: EntityType;
    reason: OnDemandReason;
    engineId: string;
    entityIdentityKey: string;
  }): string {
    return `${request.reason}:${
      request.entityType
    }:${request.entityIdentityKey}:${request.term.toLowerCase()}:${
      request.engineId
    }`;
  }

  private async filterByCooldown(
    requests: Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      engineId: string;
      entityIdentityKey: string;
    }>,
    seenAt: Date,
  ): Promise<
    Array<{
      term: string;
      entityType: EntityType;
      reason: OnDemandReason;
      engineId: string;
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
      engineId: request.engineId,
      entityIdentityKey: request.entityIdentityKey,
    }));

    const existing = await this.prisma.onDemandRequest.findMany({
      where: { OR: ors },
      select: {
        term: true,
        entityType: true,
        reason: true,
        engineId: true,
        entityIdentityKey: true,
        lastQueuedAt: true,
      },
    });

    const cutoffByKey = new Map<string, Date | null>();
    for (const row of existing) {
      cutoffByKey.set(
        `${row.reason}:${row.entityType}:${row.entityIdentityKey}:${row.term.toLowerCase()}:${
          row.engineId
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
    engineId: string;
    entityIdentityKey: string;
  }> {
    const entityIdentityKey = this.composeEntityIdentityKey(request.entityId);
    return this.normalizeEngineIds(request.engineIds).map((engineId) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      engineId,
      entityIdentityKey,
    }));
  }

  private composeEntityIdentityKey(entityId?: string | null): string {
    return this.normalizeEntityId(entityId) ?? 'no_entity';
  }

  private normalizeEngineIds(engineIds?: string[] | null): string[] {
    if (!Array.isArray(engineIds)) {
      return [];
    }
    return Array.from(
      new Set(
        engineIds
          .map((engineId) =>
            typeof engineId === 'string' ? engineId.trim() : '',
          )
          .filter((engineId) => engineId.length > 0),
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

  /** The ask sites pass the search viewport as context.bounds (see the two
   *  recordRequests call sites) — the on_demand_ask signal's geo. */
  private extractBounds(value: unknown): {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const bounds = value as {
      northEast?: { lat?: unknown; lng?: unknown };
      southWest?: { lat?: unknown; lng?: unknown };
    };
    const ne = bounds.northEast;
    const sw = bounds.southWest;
    if (
      typeof ne?.lat !== 'number' ||
      typeof ne.lng !== 'number' ||
      typeof sw?.lat !== 'number' ||
      typeof sw.lng !== 'number'
    ) {
      return null;
    }
    return {
      northEast: { lat: ne.lat, lng: ne.lng },
      southWest: { lat: sw.lat, lng: sw.lng },
    };
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
