import { Injectable, Inject } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityRepository } from '../../repositories/entity.repository';
import {
  KeywordSearchOrchestratorService,
  KeywordQueueDepth,
} from '../content-processing/reddit-collector/keyword-search-orchestrator.service';
import { EntityPriorityScore } from '../content-processing/reddit-collector/entity-priority-selection.service';
import {
  InterestInput,
  SearchInterestService,
} from './search-interest.service';
import { LoggerService } from '../../shared';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';
import { MapBoundsDto } from './dto/search-query.dto';
export interface SearchInterestJobTarget {
  interestId: string;
  term: string;
  normalizedTerm: string;
  entityType: EntityType;
  occurrenceCount: number;
  existingEntityId?: string | null;
}

type SearchInterestRecord = {
  interestId: string;
  term: string;
  entityType: EntityType;
  occurrenceCount: number;
  status: 'pending' | 'queued' | 'processing' | 'completed';
  entityId?: string | null;
  metadata: Prisma.JsonValue | null;
  lastEnqueuedAt: Date | null;
};

type SearchInterestMetadata = Record<string, unknown>;

interface QueueDecision {
  runNow: boolean;
  reason?: string;
  snapshot?: QueueSnapshot;
}

interface QueueSnapshot {
  execution: {
    waiting: number;
    active: number;
    delayed: number;
  };
  processing: {
    waiting: number;
    active: number;
    delayed: number;
  };
}

@Injectable()
export class SearchInterestProcessingService {
  private readonly maxPerBatch: number;
  private readonly maxImmediateWaiting: number;
  private readonly maxImmediateActive: number;
  private readonly maxProcessingBacklog: number;
  private readonly instantCooldownMs: number;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityRepository: EntityRepository,
    private readonly keywordSearchOrchestrator: KeywordSearchOrchestratorService,
    private readonly interestService: SearchInterestService,
    private readonly subredditResolver: SearchSubredditResolverService,
    private readonly configService: ConfigService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.maxPerBatch =
      this.configService.get<number>('searchInterest.maxPerBatch') || 5;
    this.maxImmediateWaiting =
      this.configService.get<number>('searchInterest.maxImmediateWaiting') || 3;
    this.maxImmediateActive =
      this.configService.get<number>('searchInterest.maxImmediateActive') || 1;
    this.maxProcessingBacklog =
      this.configService.get<number>('searchInterest.maxProcessingBacklog') ||
      10;
    this.instantCooldownMs =
      this.configService.get<number>('searchInterest.instantCooldownMs') ||
      5 * 60 * 1000;
    this.logger = loggerService.setContext('SearchInterestProcessingService');
  }

  async enqueueInterests(interests: InterestInput[]): Promise<void> {
    if (!interests.length) {
      return;
    }

    try {
      await this.processPendingBacklog();
    } catch (error) {
      this.logger.warn('Failed to process pending search interest backlog', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const limited = interests.slice(0, this.maxPerBatch);

    for (const interest of limited) {
      try {
        await this.processInterest(interest);
      } catch (error) {
        this.logger.error('Failed to enqueue search interest', {
          term: interest.term,
          entityType: interest.entityType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processInterest(interest: InterestInput): Promise<void> {
    const record = await this.prisma.searchInterest.findUnique({
      where: {
        term_entityType: {
          term: interest.term,
          entityType: interest.entityType,
        },
      },
      select: {
        interestId: true,
        term: true,
        entityType: true,
        occurrenceCount: true,
        status: true,
        entityId: true,
        metadata: true,
        lastEnqueuedAt: true,
      },
    });

    if (!record) {
      return;
    }

    await this.processInterestRecord(record as SearchInterestRecord);
  }

  private async processInterestRecord(
    record: SearchInterestRecord,
  ): Promise<void> {
    if (record.status !== 'pending') {
      this.logger.debug('Search interest already queued or in-flight', {
        term: record.term,
        entityType: record.entityType,
        status: record.status,
      });
      return;
    }

    const metadata = this.parseMetadata(record.metadata);
    const decision = await this.shouldRunImmediately(record, metadata);

    if (!decision.runNow) {
      const nowIso = new Date().toISOString();
      const deferredAttempts =
        typeof metadata.deferredAttempts === 'number'
          ? metadata.deferredAttempts
          : 0;
      const updatedMetadata: SearchInterestMetadata = {
        ...metadata,
        lastOutcome: 'deferred',
        lastDeferredAt: nowIso,
        deferredReason: decision.reason ?? 'unspecified',
        deferredAttempts: deferredAttempts + 1,
      };

      if (decision.snapshot) {
        updatedMetadata.lastQueueSnapshot = decision.snapshot;
      }

      if (decision.reason !== 'cooldown_active') {
        updatedMetadata.instantCooldownUntil = new Date(
          Date.now() + this.instantCooldownMs,
        ).toISOString();
      }

      await this.interestService.updateMetadataById(
        record.interestId,
        updatedMetadata,
      );

      this.logger.debug('Deferred search interest immediate execution', {
        interestId: record.interestId,
        term: record.term,
        entityType: record.entityType,
        reason: decision.reason ?? 'unspecified',
      });

      return;
    }

    const bounds = this.extractBounds(metadata);
    const subreddits = await this.subredditResolver.resolve({
      bounds: bounds ?? null,
    });

    if (!subreddits.length) {
      const updatedMetadata: SearchInterestMetadata = {
        ...metadata,
        lastOutcome: 'no_active_subreddits',
        lastAttemptAt: new Date().toISOString(),
        instantCooldownUntil: new Date(
          Date.now() + this.instantCooldownMs,
        ).toISOString(),
        deferredAttempts: 0,
      };

      await this.interestService.updateMetadataById(
        record.interestId,
        updatedMetadata,
      );

      this.logger.warn('Skipping search interest; no active subreddits found', {
        interestId: record.interestId,
        term: record.term,
        entityType: record.entityType,
      });

      return;
    }

    const target = this.buildTarget(record);

    const marked = await this.interestService.markQueuedById(
      record.interestId,
      {
        lastEnqueuedAt: new Date(),
      },
    );

    if (!marked) {
      return;
    }

    await this.interestService.markProcessingById(record.interestId);

    try {
      await this.runInterestKeywordSearch(target, subreddits);
    } catch (error) {
      this.logger.error('Failed to execute keyword search for interest', {
        interestId: target.interestId,
        term: target.term,
        entityType: target.entityType,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      await this.interestService.resetToPendingById(target.interestId, {
        lastOutcome: 'error',
        lastAttemptAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
        instantCooldownUntil: new Date(
          Date.now() + this.instantCooldownMs,
        ).toISOString(),
        deferredAttempts: 0,
        attemptedSubreddits: subreddits,
      });
    }
  }

  private async ensureEntity(
    term: string,
    entityType: EntityType,
    existingEntityId?: string,
  ): Promise<string> {
    if (existingEntityId) {
      const existing = await this.entityRepository.findById(existingEntityId);
      if (existing) {
        return existingEntityId;
      }
    }

    const normalizedName = this.normalizeEntityName(term);

    const existing = await this.prisma.entity.findFirst({
      where: {
        type: entityType,
        name: {
          equals: normalizedName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return existing.entityId;
    }

    const data: Prisma.EntityCreateInput = {
      name: normalizedName,
      type: entityType,
      aliases: {
        set: [term],
      },
      restaurantAttributes:
        entityType === 'restaurant'
          ? {
              set: [],
            }
          : undefined,
      restaurantMetadata:
        entityType === 'restaurant'
          ? ({ origin: 'search_interest' } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      restaurantQualityScore: entityType === 'restaurant' ? 0 : undefined,
      generalPraiseUpvotes: entityType === 'restaurant' ? 0 : null,
    };

    const created = await this.entityRepository.create(data);

    this.logger.info('Created placeholder entity for search interest', {
      entityId: created.entityId,
      name: created.name,
      entityType: created.type,
    });

    return created.entityId;
  }

  private buildPriorityScore(
    entityId: string,
    term: string,
    entityType: EntityType,
    occurrenceCount: number,
  ): EntityPriorityScore {
    const normalizedName = this.normalizeEntityName(term);
    return {
      entityId,
      entityName: normalizedName,
      entityType,
      score: 100 + occurrenceCount,
      factors: {
        dataRecency: 1,
        dataQuality: 0,
        userDemand: occurrenceCount,
      },
      isNewEntity: true,
    };
  }

  private normalizeEntityName(term: string): string {
    return term
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) =>
        word.length > 0
          ? word[0].toUpperCase() + word.slice(1).toLowerCase()
          : word,
      )
      .join(' ');
  }

  private buildTarget(record: {
    interestId: string;
    term: string;
    entityType: EntityType;
    occurrenceCount: number;
    entityId?: string | null;
  }): SearchInterestJobTarget {
    return {
      interestId: record.interestId,
      term: record.term,
      normalizedTerm: this.normalizeEntityName(record.term),
      entityType: record.entityType,
      occurrenceCount: record.occurrenceCount,
      existingEntityId: record.entityId,
    };
  }

  private async runInterestKeywordSearch(
    target: SearchInterestJobTarget,
    subreddits: string[],
  ): Promise<void> {
    const attemptedSubreddits: string[] = [];

    for (const subreddit of subreddits) {
      attemptedSubreddits.push(subreddit);

      const entityScore = this.buildPriorityScore(
        target.interestId,
        target.term,
        target.entityType,
        target.occurrenceCount,
      );

      const result =
        await this.keywordSearchOrchestrator.executeKeywordSearchCycle(
          subreddit,
          [entityScore],
        );

      const searchResult = result.searchResults[target.normalizedTerm];
      const processingResult = result.processingResults[target.normalizedTerm];

      const success =
        Boolean(
          searchResult &&
            (searchResult.posts.length > 0 || searchResult.comments.length > 0),
        ) ||
        Boolean(
          processingResult &&
            (processingResult.connectionsCreated ?? 0) > 0 &&
            processingResult.success,
        );

      if (success) {
        const entityId = await this.ensureEntity(
          target.term,
          target.entityType,
          target.existingEntityId ?? undefined,
        );

        await this.interestService.markCompletedById(target.interestId, {
          entityId,
          metadata: {
            lastOutcome: 'success',
            lastCompletedAt: new Date().toISOString(),
            posts: searchResult?.posts.length ?? 0,
            comments: searchResult?.comments.length ?? 0,
            attemptedSubreddits,
            deferredAttempts: 0,
          },
        });

        this.logger.info('Search interest resolved via keyword enrichment', {
          interestId: target.interestId,
          term: target.term,
          entityType: target.entityType,
          entityId,
          subreddit,
        });

        return;
      }
    }

    await this.interestService.resetToPendingById(target.interestId, {
      lastOutcome: 'no_results',
      lastAttemptAt: new Date().toISOString(),
      instantCooldownUntil: new Date(
        Date.now() + this.instantCooldownMs,
      ).toISOString(),
      deferredAttempts: 0,
      attemptedSubreddits,
    });

    this.logger.info('Search interest yielded no new data', {
      interestId: target.interestId,
      term: target.term,
      entityType: target.entityType,
      attemptedSubreddits,
    });
  }

  private extractBounds(
    metadata: SearchInterestMetadata,
  ): MapBoundsDto | undefined {
    const context = metadata.context;
    if (!context || typeof context !== 'object') {
      return undefined;
    }

    const boundsRaw = (context as Record<string, unknown>).bounds;
    if (!boundsRaw || typeof boundsRaw !== 'object') {
      return undefined;
    }

    const northEast = (boundsRaw as Record<string, any>).northEast;
    const southWest = (boundsRaw as Record<string, any>).southWest;

    if (!northEast || !southWest) {
      return undefined;
    }

    const latNe = this.toNumber(northEast.lat);
    const lngNe = this.toNumber(northEast.lng);
    const latSw = this.toNumber(southWest.lat);
    const lngSw = this.toNumber(southWest.lng);

    if (
      latNe === null ||
      lngNe === null ||
      latSw === null ||
      lngSw === null
    ) {
      return undefined;
    }

    return {
      northEast: { lat: latNe, lng: lngNe },
      southWest: { lat: latSw, lng: lngSw },
    };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private parseMetadata(
    metadata: Prisma.JsonValue | null,
  ): SearchInterestMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return { ...(metadata as Record<string, unknown>) };
  }

  private async shouldRunImmediately(
    record: SearchInterestRecord,
    metadata: SearchInterestMetadata,
  ): Promise<QueueDecision> {
    const cooldownRaw = metadata.instantCooldownUntil;
    if (typeof cooldownRaw === 'string') {
      const cooldownUntil = Date.parse(cooldownRaw);
      if (!Number.isNaN(cooldownUntil) && cooldownUntil > Date.now()) {
        return { runNow: false, reason: 'cooldown_active' };
      }
    }

    try {
      const depth = await this.keywordSearchOrchestrator.getQueueDepth();
      const snapshot = this.buildQueueSnapshot(depth);
      const executionWaiting = snapshot.execution.waiting;
      const executionActive = snapshot.execution.active;
      const processingBacklog =
        snapshot.processing.waiting + snapshot.processing.active;

      if (executionWaiting >= this.maxImmediateWaiting) {
        return {
          runNow: false,
          reason: 'execution_queue_waiting',
          snapshot,
        };
      }

      if (executionActive >= this.maxImmediateActive) {
        return {
          runNow: false,
          reason: 'execution_queue_active',
          snapshot,
        };
      }

      if (processingBacklog >= this.maxProcessingBacklog) {
        return {
          runNow: false,
          reason: 'processing_queue_backlog',
          snapshot,
        };
      }

      return { runNow: true, snapshot };
    } catch (error) {
      this.logger.warn(
        'Unable to inspect keyword queue depth; defaulting to immediate execution',
        {
          interestId: record.interestId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return { runNow: true };
    }
  }

  private buildQueueSnapshot(depth: KeywordQueueDepth): QueueSnapshot {
    return {
      execution: {
        waiting: depth.execution.waiting ?? 0,
        active: depth.execution.active ?? 0,
        delayed: depth.execution.delayed ?? 0,
      },
      processing: {
        waiting: depth.processing.waiting ?? 0,
        active: depth.processing.active ?? 0,
        delayed: depth.processing.delayed ?? 0,
      },
    };
  }

  private async processPendingBacklog(): Promise<void> {
    const backlog = await this.prisma.searchInterest.findMany({
      where: {
        status: 'pending',
      },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'asc' }],
      take: this.maxPerBatch,
      select: {
        interestId: true,
        term: true,
        entityType: true,
        occurrenceCount: true,
        status: true,
        entityId: true,
        metadata: true,
        lastEnqueuedAt: true,
      },
    });

    for (const record of backlog) {
      try {
        await this.processInterestRecord(record as SearchInterestRecord);
      } catch (error) {
        this.logger.error('Failed to process backlog search interest', {
          interestId: record.interestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
