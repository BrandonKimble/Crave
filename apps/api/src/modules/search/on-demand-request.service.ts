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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OnDemandRequestService');
  }

  async recordRequests(
    requests: OnDemandRequestInput[],
    options: OnDemandRequestRecordOptions = {},
    context: Record<string, unknown> = {},
  ): Promise<OnDemandRequestInput[]> {
    const deduped = this.deduplicateRequests(requests);
    if (!deduped.length) {
      return [];
    }

    const userId = this.normalizeUserId(options.userId);
    const seenAt =
      options.seenAt instanceof Date && !Number.isNaN(options.seenAt.getTime())
        ? options.seenAt
        : new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const request of deduped) {
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
      requests: deduped.map((request) => ({
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
      })),
      userId: userId ?? undefined,
    });

    return deduped;
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
