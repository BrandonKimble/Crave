import { Injectable, Inject } from '@nestjs/common';
import {
  EntityType,
  OnDemandReason,
  OnDemandStatus,
  OnDemandOutcome,
  Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityRepository } from '../../repositories/entity.repository';
import {
  KeywordSearchOrchestratorService,
  KeywordQueueDepth,
} from '../content-processing/reddit-collector/keyword-search-orchestrator.service';
import { EntityPriorityScore } from '../content-processing/reddit-collector/entity-priority-selection.service';
import {
  OnDemandRequestInput,
  OnDemandRequestService,
} from './on-demand-request.service';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from '../restaurant-enrichment';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';
import { MapBoundsDto } from './dto/search-query.dto';

export interface OnDemandJobTarget {
  requestId: string;
  term: string;
  normalizedTerm: string;
  entityType: EntityType;
  occurrenceCount: number;
  reason: OnDemandReason;
  existingEntityId?: string | null;
}

type OnDemandRecord = {
  requestId: string;
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  occurrenceCount: number;
  status: OnDemandStatus;
  entityId?: string | null;
  metadata: Prisma.JsonValue | null;
  lastEnqueuedAt: Date | null;
  resultRestaurantCount: number;
  resultFoodCount: number;
  attemptedSubreddits: string[];
  deferredAttempts: number;
  lastOutcome: OnDemandOutcome | null;
  lastAttemptAt: Date | null;
  lastCompletedAt: Date | null;
};

type OnDemandMetadata = {
  context?: unknown;
  [key: string]: unknown;
};

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
export class OnDemandProcessingService {
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
    private readonly requestService: OnDemandRequestService,
    private readonly subredditResolver: SearchSubredditResolverService,
    private readonly configService: ConfigService,
    private readonly restaurantLocationEnrichmentService: RestaurantLocationEnrichmentService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.maxPerBatch =
      this.configService.get<number>('onDemand.maxPerBatch') || 5;
    this.maxImmediateWaiting =
      this.configService.get<number>('onDemand.maxImmediateWaiting') || 3;
    this.maxImmediateActive =
      this.configService.get<number>('onDemand.maxImmediateActive') || 1;
    this.maxProcessingBacklog =
      this.configService.get<number>('onDemand.maxProcessingBacklog') || 10;
    this.instantCooldownMs =
      this.configService.get<number>('onDemand.instantCooldownMs') ||
      5 * 60 * 1000;
    this.logger = loggerService.setContext('OnDemandProcessingService');
  }

  async enqueueRequests(requests: OnDemandRequestInput[]): Promise<void> {
    if (!requests.length) {
      return;
    }

    try {
      await this.processPendingBacklog();
    } catch (error) {
      this.logger.warn('Failed to process pending on-demand backlog', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }

    const limited = requests.slice(0, this.maxPerBatch);

    for (const request of limited) {
      try {
        await this.processRequest(request);
      } catch (error) {
        this.logger.error('Failed to enqueue on-demand request', {
          term: request.term,
          entityType: request.entityType,
          reason: request.reason,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      }
    }
  }

  private async processRequest(request: OnDemandRequestInput): Promise<void> {
    const record = await this.prisma.onDemandRequest.findUnique({
      where: {
        term_entityType_reason: {
          term: request.term,
          entityType: request.entityType,
          reason: request.reason,
        },
      },
      select: {
        requestId: true,
        term: true,
        entityType: true,
        reason: true,
        occurrenceCount: true,
        status: true,
        entityId: true,
        metadata: true,
        lastEnqueuedAt: true,
        resultRestaurantCount: true,
        resultFoodCount: true,
        attemptedSubreddits: true,
        deferredAttempts: true,
        lastOutcome: true,
        lastAttemptAt: true,
        lastCompletedAt: true,
      },
    });

    if (!record) {
      return;
    }

    await this.processRecord(record as OnDemandRecord);
  }

  private async processRecord(record: OnDemandRecord): Promise<void> {
    if (record.status !== 'pending') {
      this.logger.debug('On-demand request already queued or in-flight', {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        status: record.status,
      });
      return;
    }

    const metadata = this.parseMetadata(record.metadata);
    const decision = await this.shouldRunImmediately(record, metadata);

    if (!decision.runNow) {
      const nowIso = new Date().toISOString();
      const deferredAttempts = record.deferredAttempts;
      const updatedMetadata: OnDemandMetadata = {
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

      await this.requestService.markDeferredById(record.requestId, {
        metadata: updatedMetadata,
        deferredAttempts: deferredAttempts + 1,
      });

      this.logger.debug('Deferred on-demand request immediate execution', {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        deferReason: decision.reason ?? 'unspecified',
      });

      return;
    }

    const bounds = this.extractBounds(metadata);
    const fallbackLocation = this.extractFallbackLocation(metadata);
    const subreddits = await this.subredditResolver.resolve({
      bounds: bounds ?? null,
      fallbackLocation,
    });

    if (!subreddits.length) {
      const updatedMetadata: OnDemandMetadata = {
        ...metadata,
        lastOutcome: 'no_active_subreddits',
        lastAttemptAt: new Date().toISOString(),
        instantCooldownUntil: new Date(
          Date.now() + this.instantCooldownMs,
        ).toISOString(),
        deferredAttempts: 0,
      };

      await this.requestService.resetToPendingById(record.requestId, {
        outcome: OnDemandOutcome.no_active_subreddits,
        attemptedAt: new Date(),
        deferredAttempts: 0,
        attemptedSubreddits: [],
        metadata: updatedMetadata,
      });

      this.logger.warn(
        'Skipping on-demand request; no active subreddits found',
        {
          requestId: record.requestId,
          term: record.term,
          entityType: record.entityType,
          reason: record.reason,
        },
      );

      return;
    }

    const target = this.buildTarget(record);

    const marked = await this.requestService.markQueuedById(record.requestId, {
      lastEnqueuedAt: new Date(),
    });

    if (!marked) {
      return;
    }

    await this.requestService.markProcessingById(record.requestId);

    try {
      await this.runOnDemandSearch(target, subreddits);
    } catch (error) {
      this.logger.error(
        'Failed to execute keyword search for on-demand request',
        {
          requestId: target.requestId,
          term: target.term,
          entityType: target.entityType,
          reason: target.reason,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        },
      );
      const cooldownUntil = new Date(Date.now() + this.instantCooldownMs);
      await this.requestService.resetToPendingById(target.requestId, {
        outcome: OnDemandOutcome.error,
        attemptedAt: new Date(),
        cooldownUntil,
        deferredAttempts: 0,
        attemptedSubreddits: subreddits,
        metadata: {
          reason: target.reason,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async runOnDemandSearch(
    target: OnDemandJobTarget,
    subreddits: string[],
  ): Promise<void> {
    const attemptedSubreddits: string[] = [];

    for (const subreddit of subreddits) {
      attemptedSubreddits.push(subreddit);

      const entityScore = this.buildPriorityScore(target);

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
        const entityId = await this.resolveSuccessfulEntityId(target);
        const completedAt = new Date();
        await this.requestService.markCompletedById(target.requestId, {
          entityId: entityId ?? undefined,
          outcome: OnDemandOutcome.success,
          completedAt,
          attemptedSubreddits,
          metadata: {
            reason: target.reason,
            posts: searchResult?.posts.length ?? 0,
            comments: searchResult?.comments.length ?? 0,
          },
        });

        this.logger.info('On-demand request resolved via keyword enrichment', {
          requestId: target.requestId,
          term: target.term,
          entityType: target.entityType,
          entityId: entityId ?? undefined,
          reason: target.reason,
          subreddit,
        });

        return;
      }
    }

    const cooldownUntil = new Date(Date.now() + this.instantCooldownMs);

    await this.requestService.resetToPendingById(target.requestId, {
      outcome: OnDemandOutcome.no_results,
      attemptedAt: new Date(),
      cooldownUntil,
      deferredAttempts: 0,
      attemptedSubreddits,
      metadata: { reason: target.reason },
    });

    this.logger.info('On-demand request yielded no new data', {
      requestId: target.requestId,
      term: target.term,
      entityType: target.entityType,
      reason: target.reason,
      attemptedSubreddits,
    });
  }

  private async resolveSuccessfulEntityId(
    target: OnDemandJobTarget,
  ): Promise<string | null> {
    if (target.reason === 'low_result' && target.existingEntityId) {
      return target.existingEntityId;
    }

    if (target.reason === 'low_result') {
      const existing = await this.prisma.entity.findFirst({
        where: {
          type: target.entityType,
          name: {
            equals: target.normalizedTerm,
            mode: 'insensitive',
          },
        },
        select: { entityId: true },
      });
      if (existing) {
        return existing.entityId;
      }
    }

    // For unresolved requests, create or reuse entity placeholder.
    return this.ensureEntity(
      target.term,
      target.entityType,
      target.existingEntityId ?? undefined,
    );
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

    const normalizedName = this.normalizeEntityName(term, entityType);

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
        set: [term.trim()],
      },
      restaurantQualityScore: entityType === 'restaurant' ? 0 : undefined,
      generalPraiseUpvotes: entityType === 'restaurant' ? 0 : null,
    };

    if (entityType === 'restaurant') {
      data.restaurantAttributes = { set: [] };
      data.restaurantMetadata = Prisma.DbNull;
    }

    const created = await this.entityRepository.create(data);

    this.logger.info('Created placeholder entity for on-demand request', {
      entityId: created.entityId,
      name: created.name,
      entityType: created.type,
    });

    if (entityType === EntityType.restaurant) {
      try {
        await this.restaurantLocationEnrichmentService.enrichRestaurantById(
          created.entityId,
        );
      } catch (error) {
        this.logger.warn('Failed to enrich on-demand restaurant placeholder', {
          entityId: created.entityId,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      }
    }

    return created.entityId;
  }

  private buildPriorityScore(target: OnDemandJobTarget): EntityPriorityScore {
    const entityId =
      target.reason === 'low_result' && target.existingEntityId
        ? target.existingEntityId
        : target.requestId;

    return {
      entityId,
      entityName: target.normalizedTerm,
      entityType: target.entityType,
      score:
        target.reason === 'low_result'
          ? 200 + target.occurrenceCount
          : 100 + target.occurrenceCount,
      factors: {
        dataRecency: target.reason === 'low_result' ? 2 : 1,
        dataQuality: target.reason === 'low_result' ? 1 : 0,
        userDemand: target.occurrenceCount,
      },
      isNewEntity: target.reason === 'unresolved',
    };
  }

  private normalizeEntityName(term: string, entityType: EntityType): string {
    const sanitized = term.trim().replace(/\s+/g, ' ');
    if (entityType === 'food' || entityType === 'food_attribute') {
      return sanitized.toLowerCase();
    }

    return sanitized
      .split(' ')
      .map((word) =>
        word.length > 0
          ? word[0].toUpperCase() + word.slice(1).toLowerCase()
          : word,
      )
      .join(' ');
  }

  private buildTarget(record: {
    requestId: string;
    term: string;
    entityType: EntityType;
    occurrenceCount: number;
    reason: OnDemandReason;
    entityId?: string | null;
  }): OnDemandJobTarget {
    return {
      requestId: record.requestId,
      term: record.term,
      normalizedTerm: this.normalizeEntityName(record.term, record.entityType),
      entityType: record.entityType,
      occurrenceCount: record.occurrenceCount,
      reason: record.reason,
      existingEntityId: record.entityId,
    };
  }

  private extractBounds(metadata: OnDemandMetadata): MapBoundsDto | undefined {
    const context = metadata.context;
    if (!this.isRecord(context)) {
      return undefined;
    }

    const contextRecord = context;
    const boundsRaw = contextRecord.bounds;
    if (!this.isBoundsLike(boundsRaw)) {
      return undefined;
    }

    const { northEast, southWest } = boundsRaw;

    const latNe = this.toNumber(northEast.lat);
    const lngNe = this.toNumber(northEast.lng);
    const latSw = this.toNumber(southWest.lat);
    const lngSw = this.toNumber(southWest.lng);

    if (latNe === null || lngNe === null || latSw === null || lngSw === null) {
      return undefined;
    }

    return {
      northEast: { lat: latNe, lng: lngNe },
      southWest: { lat: latSw, lng: lngSw },
    };
  }

  private extractFallbackLocation(
    metadata: OnDemandMetadata,
  ): { latitude: number; longitude: number } | null {
    const context = metadata.context;
    if (!this.isRecord(context)) {
      return null;
    }

    const contextRecord = context;
    const locationRaw = contextRecord.location;
    if (!this.isLatLongLike(locationRaw)) {
      return null;
    }

    const latitude = this.toNumber(locationRaw.latitude);
    const longitude = this.toNumber(locationRaw.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return { latitude, longitude };
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isCoordinateLike(
    value: unknown,
  ): value is { lat: unknown; lng: unknown } {
    if (!this.isRecord(value)) {
      return false;
    }
    return 'lat' in value && 'lng' in value;
  }

  private isBoundsLike(value: unknown): value is {
    northEast: { lat: unknown; lng: unknown };
    southWest: { lat: unknown; lng: unknown };
  } {
    if (!this.isRecord(value)) {
      return false;
    }
    const record = value;
    return (
      this.isCoordinateLike(record.northEast) &&
      this.isCoordinateLike(record.southWest)
    );
  }

  private isLatLongLike(
    value: unknown,
  ): value is { latitude: unknown; longitude: unknown } {
    if (!this.isRecord(value)) {
      return false;
    }
    return 'latitude' in value && 'longitude' in value;
  }

  private parseMetadata(metadata: Prisma.JsonValue | null): OnDemandMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return { ...(metadata as Record<string, unknown>) };
  }

  private async shouldRunImmediately(
    record: OnDemandRecord,
    metadata: OnDemandMetadata,
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
          requestId: record.requestId,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
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
    const backlog = await this.prisma.onDemandRequest.findMany({
      where: {
        status: 'pending',
      },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'asc' }],
      take: this.maxPerBatch,
      select: {
        requestId: true,
        term: true,
        entityType: true,
        reason: true,
        occurrenceCount: true,
        status: true,
        entityId: true,
        metadata: true,
        lastEnqueuedAt: true,
      },
    });

    for (const record of backlog) {
      try {
        await this.processRecord(record as OnDemandRecord);
      } catch (error) {
        this.logger.error('Failed to process backlog on-demand request', {
          requestId: record.requestId,
          term: record.term,
          reason: record.reason,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      }
    }
  }
}
