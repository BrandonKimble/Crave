import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SearchDemandService } from '../../analytics/search-demand.service';
import { ScheduledCollectionExceptionFactory } from './scheduled-collection.exceptions';
import {
  EntityPrioritySelectionService,
  EntityPriorityScore,
} from './entity-priority-selection.service';

export interface KeywordSearchConfig {
  enabled: boolean;
  entityCount: number;
  intervalDays: number;
  searchLimit: number;
  cityWindowDays: number;
  cityMinImpressions: number;
}

export interface KeywordSearchSchedule {
  subreddit: string;
  scheduledDate: Date;
  entities: EntityPriorityScore[];
  status: 'pending' | 'scheduled' | 'completed' | 'failed';
  lastRun?: Date;
  nextRun: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const KEYWORD_ENTITY_TYPES: EntityType[] = [
  'restaurant',
  'food',
  'food_attribute',
  'restaurant_attribute',
];

type CoverageKeyRecord = {
  coverageKey: string | null;
  name: string;
} | null;

/**
 * Keyword Search Scheduler Service
 *
 * Implements PRD Section 5.1.2: Monthly keyword entity search cycles with offset timing
 * and priority scoring algorithm. Handles targeted historical enrichment for specific
 * entities across all timeframes to fill gaps in chronological collection.
 *
 * Key responsibilities:
 * - Calculate entity priority scores based on data recency, quality, and user demand
 * - Schedule monthly keyword searches with proper offset from chronological collection
 * - Select top 20-30 entities monthly using priority scoring algorithm
 * - Coordinate with chronological collection to distribute API usage
 * - Handle entity type coverage (restaurants, food, attributes)
 * - Track enrichment history and effectiveness
 *
 * Note: This service provides the foundation for keyword search scheduling.
 * Full implementation depends on entity priority scoring from M05 (Basic Ranking & Scoring).
 * For M03, it establishes the scheduling framework and basic entity selection.
 */
@Injectable()
export class KeywordSearchSchedulerService implements OnModuleInit {
  private logger!: LoggerService;
  private config!: KeywordSearchConfig;
  private schedules = new Map<string, KeywordSearchSchedule>();
  private readonly coverageKeyCache = new Map<string, string>();
  // Default configuration following PRD requirements
  private readonly DEFAULT_CONFIG: KeywordSearchConfig = {
    enabled: true,
    entityCount: 25,
    intervalDays: 7,
    searchLimit: 1000,
    cityWindowDays: 14,
    cityMinImpressions: 5,
  };

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly entityPriorityService: EntityPrioritySelectionService,
    private readonly prisma: PrismaService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly demandService: SearchDemandService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordSearchScheduler');
    this.config = this.loadConfiguration();
  }

  /**
   * Initialize keyword search scheduling for all configured subreddits
   */
  async initializeScheduling(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Initializing keyword search scheduling', {
      correlationId,
      operation: 'initialize_keyword_scheduling',
      config: this.config,
    });

    if (!this.config.enabled) {
      this.logger.warn('Keyword search scheduling is disabled');
      return;
    }

    // Initialize schedules for each subreddit
    const subreddits = await this.loadActiveSubreddits();
    for (const subreddit of subreddits) {
      await this.initializeSubredditSchedule(subreddit);
    }

    this.logger.info('Keyword search scheduling initialized', {
      nextRuns: this.getAllSchedules().map((schedule) => ({
        subreddit: schedule.subreddit,
        nextRun: schedule.nextRun,
      })),
    });
  }

  /**
   * Initialize keyword search schedule for a specific subreddit
   */
  private async initializeSubredditSchedule(subreddit: string): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Initializing keyword search schedule for subreddit', {
      correlationId,
      operation: 'initialize_subreddit_schedule',
      subreddit,
    });

    // Calculate next run date (first of next month + offset)
    const nextRun = this.calculateNextRunDate();

    // Get priority entities for this subreddit
    const entities = await this.calculateEntityPriorities(subreddit);

    const schedule: KeywordSearchSchedule = {
      subreddit,
      scheduledDate: nextRun,
      entities,
      status: 'pending',
      nextRun,
    };

    this.schedules.set(subreddit, schedule);

    this.logger.info('Keyword search schedule initialized', {
      correlationId,
      subreddit,
      nextRun,
      entityCount: entities.length,
      topEntities: entities
        .slice(0, 5)
        .map((e) => ({ name: e.entityName, score: e.score })),
    });
  }

  /**
   * Calculate entity priority scores using PRD algorithm
   *
   * PRD factors:
   * - Data recency (days since last enrichment, new entity status)
   * - Data quality (mention count, source diversity)
   * - User demand (query frequency, high-potential entities)
   */
  private async calculateEntityPriorities(
    subreddit: string,
  ): Promise<EntityPriorityScore[]> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Calculating entity priority scores', {
      correlationId,
      operation: 'calculate_entity_priorities',
      subreddit,
    });

    try {
      const since = new Date(
        Date.now() - this.config.cityWindowDays * MS_PER_DAY,
      );
      const locationKey = await this.resolveCoverageKey(subreddit);
      const demand = await this.demandService.getTopEntitiesForLocation({
        locationKey,
        since,
        entityTypes: KEYWORD_ENTITY_TYPES,
        minImpressions: this.config.cityMinImpressions,
        limit: this.config.entityCount * 3,
      });

      if (!demand.length) {
        this.logger.debug('No city-specific demand found for subreddit', {
          subreddit,
        });
        return [];
      }

      const demandIds = new Set(demand.map((record) => record.entityId));
      const prioritizedEntities =
        await this.entityPriorityService.selectTopPriorityEntities({
          maxEntities: this.config.entityCount * 4,
        });

      const filtered = prioritizedEntities.filter((entity) =>
        demandIds.has(entity.entityId),
      );

      this.logger.info('Entity priority scores calculated', {
        correlationId,
        subreddit,
        selectedCount: filtered.length,
        locationDemand: demand.length,
        topEntities: filtered.slice(0, 5).map((e) => ({
          name: e.entityName,
          type: e.entityType,
          score: e.score,
        })),
      });

      return filtered.slice(0, this.config.entityCount);
    } catch (error: unknown) {
      this.logger.error('Failed to calculate entity priority scores', {
        correlationId,
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to empty array if priority calculation fails
      // In production, this might warrant alerting or alternative handling
      return [];
    }
  }

  private async resolveCoverageKey(subreddit: string): Promise<string> {
    const normalized = subreddit.trim().toLowerCase();
    if (!normalized) {
      return subreddit;
    }

    const cached = this.coverageKeyCache.get(normalized);
    if (cached) {
      return cached;
    }

    const record = (await this.prisma.subreddit.findFirst({
      where: {
        name: {
          equals: subreddit,
          mode: 'insensitive',
        },
      },
      select: { coverageKey: true, name: true },
    })) as CoverageKeyRecord;

    const resolved =
      typeof record?.coverageKey === 'string' && record.coverageKey.trim()
        ? record.coverageKey.trim().toLowerCase()
        : record?.name
        ? record.name.trim().toLowerCase()
        : normalized;

    this.coverageKeyCache.set(normalized, resolved);
    return resolved;
  }

  /**
   * Calculate next run date (first of next month + offset)
   */
  private calculateNextRunDate(baseDate?: Date | null): Date {
    const start = baseDate ? new Date(baseDate) : new Date();
    start.setDate(start.getDate() + this.config.intervalDays);
    return start;
  }

  /**
   * Check if any keyword searches are due
   */
  checkDueSearches(): KeywordSearchSchedule[] {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const now = new Date();
    const dueSchedules: KeywordSearchSchedule[] = [];

    this.logger.debug('Checking for due keyword searches', {
      correlationId,
      operation: 'check_due_searches',
      currentTime: now,
    });

    for (const [subreddit, schedule] of this.schedules.entries()) {
      if (schedule.status === 'pending' && now >= schedule.nextRun) {
        this.logger.info('Keyword search is due', {
          correlationId,
          subreddit,
          scheduledTime: schedule.nextRun,
          entityCount: schedule.entities.length,
        });

        schedule.status = 'scheduled';
        this.schedules.set(subreddit, schedule);
        dueSchedules.push(schedule);
      }
    }

    return dueSchedules;
  }

  /**
   * Mark keyword search as completed and schedule next run
   */
  async markSearchCompleted(
    subreddit: string,
    success: boolean,
    entitiesProcessed?: number,
  ): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const schedule = this.schedules.get(subreddit);

    if (!schedule) {
      this.logger.warn('Attempted to mark completion for unknown schedule', {
        correlationId,
        subreddit,
        success,
      });
      return;
    }

    schedule.status = success ? 'completed' : 'failed';
    schedule.lastRun = new Date();
    schedule.nextRun = this.calculateNextRunDate(schedule.lastRun);

    // Refresh entity priorities for next run
    schedule.entities = await this.calculateEntityPriorities(subreddit);

    this.schedules.set(subreddit, schedule);

    this.logger.info('Keyword search marked as completed', {
      correlationId,
      subreddit,
      success,
      entitiesProcessed,
      nextRun: schedule.nextRun,
      newEntityCount: schedule.entities.length,
    });
  }

  /**
   * Get current schedules for all subreddits
   */
  getAllSchedules(): KeywordSearchSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedule for specific subreddit
   */
  getSchedule(subreddit: string): KeywordSearchSchedule | undefined {
    return this.schedules.get(subreddit);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): KeywordSearchConfig {
    return { ...this.config };
  }

  /**
   * Force refresh entity priorities for a subreddit
   */
  async refreshEntityPriorities(subreddit: string): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Refreshing entity priorities', {
      correlationId,
      operation: 'refresh_entity_priorities',
      subreddit,
    });

    const schedule = this.schedules.get(subreddit);
    if (!schedule) {
      throw ScheduledCollectionExceptionFactory.missingSubredditConfig(
        subreddit,
      );
    }

    const newEntities = await this.calculateEntityPriorities(subreddit);
    schedule.entities = newEntities;
    this.schedules.set(subreddit, schedule);

    this.logger.info('Entity priorities refreshed', {
      correlationId,
      subreddit,
      entityCount: newEntities.length,
      averageScore:
        newEntities.reduce((sum, e) => sum + e.score, 0) / newEntities.length,
    });
  }

  stopScheduling(): void {
    this.logger.info('Stopping keyword search scheduler', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      operation: 'stop_scheduler',
    });
  }

  /**
   * Get entity type distribution for logging
   */
  private getEntityTypeDistribution(
    entities: EntityPriorityScore[],
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const entity of entities) {
      distribution[entity.entityType] =
        (distribution[entity.entityType] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Load configuration from environment/config service
   */
  private loadConfiguration(): KeywordSearchConfig {
    const enabledRaw = this.configService.get<string>('KEYWORD_SEARCH_ENABLED');
    const enabled = enabledRaw
      ? enabledRaw.toLowerCase() === 'true'
      : this.DEFAULT_CONFIG.enabled;

    const entityCount = this.parseNumberEnv(
      'KEYWORD_SEARCH_ENTITY_COUNT',
      this.DEFAULT_CONFIG.entityCount,
    );

    const intervalDays = this.parseNumberEnv(
      'KEYWORD_SEARCH_INTERVAL_DAYS',
      this.DEFAULT_CONFIG.intervalDays,
    );

    const searchLimit = this.parseNumberEnv(
      'KEYWORD_SEARCH_LIMIT',
      this.DEFAULT_CONFIG.searchLimit,
    );

    const cityWindowDays = this.parseNumberEnv(
      'KEYWORD_CITY_DEMAND_WINDOW_DAYS',
      this.DEFAULT_CONFIG.cityWindowDays,
    );
    const cityMinImpressions = this.parseNumberEnv(
      'KEYWORD_CITY_MIN_IMPRESSIONS',
      this.DEFAULT_CONFIG.cityMinImpressions,
    );

    return {
      enabled,
      entityCount,
      intervalDays,
      searchLimit,
      cityWindowDays,
      cityMinImpressions,
    };
  }

  private parseNumberEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
  private async loadActiveSubreddits(): Promise<string[]> {
    const records = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return records.map((row) => row.name);
  }
}
