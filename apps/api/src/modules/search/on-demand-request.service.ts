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
  locationKey?: string | null;
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

    const filtered =
      this.cooldownMs > 0
        ? await this.filterByCooldown(capped, seenAt)
        : capped;
    if (!filtered.length) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const request of filtered) {
        const resultRestaurantCount = this.extractInteger(
          context.restaurantCount,
        );
        const resultFoodCount = this.extractInteger(context.foodCount);
        const locationKey = this.normalizeLocationKey(request.locationKey);
        const metadata = this.buildMetadata(request.metadata, context);

        const createData: Prisma.OnDemandRequestCreateInput = {
          term: request.term,
          entityType: request.entityType,
          reason: request.reason,
          locationKey,
          lastSeenAt: seenAt,
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
          locationKey,
        };

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
            term_entityType_reason_locationKey: {
              term: request.term,
              entityType: request.entityType,
              reason: request.reason,
              locationKey,
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
              createdAt: seenAt,
            },
            update: {
              createdAt: seenAt,
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
    });

    this.logger.debug('Recorded on-demand requests', {
      requests: filtered.map((request) => ({
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
      })),
      userId: userId ?? undefined,
    });

    return filtered;
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
      const locationKey = this.normalizeLocationKey(request.locationKey);
      const key = `${request.reason}:${
        request.entityType
      }:${sanitizedTerm.toLowerCase()}`;
      const scopedKey = `${key}:${locationKey}`;
      if (seen.has(scopedKey)) {
        continue;
      }
      seen.add(scopedKey);
      result.push({
        term: sanitizedTerm,
        entityType: request.entityType,
        reason: request.reason,
        entityId: request.entityId,
        locationKey,
        metadata: request.metadata,
      });
    }
    return result;
  }

  private normalizeLocationKey(locationKey?: string | null): string {
    const normalized =
      typeof locationKey === 'string' ? locationKey.trim().toLowerCase() : '';
    return normalized.length ? normalized : 'global';
  }

  private normalizeUserId(userId?: string | null): string | null {
    const normalized = typeof userId === 'string' ? userId.trim() : '';
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

  private composeCooldownKey(request: OnDemandRequestInput): string {
    const locationKey = this.normalizeLocationKey(request.locationKey);
    return `${request.reason}:${
      request.entityType
    }:${request.term.toLowerCase()}:${locationKey}`;
  }

  private async filterByCooldown(
    requests: OnDemandRequestInput[],
    seenAt: Date,
  ): Promise<OnDemandRequestInput[]> {
    if (this.cooldownMs <= 0) {
      return requests;
    }

    const ors = requests.map((request) => ({
      term: request.term,
      entityType: request.entityType,
      reason: request.reason,
      locationKey: this.normalizeLocationKey(request.locationKey),
    }));

    const existing = await this.prisma.onDemandRequest.findMany({
      where: { OR: ors },
      select: {
        term: true,
        entityType: true,
        reason: true,
        locationKey: true,
        lastSeenAt: true,
      },
    });

    const cutoffByKey = new Map<string, Date>();
    for (const row of existing) {
      const key = `${row.reason}:${row.entityType}:${row.term.toLowerCase()}:${
        row.locationKey
      }`;
      cutoffByKey.set(key, row.lastSeenAt);
    }

    const nowMs = seenAt.getTime();
    return requests.filter((request) => {
      const key = this.composeCooldownKey(request);
      const lastSeenAt = cutoffByKey.get(key);
      if (!lastSeenAt) {
        return true;
      }
      return nowMs - lastSeenAt.getTime() >= this.cooldownMs;
    });
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
