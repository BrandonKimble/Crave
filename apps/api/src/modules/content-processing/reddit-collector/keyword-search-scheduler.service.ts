import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { CoverageSourceType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { stripGenericTokens } from '../../../shared/utils/generic-token-handling';
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { KeywordSliceSelectionService } from './keyword-slice-selection.service';
import type {
  KeywordSearchSortPlan,
  KeywordSearchTerm,
} from './keyword-search-orchestrator.service';

export interface KeywordSearchConfig {
  enabled: boolean;
  intervalDays: number;
}

export interface KeywordSearchSchedule {
  subreddit: string;
  collectionCoverageKey: string;
  safeIntervalDays: number;
  scheduledDate: Date;
  terms: KeywordSearchTerm[];
  sortPlan: KeywordSearchSortPlan[];
  lastTopRelevanceRunAt?: Date;
  status: 'pending' | 'scheduled' | 'completed' | 'failed';
  lastRun?: Date;
  nextRun: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOT_SPIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOT_SPIKE_ABSOLUTE_DISTINCT_USERS = 25;
const HOT_SPIKE_TREND_DISTINCT_USERS = 10;
const HOT_SPIKE_TREND_MULTIPLIER = 3;
const HOT_SPIKE_ATTEMPT_THROTTLE_MS = 6 * 60 * 60 * 1000;
const HOT_SPIKE_MAX_JOBS_PER_RUN = 10;

export interface HotSpikeKeywordCandidate {
  subreddit: string;
  collectionCoverageKey: string;
  safeIntervalDays: number;
  term: string;
  normalizedTerm: string;
  distinctUsersLast24h: number;
  distinctUsersPrev24h: number;
  lastSeenAt: Date;
  trigger: 'absolute' | 'trend';
  sortPlan: KeywordSearchSortPlan[];
}

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
  private readonly DEFAULT_CONFIG: KeywordSearchConfig = {
    enabled: true,
    intervalDays: 1,
  };

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sliceSelection: KeywordSliceSelectionService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
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

    // Initialize schedules for each coverage key (primary subreddit per key)
    const scheduleTargets = await this.loadActiveScheduleTargets();
    for (const target of scheduleTargets) {
      await this.initializeCoverageSchedule(target);
    }

    this.logger.info('Keyword search scheduling initialized', {
      nextRuns: this.getAllSchedules().map((schedule) => ({
        collectionCoverageKey: schedule.collectionCoverageKey,
        subreddit: schedule.subreddit,
        nextRun: schedule.nextRun,
      })),
    });
  }

  /**
   * Initialize keyword search schedule for a specific collection coverage key
   */
  private async initializeCoverageSchedule(target: {
    subreddit: string;
    collectionCoverageKey: string;
  }): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const subreddit = target.subreddit.trim();

    this.logger.info('Initializing keyword search schedule for coverage key', {
      correlationId,
      operation: 'initialize_subreddit_schedule',
      subreddit,
      collectionCoverageKey: target.collectionCoverageKey,
    });

    // Calculate next run date (first of next month + offset)
    const nextRun = this.calculateNextRunDate();

    const selection = await this.selectTermsForSubreddit({
      subreddit,
      collectionCoverageKeyHint: target.collectionCoverageKey,
    });
    const sortPlan = this.buildSortPlan({
      safeIntervalDays: selection.safeIntervalDays,
      runAt: nextRun,
    });

    const schedule: KeywordSearchSchedule = {
      subreddit,
      collectionCoverageKey: selection.collectionCoverageKey,
      safeIntervalDays: selection.safeIntervalDays,
      scheduledDate: nextRun,
      terms: selection.terms,
      sortPlan,
      status: 'pending',
      nextRun,
    };

    this.schedules.set(schedule.collectionCoverageKey, schedule);

    this.logger.info('Keyword search schedule initialized', {
      correlationId,
      subreddit,
      nextRun,
      termCount: selection.terms.length,
      collectionCoverageKey: selection.collectionCoverageKey,
      sortsPlanned: sortPlan.map((entry) => entry.sort),
      topTerms: selection.terms.slice(0, 5).map((term) => ({
        term: term.term,
        slice: term.slice ?? null,
        score: term.score ?? null,
      })),
    });
  }

  /**
   * Calculate next run date (first of next month + offset)
   */
  private calculateNextRunDate(baseDate?: Date | null): Date {
    const start = baseDate ? new Date(baseDate) : new Date();
    start.setDate(start.getDate() + this.config.intervalDays);
    return start;
  }

  private buildSortPlan(params: {
    safeIntervalDays: number;
    lastTopRelevanceRunAt?: Date;
    runAt?: Date;
    forceHeavy?: boolean;
  }): KeywordSearchSortPlan[] {
    const runAt =
      params.runAt instanceof Date && !Number.isNaN(params.runAt.getTime())
        ? params.runAt
        : new Date();
    const safeIntervalDays =
      Number.isFinite(params.safeIntervalDays) && params.safeIntervalDays > 0
        ? params.safeIntervalDays
        : 0;
    const thresholdDays = Math.max(safeIntervalDays * 3, 60);
    const thresholdMs = thresholdDays * MS_PER_DAY;

    const heavyDue =
      params.forceHeavy === true ||
      !params.lastTopRelevanceRunAt ||
      runAt.getTime() - params.lastTopRelevanceRunAt.getTime() >= thresholdMs;

    const sortPlan: KeywordSearchSortPlan[] = [{ sort: 'new' }];
    if (heavyDue) {
      sortPlan.push({ sort: 'relevance' }, { sort: 'top' });
    }

    return sortPlan;
  }

  /**
   * Check if any keyword searches are due
   */
  async checkDueSearches(): Promise<KeywordSearchSchedule[]> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const now = new Date();
    const dueSchedules: KeywordSearchSchedule[] = [];

    this.logger.debug('Checking for due keyword searches', {
      correlationId,
      operation: 'check_due_searches',
      currentTime: now,
    });

    for (const [scheduleKey, schedule] of this.schedules.entries()) {
      if (schedule.status !== 'scheduled' && now >= schedule.nextRun) {
        const selection = await this.selectTermsForSubreddit({
          subreddit: schedule.subreddit,
          collectionCoverageKeyHint: schedule.collectionCoverageKey,
        });
        schedule.collectionCoverageKey = selection.collectionCoverageKey;
        schedule.safeIntervalDays = selection.safeIntervalDays;
        schedule.terms = selection.terms;
        schedule.sortPlan = this.buildSortPlan({
          safeIntervalDays: schedule.safeIntervalDays,
          lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
          runAt: now,
        });

        this.logger.info('Keyword search is due', {
          correlationId,
          subreddit: schedule.subreddit,
          scheduledTime: schedule.nextRun,
          collectionCoverageKey: schedule.collectionCoverageKey,
          termCount: schedule.terms.length,
          sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
        });

        schedule.status = 'scheduled';
        if (schedule.collectionCoverageKey !== scheduleKey) {
          this.schedules.delete(scheduleKey);
        }
        this.schedules.set(schedule.collectionCoverageKey, schedule);
        dueSchedules.push(schedule);
      }
    }

    return dueSchedules;
  }

  async findHotSpikeCandidates(): Promise<HotSpikeKeywordCandidate[]> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    if (!this.config.enabled) {
      return [];
    }

    const now = new Date();
    const since48h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS * 2);
    const since24h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS);

    const scheduleByCoverageKey = new Map<string, KeywordSearchSchedule>();
    for (const schedule of this.schedules.values()) {
      if (schedule.status === 'scheduled') {
        continue;
      }
      if (!scheduleByCoverageKey.has(schedule.collectionCoverageKey)) {
        scheduleByCoverageKey.set(schedule.collectionCoverageKey, schedule);
      }
    }

    if (!scheduleByCoverageKey.size) {
      return [];
    }

    const rows = await this.prisma.onDemandRequestUser.findMany({
      where: { createdAt: { gte: since48h } },
      select: {
        userId: true,
        createdAt: true,
        request: {
          select: {
            locationKey: true,
            term: true,
          },
        },
      },
    });

    if (!rows.length) {
      return [];
    }

    const aggregates = new Map<
      string,
      {
        collectionCoverageKey: string;
        normalizedTerm: string;
        term: string;
        lastSeenAt: Date;
        last24Users: Set<string>;
        prev24Users: Set<string>;
      }
    >();

    for (const row of rows) {
      const request = row.request;
      const collectionCoverageKey = request.locationKey.trim().toLowerCase();
      if (!scheduleByCoverageKey.has(collectionCoverageKey)) {
        continue;
      }

      const stripped = stripGenericTokens(request.term);
      const term = stripped.text;
      const normalizedTerm = normalizeKeywordTerm(term);
      if (!normalizedTerm || stripped.isGenericOnly) {
        continue;
      }

      const key = `${collectionCoverageKey}::${normalizedTerm}`;
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          collectionCoverageKey,
          normalizedTerm,
          term,
          lastSeenAt: row.createdAt,
          last24Users: new Set(),
          prev24Users: new Set(),
        };
        aggregates.set(key, aggregate);
      }

      if (row.createdAt > aggregate.lastSeenAt) {
        aggregate.lastSeenAt = row.createdAt;
        aggregate.term = term;
      }

      if (row.createdAt >= since24h) {
        aggregate.last24Users.add(row.userId);
      } else {
        aggregate.prev24Users.add(row.userId);
      }
    }

    const candidates: HotSpikeKeywordCandidate[] = [];

    for (const aggregate of aggregates.values()) {
      const distinctUsersLast24h = aggregate.last24Users.size;
      const distinctUsersPrev24h = aggregate.prev24Users.size;

      const absoluteTrigger =
        distinctUsersLast24h >= HOT_SPIKE_ABSOLUTE_DISTINCT_USERS;
      const trendTrigger =
        distinctUsersLast24h >= HOT_SPIKE_TREND_DISTINCT_USERS &&
        distinctUsersLast24h >=
          distinctUsersPrev24h * HOT_SPIKE_TREND_MULTIPLIER;

      if (!absoluteTrigger && !trendTrigger) {
        continue;
      }

      const schedule = scheduleByCoverageKey.get(
        aggregate.collectionCoverageKey,
      );
      if (!schedule) {
        continue;
      }

      candidates.push({
        subreddit: schedule.subreddit,
        collectionCoverageKey: schedule.collectionCoverageKey,
        safeIntervalDays: schedule.safeIntervalDays,
        term: aggregate.term,
        normalizedTerm: aggregate.normalizedTerm,
        distinctUsersLast24h,
        distinctUsersPrev24h,
        lastSeenAt: aggregate.lastSeenAt,
        trigger: absoluteTrigger ? 'absolute' : 'trend',
        sortPlan: this.buildSortPlan({
          safeIntervalDays: schedule.safeIntervalDays,
          lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
          runAt: now,
          forceHeavy: true,
        }),
      });
    }

    if (!candidates.length) {
      return [];
    }

    const historyRows = await this.prisma.keywordAttemptHistory.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          collectionCoverageKey: candidate.collectionCoverageKey,
          normalizedTerm: candidate.normalizedTerm,
        })),
      },
      select: {
        collectionCoverageKey: true,
        normalizedTerm: true,
        lastAttemptAt: true,
      },
    });

    const historyMap = new Map<string, Date | null>(
      historyRows.map((row) => [
        `${row.collectionCoverageKey}::${row.normalizedTerm}`,
        row.lastAttemptAt,
      ]),
    );

    const eligible = candidates
      .filter((candidate) => {
        const lastAttemptAt = historyMap.get(
          `${candidate.collectionCoverageKey}::${candidate.normalizedTerm}`,
        );
        if (!lastAttemptAt) {
          return true;
        }
        return (
          now.getTime() - lastAttemptAt.getTime() >=
          HOT_SPIKE_ATTEMPT_THROTTLE_MS
        );
      })
      .sort(
        (a, b) =>
          b.distinctUsersLast24h - a.distinctUsersLast24h ||
          b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
      );

    const final: HotSpikeKeywordCandidate[] = [];
    const seenCoverageKeys = new Set<string>();

    for (const candidate of eligible) {
      if (seenCoverageKeys.has(candidate.collectionCoverageKey)) {
        continue;
      }
      seenCoverageKeys.add(candidate.collectionCoverageKey);
      final.push(candidate);
      if (final.length >= HOT_SPIKE_MAX_JOBS_PER_RUN) {
        break;
      }
    }

    if (final.length) {
      this.logger.info('Identified hot spike keyword candidates', {
        correlationId,
        count: final.length,
        candidates: final.slice(0, 10).map((candidate) => ({
          subreddit: candidate.subreddit,
          collectionCoverageKey: candidate.collectionCoverageKey,
          normalizedTerm: candidate.normalizedTerm,
          distinctUsersLast24h: candidate.distinctUsersLast24h,
          distinctUsersPrev24h: candidate.distinctUsersPrev24h,
          trigger: candidate.trigger,
        })),
      });
    }

    return final;
  }

  /**
   * Mark keyword search as completed and schedule next run
   */
  async markSearchCompleted(
    collectionCoverageKey: string,
    success: boolean,
    termsProcessed?: number,
  ): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const scheduleKey = collectionCoverageKey.trim().toLowerCase();
    const schedule = this.schedules.get(scheduleKey);

    if (!schedule) {
      this.logger.warn('Attempted to mark completion for unknown schedule', {
        correlationId,
        collectionCoverageKey: scheduleKey,
        success,
      });
      return;
    }

    schedule.status = success ? 'completed' : 'failed';
    schedule.lastRun = new Date();
    schedule.nextRun = this.calculateNextRunDate(schedule.lastRun);

    const ranHeavySorts = schedule.sortPlan.some(
      (entry) => entry.sort === 'top' || entry.sort === 'relevance',
    );
    if (success && ranHeavySorts) {
      schedule.lastTopRelevanceRunAt = schedule.lastRun;
    }

    const selection = await this.selectTermsForSubreddit({
      subreddit: schedule.subreddit,
      collectionCoverageKeyHint: schedule.collectionCoverageKey,
    });
    schedule.collectionCoverageKey = selection.collectionCoverageKey;
    schedule.safeIntervalDays = selection.safeIntervalDays;
    schedule.terms = selection.terms;
    schedule.sortPlan = this.buildSortPlan({
      safeIntervalDays: schedule.safeIntervalDays,
      lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
      runAt: schedule.nextRun,
    });

    if (schedule.collectionCoverageKey !== scheduleKey) {
      this.schedules.delete(scheduleKey);
    }
    this.schedules.set(schedule.collectionCoverageKey, schedule);

    this.logger.info('Keyword search marked as completed', {
      correlationId,
      subreddit: schedule.subreddit,
      success,
      termsProcessed,
      nextRun: schedule.nextRun,
      collectionCoverageKey: schedule.collectionCoverageKey,
      newTermCount: schedule.terms.length,
      sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
    });
  }

  recordTopRelevanceRun(collectionCoverageKey: string, executedAt: Date): void {
    const scheduleKey = collectionCoverageKey.trim().toLowerCase();
    const schedule = this.schedules.get(scheduleKey);
    if (!schedule) {
      return;
    }

    const safeExecutedAt =
      executedAt instanceof Date && !Number.isNaN(executedAt.getTime())
        ? executedAt
        : new Date();

    schedule.lastTopRelevanceRunAt = safeExecutedAt;
    schedule.sortPlan = this.buildSortPlan({
      safeIntervalDays: schedule.safeIntervalDays,
      lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
      runAt: schedule.nextRun,
    });

    this.schedules.set(scheduleKey, schedule);

    this.logger.debug('Recorded top/relevance run for schedule', {
      subreddit: schedule.subreddit,
      collectionCoverageKey: schedule.collectionCoverageKey,
      executedAt: safeExecutedAt,
      sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
    });
  }

  /**
   * Get current schedules for all coverage keys
   */
  getAllSchedules(): KeywordSearchSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedule for specific coverage key
   */
  getSchedule(
    collectionCoverageKey: string,
  ): KeywordSearchSchedule | undefined {
    return this.schedules.get(collectionCoverageKey.trim().toLowerCase());
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): KeywordSearchConfig {
    return { ...this.config };
  }

  private async selectTermsForSubreddit(params: {
    subreddit: string;
    collectionCoverageKeyHint?: string | null;
  }): Promise<{
    collectionCoverageKey: string;
    safeIntervalDays: number;
    terms: KeywordSearchTerm[];
  }> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const subreddit = params.subreddit.trim();
    const fallbackCoverageKey = params.collectionCoverageKeyHint
      ? params.collectionCoverageKeyHint.trim().toLowerCase()
      : subreddit.trim().toLowerCase();

    try {
      const selection =
        await this.sliceSelection.selectTermsForSubreddit(subreddit);

      return {
        collectionCoverageKey: selection.collectionCoverageKey,
        safeIntervalDays: selection.safeIntervalDays,
        terms: selection.terms,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to select keyword terms for schedule', {
        correlationId,
        subreddit,
        collectionCoverageKey: fallbackCoverageKey,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : { message: String(error) },
      });

      return {
        collectionCoverageKey: fallbackCoverageKey,
        safeIntervalDays: 7,
        terms: [],
      };
    }
  }

  /**
   * Load configuration from environment/config service
   */
  private loadConfiguration(): KeywordSearchConfig {
    const enabledRaw = this.configService.get<string>('KEYWORD_SEARCH_ENABLED');
    const enabled = enabledRaw
      ? enabledRaw.toLowerCase() === 'true'
      : this.DEFAULT_CONFIG.enabled;

    const intervalDays = this.parseNumberEnv(
      'KEYWORD_SEARCH_INTERVAL_DAYS',
      this.DEFAULT_CONFIG.intervalDays,
    );

    return {
      enabled,
      intervalDays,
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

  private async loadActiveScheduleTargets(): Promise<
    Array<{ subreddit: string; collectionCoverageKey: string }>
  > {
    const records = await this.prisma.coverageArea.findMany({
      where: { isActive: true, sourceType: CoverageSourceType.all },
      select: { name: true, coverageKey: true },
      orderBy: { name: 'asc' },
    });

    const schedulesByCoverageKey = new Map<
      string,
      { subreddit: string; collectionCoverageKey: string }
    >();

    for (const record of records) {
      const collectionCoverageKey = this.buildCollectionCoverageKey(record);
      if (!schedulesByCoverageKey.has(collectionCoverageKey)) {
        schedulesByCoverageKey.set(collectionCoverageKey, {
          subreddit: record.name,
          collectionCoverageKey,
        });
      }
    }

    return Array.from(schedulesByCoverageKey.values());
  }

  private buildCollectionCoverageKey(record: {
    name: string;
    coverageKey: string | null;
  }): string {
    const rawKey =
      typeof record.coverageKey === 'string' && record.coverageKey.trim()
        ? record.coverageKey
        : record.name;
    return rawKey.trim().toLowerCase();
  }
}
