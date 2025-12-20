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
  KeywordSearchSort,
  KeywordSearchSortPlan,
} from '../content-processing/reddit-collector/keyword-search-orchestrator.service';
import { EntityPriorityScore } from '../content-processing/reddit-collector/entity-priority-selection.service';
import {
  OnDemandRequestInput,
  OnDemandRequestService,
} from './on-demand-request.service';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from '../restaurant-enrichment';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_RELEVANCE_REFRESH_MULTIPLIER = 3;
const TOP_RELEVANCE_MIN_DAYS = 60;
const NO_RESULTS_COOLDOWN_MIN_DAYS = 60;
const SHORT_SAFE_INTERVAL_DAYS = 10;
const FALLBACK_MIN_RESULTS = 20;

export interface OnDemandJobTarget {
  requestId: string;
  term: string;
  normalizedTerm: string;
  entityType: EntityType;
  occurrenceCount: number;
  reason: OnDemandReason;
  locationKey: string;
  locationBias?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
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
  locationKey: string;
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

export interface OnDemandEnqueueResult {
  requestId: string;
  term: string;
  entityType: EntityType;
  reason: OnDemandReason;
  locationKey: string;
  queued: boolean;
  etaMs?: number;
}

@Injectable()
export class OnDemandProcessingService {
  private readonly maxPerBatch: number;
  private readonly maxImmediateWaiting: number;
  private readonly maxImmediateActive: number;
  private readonly maxProcessingBacklog: number;
  private readonly instantCooldownMs: number;
  private readonly estimatedJobMs: number;
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityRepository: EntityRepository,
    private readonly keywordSearchOrchestrator: KeywordSearchOrchestratorService,
    private readonly requestService: OnDemandRequestService,
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
    const estimatedMinutes =
      this.configService.get<number>('onDemand.estimatedJobMinutes') || 120;
    this.estimatedJobMs = Math.max(1, estimatedMinutes) * 60 * 1000;
    this.logger = loggerService.setContext('OnDemandProcessingService');
  }

  async enqueueRequests(
    requests: OnDemandRequestInput[],
  ): Promise<OnDemandEnqueueResult[]> {
    if (!requests.length) {
      return [];
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
    const results: OnDemandEnqueueResult[] = [];

    for (const request of limited) {
      try {
        const result = await this.processRequest(request);
        if (result) {
          results.push(result);
        }
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

    if (results.some((result) => result.queued && !result.etaMs)) {
      const etaMs = await this.estimateQueueDelayMs();
      if (etaMs) {
        for (const result of results) {
          if (result.queued && !result.etaMs) {
            result.etaMs = etaMs;
          }
        }
      }
    }

    return results;
  }

  private async processRequest(
    request: OnDemandRequestInput,
  ): Promise<OnDemandEnqueueResult | null> {
    const record = await this.prisma.onDemandRequest.findUnique({
      where: {
        term_entityType_reason_locationKey: {
          term: request.term,
          entityType: request.entityType,
          reason: request.reason,
          locationKey: this.normalizeLocationKey(request.locationKey),
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
        locationKey: true,
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
      return null;
    }

    return this.processRecord(record as OnDemandRecord);
  }

  private async processRecord(
    record: OnDemandRecord,
  ): Promise<OnDemandEnqueueResult> {
    if (record.status !== 'pending') {
      this.logger.debug('On-demand request already queued or in-flight', {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        status: record.status,
      });
      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: record.locationKey,
        queued: false,
      };
    }

    const normalizedLocationKey = this.normalizeLocationKey(record.locationKey);
    if (normalizedLocationKey === 'global') {
      this.logger.debug('Skipping on-demand request without location key', {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
      });
      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: normalizedLocationKey,
        queued: false,
      };
    }

    const metadata = this.parseMetadata(record.metadata);
    const { safeIntervalMs, subredditName } = await this.resolveSubredditInfo(
      normalizedLocationKey,
    );
    const decision = await this.shouldRunImmediately(
      record,
      metadata,
      safeIntervalMs,
    );
    const locationBias = this.extractLocationBias(metadata);

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

      if (
        decision.reason !== 'cooldown_active' &&
        decision.reason !== 'refresh_cooldown' &&
        decision.reason !== 'sorts_not_due'
      ) {
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

      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: normalizedLocationKey,
        queued: false,
      };
    }

    const sortPlan = this.buildSortPlan(
      metadata,
      safeIntervalMs,
      this.keywordSearchOrchestrator.getConfiguredSorts(),
    );
    if (!sortPlan.length) {
      const nowIso = new Date().toISOString();
      const deferredAttempts = record.deferredAttempts;
      const updatedMetadata: OnDemandMetadata = {
        ...metadata,
        lastOutcome: 'deferred',
        lastDeferredAt: nowIso,
        deferredReason: 'sorts_not_due',
        deferredAttempts: deferredAttempts + 1,
      };

      await this.requestService.markDeferredById(record.requestId, {
        metadata: updatedMetadata,
        deferredAttempts: deferredAttempts + 1,
      });

      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: normalizedLocationKey,
        queued: false,
      };
    }

    const subreddits = subredditName ? [subredditName] : [];

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

      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: normalizedLocationKey,
        queued: false,
      };
    }

    const target = this.buildTarget({
      ...record,
      locationKey: normalizedLocationKey,
      locationBias: locationBias ?? undefined,
    });

    const marked = await this.requestService.markQueuedById(record.requestId, {
      lastEnqueuedAt: new Date(),
    });

    if (!marked) {
      return {
        requestId: record.requestId,
        term: record.term,
        entityType: record.entityType,
        reason: record.reason,
        locationKey: normalizedLocationKey,
        queued: false,
      };
    }

    await this.requestService.markProcessingById(record.requestId);

    try {
      await this.runOnDemandSearch(target, subreddits, {
        metadata,
        sortPlan,
      });
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

    return {
      requestId: record.requestId,
      term: record.term,
      entityType: record.entityType,
      reason: record.reason,
      locationKey: normalizedLocationKey,
      queued: true,
    };
  }

  private async runOnDemandSearch(
    target: OnDemandJobTarget,
    subreddits: string[],
    options: { metadata: OnDemandMetadata; sortPlan: KeywordSearchSortPlan[] },
  ): Promise<void> {
    const attemptedSubreddits: string[] = [];
    const updatedMetadata = this.updateSortHistory(
      options.metadata,
      options.sortPlan,
    );

    for (const subreddit of subreddits) {
      attemptedSubreddits.push(subreddit);

      const entityScore = this.buildPriorityScore(target);

      const result =
        await this.keywordSearchOrchestrator.executeKeywordSearchCycle(
          subreddit,
          [entityScore],
          { sortPlan: options.sortPlan },
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
            ...updatedMetadata,
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
      metadata: { ...updatedMetadata, reason: target.reason },
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
      const normalizedLocationKey = this.normalizeLocationKey(
        target.locationKey,
      );
      const whereClause: Prisma.EntityWhereInput = {
        type: target.entityType,
        name: {
          equals: target.normalizedTerm,
          mode: 'insensitive',
        },
      };
      if (target.entityType === EntityType.restaurant) {
        whereClause.locationKey = normalizedLocationKey;
      }
      const existing = await this.prisma.entity.findFirst({
        where: whereClause,
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
      target.locationKey,
      target.locationBias,
    );
  }

  private async ensureEntity(
    term: string,
    entityType: EntityType,
    existingEntityId?: string,
    locationKey?: string | null,
    locationBias?: OnDemandJobTarget['locationBias'],
  ): Promise<string> {
    if (existingEntityId) {
      const existing = await this.entityRepository.findById(existingEntityId);
      if (existing) {
        return existingEntityId;
      }
    }

    const normalizedName = this.normalizeEntityName(term, entityType);

    const normalizedLocationKey = this.normalizeLocationKey(locationKey);
    const whereClause: Prisma.EntityWhereInput = {
      type: entityType,
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    };

    if (entityType === EntityType.restaurant) {
      whereClause.locationKey = normalizedLocationKey;
    }

    const existing = await this.prisma.entity.findFirst({
      where: whereClause,
    });

    if (existing) {
      return existing.entityId;
    }

    const data: Prisma.EntityCreateInput = {
      name: normalizedName,
      type: entityType,
      locationKey:
        entityType === EntityType.restaurant ? normalizedLocationKey : 'global',
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
          locationBias ? { locationBias } : {},
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

  private normalizeLocationKey(locationKey?: string | null): string {
    const normalized =
      typeof locationKey === 'string' ? locationKey.trim().toLowerCase() : '';
    return normalized.length ? normalized : 'global';
  }

  private buildTarget(record: {
    requestId: string;
    term: string;
    entityType: EntityType;
    occurrenceCount: number;
    reason: OnDemandReason;
    locationKey: string;
    entityId?: string | null;
    locationBias?: OnDemandJobTarget['locationBias'];
  }): OnDemandJobTarget {
    return {
      requestId: record.requestId,
      term: record.term,
      normalizedTerm: this.normalizeEntityName(record.term, record.entityType),
      entityType: record.entityType,
      occurrenceCount: record.occurrenceCount,
      reason: record.reason,
      locationKey: record.locationKey,
      locationBias: record.locationBias,
      existingEntityId: record.entityId,
    };
  }

  private extractLocationBias(
    metadata: OnDemandMetadata,
  ): OnDemandJobTarget['locationBias'] | null {
    const context = metadata.context;
    if (!this.isRecord(context)) {
      return null;
    }

    const raw = context.locationBias;
    if (!this.isRecord(raw)) {
      return null;
    }

    const lat = this.toNumber(raw.lat ?? raw.latitude);
    const lng = this.toNumber(raw.lng ?? raw.longitude);
    if (lat === null || lng === null) {
      return null;
    }

    const radiusMeters = this.toNumber(raw.radiusMeters);
    return radiusMeters === null ? { lat, lng } : { lat, lng, radiusMeters };
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

  private parseMetadata(metadata: Prisma.JsonValue | null): OnDemandMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }
    return { ...(metadata as Record<string, unknown>) };
  }

  private async resolveSubredditInfo(locationKey: string): Promise<{
    safeIntervalMs: number;
    subredditName: string | null;
  }> {
    const subreddit = await this.prisma.subreddit.findFirst({
      where: {
        name: {
          equals: locationKey,
          mode: 'insensitive',
        },
        isActive: true,
      },
      select: { name: true, safeIntervalDays: true },
    });

    const safeIntervalDays =
      typeof subreddit?.safeIntervalDays === 'number' &&
      Number.isFinite(subreddit.safeIntervalDays) &&
      subreddit.safeIntervalDays > 0
        ? subreddit.safeIntervalDays
        : 1;
    return {
      safeIntervalMs: safeIntervalDays * MS_PER_DAY,
      subredditName: subreddit?.name ?? null,
    };
  }

  private resolveLastRunAt(record: OnDemandRecord): Date | null {
    return (
      record.lastCompletedAt ??
      record.lastAttemptAt ??
      record.lastEnqueuedAt ??
      null
    );
  }

  private resolveCooldownMs(
    record: OnDemandRecord,
    safeIntervalMs: number,
  ): number {
    if (record.lastOutcome === OnDemandOutcome.no_results) {
      const noResultsCooldown =
        Math.max(safeIntervalMs * TOP_RELEVANCE_REFRESH_MULTIPLIER, 0) || 0;
      const floorMs = NO_RESULTS_COOLDOWN_MIN_DAYS * MS_PER_DAY;
      return Math.max(noResultsCooldown, floorMs);
    }

    return safeIntervalMs;
  }

  private buildSortPlan(
    metadata: OnDemandMetadata,
    safeIntervalMs: number,
    configuredSorts: KeywordSearchSort[],
  ): KeywordSearchSortPlan[] {
    const sortHistory = this.getSortHistory(metadata);
    const safeIntervalDays = safeIntervalMs / MS_PER_DAY;
    const topRefreshMs = Math.max(
      safeIntervalMs * TOP_RELEVANCE_REFRESH_MULTIPLIER,
      TOP_RELEVANCE_MIN_DAYS * MS_PER_DAY,
    );
    const plan: KeywordSearchSortPlan[] = [];

    for (const sort of configuredSorts) {
      if (sort === 'new') {
        plan.push({ sort });
        continue;
      }

      if (sort === 'top' || sort === 'relevance') {
        const lastRunAt = this.getLastSortRun(sortHistory, sort);
        if (lastRunAt && Date.now() - lastRunAt.getTime() < topRefreshMs) {
          continue;
        }
        const isFirstRun = !lastRunAt;
        const timeFilter = isFirstRun
          ? 'year'
          : safeIntervalDays <= SHORT_SAFE_INTERVAL_DAYS
            ? 'month'
            : 'year';
        plan.push({
          sort,
          timeFilter,
          fallbackTimeFilter: timeFilter === 'month' ? 'year' : undefined,
          minResultsForFallback:
            timeFilter === 'month' ? FALLBACK_MIN_RESULTS : undefined,
        });
        continue;
      }

      plan.push({ sort });
    }

    return plan;
  }

  private getSortHistory(metadata: OnDemandMetadata): Record<
    string,
    {
      lastRunAt?: string;
      lastTimeFilter?: KeywordSearchSortPlan['timeFilter'];
    }
  > {
    const raw = metadata.sortHistory;
    if (!this.isRecord(raw)) {
      return {};
    }
    return { ...(raw as Record<string, any>) };
  }

  private getLastSortRun(
    sortHistory: Record<
      string,
      {
        lastRunAt?: string;
        lastTimeFilter?: KeywordSearchSortPlan['timeFilter'];
      }
    >,
    sort: KeywordSearchSort,
  ): Date | null {
    const entry = sortHistory[sort];
    if (!entry?.lastRunAt) {
      return null;
    }
    const parsed = Date.parse(entry.lastRunAt);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  private updateSortHistory(
    metadata: OnDemandMetadata,
    sortPlan: KeywordSearchSortPlan[],
  ): OnDemandMetadata {
    if (!sortPlan.length) {
      return metadata;
    }

    const updated = { ...metadata };
    const sortHistory = this.getSortHistory(metadata);
    const nowIso = new Date().toISOString();
    for (const planEntry of sortPlan) {
      sortHistory[planEntry.sort] = {
        lastRunAt: nowIso,
        lastTimeFilter: planEntry.timeFilter,
      };
    }
    updated.sortHistory = sortHistory;
    return updated;
  }

  private async shouldRunImmediately(
    record: OnDemandRecord,
    metadata: OnDemandMetadata,
    safeIntervalMs: number,
  ): Promise<QueueDecision> {
    const cooldownRaw = metadata.instantCooldownUntil;
    if (typeof cooldownRaw === 'string') {
      const cooldownUntil = Date.parse(cooldownRaw);
      if (!Number.isNaN(cooldownUntil) && cooldownUntil > Date.now()) {
        return { runNow: false, reason: 'cooldown_active' };
      }
    }

    const lastRunAt = this.resolveLastRunAt(record);
    const cooldownMs = this.resolveCooldownMs(record, safeIntervalMs);
    if (lastRunAt && Date.now() - lastRunAt.getTime() < cooldownMs) {
      return { runNow: false, reason: 'refresh_cooldown' };
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

  async estimateQueueDelayMs(): Promise<number | null> {
    try {
      const depth = await this.keywordSearchOrchestrator.getQueueDepth();
      const backlog =
        (depth.execution.waiting ?? 0) +
        (depth.execution.active ?? 0) +
        (depth.processing.waiting ?? 0) +
        (depth.processing.active ?? 0);
      const position = Math.max(1, backlog + 1);
      return position * this.estimatedJobMs;
    } catch (error) {
      this.logger.debug('Unable to estimate on-demand queue delay', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.estimatedJobMs;
    }
  }

  private async processPendingBacklog(): Promise<void> {
    const backlog = await this.prisma.onDemandRequest.findMany({
      where: {
        status: 'pending',
        locationKey: { not: 'global' },
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
        locationKey: true,
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
