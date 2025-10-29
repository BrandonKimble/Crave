import { Injectable, Inject } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface InterestInput {
  term: string;
  entityType: EntityType;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SearchInterestService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchInterestService');
  }

  async recordInterests(
    interests: InterestInput[],
    context: Record<string, unknown> = {},
  ): Promise<InterestInput[]> {
    const deduped = this.deduplicateInterests(interests);
    if (!deduped.length) {
      return [];
    }

    const operations = deduped.map((interest) =>
      this.prisma.searchInterest.upsert({
        where: {
          term_entityType: {
            term: interest.term,
            entityType: interest.entityType,
          },
        },
        create: {
          term: interest.term,
          entityType: interest.entityType,
          metadata: this.buildMetadata(interest.metadata, context),
        },
        update: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: new Date(),
          metadata: this.buildMetadata(interest.metadata, context),
        },
      }),
    );

    await this.prisma.$transaction(operations);

    this.logger.debug('Recorded search interests', {
      interests: deduped.map((interest) => ({
        term: interest.term,
        entityType: interest.entityType,
      })),
    });

    return deduped;
  }

  private deduplicateInterests(interests: InterestInput[]): InterestInput[] {
    const seen = new Set<string>();
    const result: InterestInput[] = [];
    for (const interest of interests) {
      const sanitizedTerm = this.sanitizeTerm(interest.term);
      if (!sanitizedTerm) {
        continue;
      }
      const key = `${interest.entityType}:${sanitizedTerm.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        term: sanitizedTerm,
        entityType: interest.entityType,
        metadata: interest.metadata,
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
    interestId: string,
    update: { lastEnqueuedAt?: Date; status?: 'queued' | 'processing' } = {},
  ): Promise<boolean> {
    const { count } = await this.prisma.searchInterest.updateMany({
      where: {
        interestId,
        status: 'pending',
      },
      data: {
        status: update.status ?? 'queued',
        lastEnqueuedAt: update.lastEnqueuedAt ?? new Date(),
      },
    });

    if (count === 0) {
      this.logger.debug('Search interest was already queued or processed', {
        interestId,
      });
      return false;
    }

    return true;
  }

  async markProcessingById(interestId: string): Promise<void> {
    await this.prisma.searchInterest.updateMany({
      where: {
        interestId,
        status: 'queued',
      },
      data: {
        status: 'processing',
      },
    });
  }

  async markCompletedById(
    interestId: string,
    update: {
      entityId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.prisma.searchInterest.updateMany({
      where: { interestId },
      data: {
        status: 'completed',
        entityId: update.entityId ?? null,
        metadata: update.metadata
          ? (update.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async resetToPendingById(
    interestId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.searchInterest.updateMany({
      where: { interestId },
      data: {
        status: 'pending',
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async updateMetadataById(
    interestId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.searchInterest.updateMany({
      where: { interestId },
      data: {
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
