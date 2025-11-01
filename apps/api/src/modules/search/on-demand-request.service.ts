import { Injectable, Inject } from '@nestjs/common';
import {
  EntityType,
  OnDemandOutcome,
  OnDemandReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface OnDemandRequestInput {
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
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
    context: Record<string, unknown> = {},
  ): Promise<OnDemandRequestInput[]> {
    const deduped = this.deduplicateRequests(requests);
    if (!deduped.length) {
      return [];
    }

    const operations = deduped.map((request) => {
      const resultRestaurantCount = this.extractInteger(
        context.restaurantCount,
      );
      const resultFoodCount = this.extractInteger(context.foodCount);

      const createData: Prisma.OnDemandRequestCreateInput = {
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
        metadata: this.buildMetadata(request.metadata, context),
        attemptedSubreddits: [],
        deferredAttempts: 0,
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
        occurrenceCount: { increment: 1 },
        lastSeenAt: new Date(),
        metadata: this.buildMetadata(request.metadata, context),
      };

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

      return this.prisma.onDemandRequest.upsert({
        where: {
          term_entityType_reason: {
            term: request.term,
            entityType: request.entityType,
            reason: request.reason,
          },
        },
        create: createData,
        update: updateData,
      });
    });

    await this.prisma.$transaction(operations);

    this.logger.debug('Recorded on-demand requests', {
      requests: deduped.map((request) => ({
        term: request.term,
        entityType: request.entityType,
        reason: request.reason,
      })),
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
      const key = `${request.reason}:${request.entityType}:${sanitizedTerm.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        term: sanitizedTerm,
        entityType: request.entityType,
        reason: request.reason,
        entityId: request.entityId,
        metadata: request.metadata,
      });
    }
    return result;
  }

  private sanitizeTerm(term: string): string {
    return term.trim().replace(/\s+/g, ' ');
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

  async markQueuedById(
    requestId: string,
    update: { lastEnqueuedAt?: Date; status?: 'queued' | 'processing' } = {},
  ): Promise<boolean> {
    const { count } = await this.prisma.onDemandRequest.updateMany({
      where: {
        requestId,
        status: 'pending',
      },
      data: {
        status: update.status ?? 'queued',
        lastEnqueuedAt: update.lastEnqueuedAt ?? new Date(),
      },
    });

    if (count === 0) {
      this.logger.debug('On-demand request already queued or processed', {
        requestId,
      });
      return false;
    }

    return true;
  }

  async markProcessingById(requestId: string): Promise<void> {
    await this.prisma.onDemandRequest.updateMany({
      where: {
        requestId,
        status: 'queued',
      },
      data: {
        status: 'processing',
      },
    });
  }

  async markCompletedById(
    requestId: string,
    update: {
      entityId?: string | null;
      outcome: OnDemandOutcome;
      completedAt?: Date;
      attemptedSubreddits?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.onDemandRequest.updateMany({
      where: { requestId },
      data: {
        status: 'completed',
        entityId: update.entityId ?? null,
        lastOutcome: update.outcome,
        lastCompletedAt: update.completedAt ?? new Date(),
        lastAttemptAt: update.completedAt ?? new Date(),
        deferredAttempts: 0,
        attemptedSubreddits: update.attemptedSubreddits ?? [],
        metadata: update.metadata
          ? (update.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async resetToPendingById(
    requestId: string,
    update: {
      outcome: OnDemandOutcome;
      attemptedAt?: Date;
      cooldownUntil?: Date;
      deferredAttempts?: number;
      attemptedSubreddits?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      ...(update.metadata ?? {}),
    };

    if (update.cooldownUntil) {
      metadata.instantCooldownUntil = update.cooldownUntil.toISOString();
    }

    await this.prisma.onDemandRequest.updateMany({
      where: { requestId },
      data: {
        status: 'pending',
        lastOutcome: update.outcome,
        lastAttemptAt: update.attemptedAt ?? new Date(),
        deferredAttempts: update.deferredAttempts ?? 0,
        attemptedSubreddits: update.attemptedSubreddits ?? [],
        metadata: Object.keys(metadata).length
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async markDeferredById(
    requestId: string,
    update: {
      metadata: Record<string, unknown>;
      deferredAttempts: number;
    },
  ): Promise<void> {
    await this.prisma.onDemandRequest.updateMany({
      where: { requestId },
      data: {
        metadata: update.metadata as Prisma.InputJsonValue,
        deferredAttempts: update.deferredAttempts,
        lastOutcome: OnDemandOutcome.deferred,
      },
    });
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
