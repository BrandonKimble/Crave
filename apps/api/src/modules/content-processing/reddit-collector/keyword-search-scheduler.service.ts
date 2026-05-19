import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { stripGenericTokens } from '../../../shared/utils/generic-token-handling';
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { KeywordSliceSelectionService } from './keyword-slice-selection.service';
import { MarketRegistryService } from '../../markets/market-registry.service';
import { DemandScoringTraceService } from '../../analytics/demand-scoring-trace.service';
import {
  DemandScoringConsumerKind,
  DemandScoringDecisionState,
  DemandSubjectKind,
  KeywordAttemptOutcome,
  OnDemandReason,
  Prisma,
} from '@prisma/client';
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
  collectableMarketKey: string;
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
const HOT_SPIKE_LOOKBACK_MS = HOT_SPIKE_WINDOW_MS * 8;
const HOT_SPIKE_BASELINE_DAYS = 7;
const HOT_SPIKE_NO_RESULTS_RECOVERY_DAYS = 45;
const HOT_SPIKE_RESURGENCE_CREDIT_DAYS = 21;
const HOT_SPIKE_RESURGENCE_CREDIT_RATE = 0.35;
const HOT_SPIKE_TREND_BOOST_RATE = 0.7;
const HOT_SPIKE_TREND_BOOST_MAX = 2.5;
const HOT_SPIKE_MAX_JOBS_PER_RUN = 10;
const HOT_SPIKE_MIN_SELECTABLE_ATTEMPT_AVAILABILITY = 0.01;
const HOT_SPIKE_SCORER_VERSION = 'on-demand-hot-spike-v1';

export interface HotSpikeKeywordCandidate {
  subreddit: string;
  collectableMarketKey: string;
  safeIntervalDays: number;
  term: string;
  normalizedTerm: string;
  distinctUsersLast24h: number;
  distinctUsersPrev24h: number;
  lastSeenAt: Date;
  trigger: 'priority' | 'trend';
  priorityScore: number;
  trendBoost: number;
  attemptAvailability: number;
  sortPlan: KeywordSearchSortPlan[];
}

interface HotSpikeAggregate {
  collectableMarketKey: string;
  normalizedTerm: string;
  term: string;
  lastSeenAt: Date;
  last24ByUser: Map<string, number>;
  prev24ByUser: Map<string, number>;
  rollingByUser: Map<string, number>;
}

interface HotSpikeScoredCandidate extends HotSpikeKeywordCandidate {
  baseScore24h: number;
  previous24hScore: number;
  rollingBaselineScore: number;
  surgeRatio: number;
  surgeUnits: number;
  resurgenceCreditDays: number;
  factorBreakdown: Prisma.JsonObject;
}

/**
 * Keyword Search Scheduler Service
 *
 * Implements keyword collection cycles with offset timing and demand-aware
 * priority scoring. Handles targeted historical enrichment for specific terms
 * across all timeframes to fill gaps in chronological collection.
 *
 * Key responsibilities:
 * - Calculate keyword collection priority from recency, quality, and user demand
 * - Schedule keyword searches with proper offset from chronological collection
 * - Select top terms using the keyword collection priority planner
 * - Coordinate with chronological collection to distribute API usage
 * - Handle entity type coverage (restaurants, food, attributes)
 * - Track enrichment history and effectiveness
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
    private readonly marketRegistry: MarketRegistryService,
    private readonly scoringTrace: DemandScoringTraceService,
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

    // Initialize schedules for each market key (primary subreddit per key)
    const scheduleTargets = await this.loadActiveScheduleTargets();
    for (const target of scheduleTargets) {
      await this.initializeMarketSchedule(target);
    }

    this.logger.info('Keyword search scheduling initialized', {
      nextRuns: this.getAllSchedules().map((schedule) => ({
        collectableMarketKey: schedule.collectableMarketKey,
        subreddit: schedule.subreddit,
        nextRun: schedule.nextRun,
      })),
    });
  }

  /**
   * Initialize keyword search schedule for a specific collection market key
   */
  private async initializeMarketSchedule(target: {
    subreddit: string;
    collectableMarketKey: string;
  }): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const subreddit = target.subreddit.trim();

    this.logger.info('Initializing keyword search schedule for market key', {
      correlationId,
      operation: 'initialize_subreddit_schedule',
      subreddit,
      collectableMarketKey: target.collectableMarketKey,
    });

    // Calculate next run date (first of next month + offset)
    const nextRun = this.calculateNextRunDate();

    const selection = await this.selectTermsForSubreddit({
      subreddit,
      collectableMarketKeyHint: target.collectableMarketKey,
    });
    const sortPlan = this.buildSortPlan({
      safeIntervalDays: selection.safeIntervalDays,
      runAt: nextRun,
    });

    const schedule: KeywordSearchSchedule = {
      subreddit,
      collectableMarketKey: selection.collectableMarketKey,
      safeIntervalDays: selection.safeIntervalDays,
      scheduledDate: nextRun,
      terms: selection.terms,
      sortPlan,
      status: 'pending',
      nextRun,
    };

    this.schedules.set(schedule.collectableMarketKey, schedule);

    this.logger.info('Keyword search schedule initialized', {
      correlationId,
      subreddit,
      nextRun,
      termCount: selection.terms.length,
      collectableMarketKey: selection.collectableMarketKey,
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
          collectableMarketKeyHint: schedule.collectableMarketKey,
        });
        schedule.collectableMarketKey = selection.collectableMarketKey;
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
          collectableMarketKey: schedule.collectableMarketKey,
          termCount: schedule.terms.length,
          sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
        });

        schedule.status = 'scheduled';
        if (schedule.collectableMarketKey !== scheduleKey) {
          this.schedules.delete(scheduleKey);
        }
        this.schedules.set(schedule.collectableMarketKey, schedule);
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
    const sinceLookback = new Date(now.getTime() - HOT_SPIKE_LOOKBACK_MS);
    const since24h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS);
    const since48h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS * 2);

    const scheduleByMarketKey = new Map<string, KeywordSearchSchedule>();
    for (const schedule of this.schedules.values()) {
      if (schedule.status === 'scheduled') {
        continue;
      }
      if (!scheduleByMarketKey.has(schedule.collectableMarketKey)) {
        scheduleByMarketKey.set(schedule.collectableMarketKey, schedule);
      }
    }

    if (!scheduleByMarketKey.size) {
      return [];
    }

    const rows = await this.prisma.onDemandAskEvent.findMany({
      where: { askedAt: { gte: sinceLookback } },
      select: {
        askEventId: true,
        userId: true,
        askedAt: true,
        marketKey: true,
        collectableMarketKey: true,
        term: true,
        reason: true,
        resultRestaurantCount: true,
        resultFoodCount: true,
      },
    });

    if (!rows.length) {
      return [];
    }

    const aggregates = new Map<string, HotSpikeAggregate>();

    for (const row of rows) {
      const collectableMarketKey = row.collectableMarketKey
        ?.trim()
        .toLowerCase();
      if (!collectableMarketKey) {
        continue;
      }
      if (!scheduleByMarketKey.has(collectableMarketKey)) {
        continue;
      }

      const stripped = stripGenericTokens(row.term);
      const term = stripped.text;
      const normalizedTerm = normalizeKeywordTerm(term);
      if (!normalizedTerm || stripped.isGenericOnly) {
        continue;
      }

      const key = `${collectableMarketKey}::${normalizedTerm}`;
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          collectableMarketKey,
          normalizedTerm,
          term,
          lastSeenAt: row.askedAt,
          last24ByUser: new Map(),
          prev24ByUser: new Map(),
          rollingByUser: new Map(),
        };
        aggregates.set(key, aggregate);
      }
      const current = aggregate;

      if (row.askedAt > current.lastSeenAt) {
        current.lastSeenAt = row.askedAt;
        current.term = term;
      }

      const userKey = row.userId ?? row.askEventId;
      const severity = this.calculateOnDemandSeverity({
        reason: row.reason,
        resultRestaurantCount: row.resultRestaurantCount,
        resultFoodCount: row.resultFoodCount,
      });
      if (row.askedAt >= since24h) {
        this.addWeightedAsk(current.last24ByUser, userKey, severity);
      } else if (row.askedAt >= since48h) {
        this.addWeightedAsk(current.prev24ByUser, userKey, severity);
      } else {
        this.addWeightedAsk(current.rollingByUser, userKey, severity);
      }
    }

    const rawCandidates: HotSpikeScoredCandidate[] = [];

    for (const aggregate of aggregates.values()) {
      const baseScore24h = this.logScaledUserScore(aggregate.last24ByUser);
      if (baseScore24h <= 0) {
        continue;
      }
      const schedule = scheduleByMarketKey.get(aggregate.collectableMarketKey);
      if (!schedule) {
        continue;
      }

      const previous24hScore = this.logScaledUserScore(aggregate.prev24ByUser);
      const rollingBaselineScore =
        this.logScaledUserScore(aggregate.rollingByUser) /
        Math.max(1, HOT_SPIKE_BASELINE_DAYS - 1);
      const baselineScore = Math.max(previous24hScore, rollingBaselineScore, 3);
      const surgeRatio = baseScore24h / baselineScore;
      const surgeUnits = Math.max(0, Math.log2(Math.max(surgeRatio, 0)) - 1);
      const trendBoost = Math.min(
        HOT_SPIKE_TREND_BOOST_MAX,
        1 + 1.5 * (1 - Math.exp(-HOT_SPIKE_TREND_BOOST_RATE * surgeUnits)),
      );
      const resurgenceCreditDays =
        HOT_SPIKE_RESURGENCE_CREDIT_DAYS *
        (1 - Math.exp(-HOT_SPIKE_RESURGENCE_CREDIT_RATE * surgeUnits));

      rawCandidates.push({
        subreddit: schedule.subreddit,
        collectableMarketKey: schedule.collectableMarketKey,
        safeIntervalDays: schedule.safeIntervalDays,
        term: aggregate.term,
        normalizedTerm: aggregate.normalizedTerm,
        distinctUsersLast24h: aggregate.last24ByUser.size,
        distinctUsersPrev24h: aggregate.prev24ByUser.size,
        lastSeenAt: aggregate.lastSeenAt,
        trigger: surgeUnits > 0 ? 'trend' : 'priority',
        priorityScore: baseScore24h * trendBoost,
        baseScore24h,
        previous24hScore,
        rollingBaselineScore,
        surgeRatio,
        surgeUnits,
        resurgenceCreditDays,
        trendBoost,
        attemptAvailability: 1,
        factorBreakdown: {
          baseScore24h,
          previous24hScore,
          rollingBaselineScore,
          baselineScore,
          surgeRatio,
          surgeUnits,
          trendBoost,
          resurgenceCreditDays,
          scorerVersion: HOT_SPIKE_SCORER_VERSION,
        },
        sortPlan: this.buildSortPlan({
          safeIntervalDays: schedule.safeIntervalDays,
          lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
          runAt: now,
          forceHeavy: true,
        }),
      });
    }

    if (!rawCandidates.length) {
      return [];
    }

    const historyRows = await this.prisma.keywordAttemptHistory.findMany({
      where: {
        OR: rawCandidates.map((candidate) => ({
          collectableMarketKey: candidate.collectableMarketKey,
          normalizedTerm: candidate.normalizedTerm,
        })),
      },
      select: {
        collectableMarketKey: true,
        normalizedTerm: true,
        lastAttemptAt: true,
        lastOutcome: true,
      },
    });

    const historyMap = new Map<
      string,
      { lastAttemptAt: Date | null; lastOutcome: KeywordAttemptOutcome | null }
    >(
      historyRows.map((row) => [
        `${row.collectableMarketKey}::${row.normalizedTerm}`,
        {
          lastAttemptAt: row.lastAttemptAt,
          lastOutcome: row.lastOutcome,
        },
      ]),
    );

    const scoredCandidates = rawCandidates
      .map((candidate) => {
        const history = historyMap.get(
          `${candidate.collectableMarketKey}::${candidate.normalizedTerm}`,
        );
        const attemptAvailability = this.calculateAttemptAvailability({
          now,
          lastAttemptAt: history?.lastAttemptAt ?? null,
          lastOutcome: history?.lastOutcome ?? null,
          resurgenceCreditDays: candidate.resurgenceCreditDays,
        });
        const selectableAttemptAvailability =
          attemptAvailability >= HOT_SPIKE_MIN_SELECTABLE_ATTEMPT_AVAILABILITY
            ? attemptAvailability
            : 0;
        const priorityScore =
          candidate.baseScore24h *
          candidate.trendBoost *
          selectableAttemptAvailability;
        return {
          ...candidate,
          priorityScore,
          attemptAvailability: selectableAttemptAvailability,
          factorBreakdown: {
            ...candidate.factorBreakdown,
            rawAttemptAvailability: attemptAvailability,
            attemptAvailability: selectableAttemptAvailability,
            minSelectableAttemptAvailability:
              HOT_SPIKE_MIN_SELECTABLE_ATTEMPT_AVAILABILITY,
            priorityScore,
            lastAttemptAt: history?.lastAttemptAt?.toISOString() ?? null,
            lastOutcome: history?.lastOutcome ?? null,
          },
        };
      })
      .sort(
        (a, b) =>
          b.priorityScore - a.priorityScore ||
          b.baseScore24h - a.baseScore24h ||
          b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
      );

    const selectableCandidates = scoredCandidates.filter(
      (candidate) =>
        candidate.priorityScore > 0 && candidate.attemptAvailability > 0,
    );
    const final = selectableCandidates.slice(0, HOT_SPIKE_MAX_JOBS_PER_RUN);

    if (final.length) {
      this.logger.info('Identified hot spike keyword candidates', {
        correlationId,
        count: final.length,
        candidates: final.slice(0, 10).map((candidate) => ({
          subreddit: candidate.subreddit,
          collectableMarketKey: candidate.collectableMarketKey,
          normalizedTerm: candidate.normalizedTerm,
          distinctUsersLast24h: candidate.distinctUsersLast24h,
          distinctUsersPrev24h: candidate.distinctUsersPrev24h,
          trigger: candidate.trigger,
          priorityScore: candidate.priorityScore,
          trendBoost: candidate.trendBoost,
          attemptAvailability: candidate.attemptAvailability,
        })),
      });
    }

    await this.traceHotSpikeSelection({
      now,
      selected: final,
      candidatePool: scoredCandidates,
    });

    return final;
  }

  private addWeightedAsk(
    target: Map<string, number>,
    userKey: string,
    severity: number,
  ): void {
    target.set(userKey, (target.get(userKey) ?? 0) + severity);
  }

  private logScaledUserScore(userWeights: Map<string, number>): number {
    let score = 0;
    for (const weight of userWeights.values()) {
      if (weight > 0) {
        score += Math.log2(1 + weight);
      }
    }
    return score;
  }

  private calculateOnDemandSeverity(params: {
    reason: OnDemandReason;
    resultRestaurantCount: number | null;
    resultFoodCount: number | null;
  }): number {
    if (params.reason === OnDemandReason.unresolved) {
      return 1;
    }
    const targetCount = this.resolveOnDemandTargetCount();
    const resultCount =
      typeof params.resultRestaurantCount === 'number'
        ? params.resultRestaurantCount
        : (params.resultFoodCount ?? 0);
    const coverage = Math.min(
      1,
      Math.max(0, resultCount) / Math.max(1, targetCount),
    );
    return 0.25 + 0.75 * Math.pow(1 - coverage, 1.2);
  }

  private resolveOnDemandTargetCount(): number {
    const configured = Number(
      this.configService.get<string>('SEARCH_ON_DEMAND_MIN_RESULTS'),
    );
    return Number.isFinite(configured) && configured > 0
      ? Math.floor(configured)
      : 25;
  }

  private calculateAttemptAvailability(params: {
    now: Date;
    lastAttemptAt: Date | null;
    lastOutcome: KeywordAttemptOutcome | null;
    resurgenceCreditDays: number;
  }): number {
    if (!params.lastAttemptAt) {
      return 1;
    }

    const daysSinceAttempt = Math.max(
      0,
      (params.now.getTime() - params.lastAttemptAt.getTime()) / MS_PER_DAY,
    );
    const effectiveDays =
      daysSinceAttempt +
      (params.lastOutcome === KeywordAttemptOutcome.no_results
        ? params.resurgenceCreditDays
        : 0);
    const curveDays = (() => {
      switch (params.lastOutcome) {
        case KeywordAttemptOutcome.success:
          return 7;
        case KeywordAttemptOutcome.no_results:
          return HOT_SPIKE_NO_RESULTS_RECOVERY_DAYS;
        case KeywordAttemptOutcome.deferred:
          return 0.25;
        case KeywordAttemptOutcome.error:
        default:
          return 1;
      }
    })();

    return 1 - Math.exp(-Math.pow(effectiveDays / curveDays, 2));
  }

  private async traceHotSpikeSelection(params: {
    now: Date;
    selected: HotSpikeScoredCandidate[];
    candidatePool: HotSpikeScoredCandidate[];
  }): Promise<void> {
    if (!params.candidatePool.length) {
      return;
    }

    try {
      const traceAllCandidates = this.shouldTraceAllCandidates();
      const runId = await this.scoringTrace.createRun({
        consumerKind: DemandScoringConsumerKind.on_demand,
        cycleStartAt: new Date(params.now.getTime() - HOT_SPIKE_WINDOW_MS),
        cycleEndAt: params.now,
        scorerVersion: HOT_SPIKE_SCORER_VERSION,
        traceAllCandidates,
        metadata: {
          maxJobsPerRun: HOT_SPIKE_MAX_JOBS_PER_RUN,
          lookbackDays: HOT_SPIKE_LOOKBACK_MS / MS_PER_DAY,
        },
      });
      const selectedKeys = new Set(
        params.selected.map(
          (candidate) =>
            `${candidate.collectableMarketKey}::${candidate.normalizedTerm}`,
        ),
      );
      const selectedTraces = params.selected.map((candidate, index) => ({
        consumerKind: DemandScoringConsumerKind.on_demand,
        candidateKind: 'hot_spike_term',
        subjectKind: DemandSubjectKind.term,
        subjectKey: candidate.normalizedTerm,
        normalizedText: candidate.normalizedTerm,
        collectableMarketKey: candidate.collectableMarketKey,
        bucket: 'hot_spike',
        lane: candidate.trigger,
        reason: 'on_demand_unmet',
        finalScore: candidate.priorityScore,
        rank: index + 1,
        selected: true,
        decisionState: DemandScoringDecisionState.selected,
        decisionReason: 'keyword_job_enqueued',
        factorBreakdown: candidate.factorBreakdown,
      }));
      const rejectedCandidates = params.candidatePool.filter(
        (candidate) =>
          !selectedKeys.has(
            `${candidate.collectableMarketKey}::${candidate.normalizedTerm}`,
          ),
      );
      const tracedRejectedCandidates = traceAllCandidates
        ? rejectedCandidates
        : rejectedCandidates.slice(0, 20);
      const rejectedTraces = tracedRejectedCandidates.map(
        (candidate, index) => {
          const isDebugOnlyCandidate = traceAllCandidates && index >= 20;
          const isAttemptUnavailable =
            candidate.priorityScore <= 0 || candidate.attemptAvailability <= 0;
          return {
            consumerKind: DemandScoringConsumerKind.on_demand,
            candidateKind: 'hot_spike_term',
            subjectKind: DemandSubjectKind.term,
            subjectKey: candidate.normalizedTerm,
            normalizedText: candidate.normalizedTerm,
            collectableMarketKey: candidate.collectableMarketKey,
            bucket: 'hot_spike',
            lane: candidate.trigger,
            reason: 'on_demand_unmet',
            finalScore: candidate.priorityScore,
            rank: params.selected.length + index + 1,
            selected: false,
            decisionState: isAttemptUnavailable
              ? DemandScoringDecisionState.gate_reject
              : isDebugOnlyCandidate
                ? DemandScoringDecisionState.budget_reject
                : DemandScoringDecisionState.near_miss,
            decisionReason: isAttemptUnavailable
              ? 'attempt_availability_zero'
              : isDebugOnlyCandidate
                ? 'trace_all_not_selected'
                : 'not_selected_this_cycle',
            factorBreakdown: {
              ...candidate.factorBreakdown,
              traceScope: isDebugOnlyCandidate ? 'all_candidate' : 'near_miss',
            },
          };
        },
      );
      await this.scoringTrace.recordCandidates(runId, [
        ...selectedTraces,
        ...rejectedTraces,
      ]);
      await this.scoringTrace.finishRun(runId);
    } catch (error) {
      this.logger.warn('Failed to trace hot spike keyword selection', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private shouldTraceAllCandidates(): boolean {
    return (
      this.configService
        .get<string>('DEMAND_SCORING_TRACE_ALL_CANDIDATES')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  /**
   * Mark keyword search as completed and schedule next run
   */
  async markSearchCompleted(
    collectableMarketKey: string,
    success: boolean,
    termsProcessed?: number,
  ): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const scheduleKey = collectableMarketKey.trim().toLowerCase();
    const schedule = this.schedules.get(scheduleKey);

    if (!schedule) {
      this.logger.warn('Attempted to mark completion for unknown schedule', {
        correlationId,
        collectableMarketKey: scheduleKey,
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
      collectableMarketKeyHint: schedule.collectableMarketKey,
    });
    schedule.collectableMarketKey = selection.collectableMarketKey;
    schedule.safeIntervalDays = selection.safeIntervalDays;
    schedule.terms = selection.terms;
    schedule.sortPlan = this.buildSortPlan({
      safeIntervalDays: schedule.safeIntervalDays,
      lastTopRelevanceRunAt: schedule.lastTopRelevanceRunAt,
      runAt: schedule.nextRun,
    });

    if (schedule.collectableMarketKey !== scheduleKey) {
      this.schedules.delete(scheduleKey);
    }
    this.schedules.set(schedule.collectableMarketKey, schedule);

    this.logger.info('Keyword search marked as completed', {
      correlationId,
      subreddit: schedule.subreddit,
      success,
      termsProcessed,
      nextRun: schedule.nextRun,
      collectableMarketKey: schedule.collectableMarketKey,
      newTermCount: schedule.terms.length,
      sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
    });
  }

  recordTopRelevanceRun(collectableMarketKey: string, executedAt: Date): void {
    const scheduleKey = collectableMarketKey.trim().toLowerCase();
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
      collectableMarketKey: schedule.collectableMarketKey,
      executedAt: safeExecutedAt,
      sortsPlanned: schedule.sortPlan.map((entry) => entry.sort),
    });
  }

  /**
   * Get current schedules for all market keys
   */
  getAllSchedules(): KeywordSearchSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedule for specific market key
   */
  getSchedule(collectableMarketKey: string): KeywordSearchSchedule | undefined {
    return this.schedules.get(collectableMarketKey.trim().toLowerCase());
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): KeywordSearchConfig {
    return { ...this.config };
  }

  private async selectTermsForSubreddit(params: {
    subreddit: string;
    collectableMarketKeyHint?: string | null;
  }): Promise<{
    collectableMarketKey: string;
    safeIntervalDays: number;
    terms: KeywordSearchTerm[];
  }> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const subreddit = params.subreddit.trim();

    try {
      const selection =
        await this.sliceSelection.selectTermsForSubreddit(subreddit);

      return {
        collectableMarketKey: selection.collectableMarketKey,
        safeIntervalDays: selection.safeIntervalDays,
        terms: selection.terms,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to select keyword terms for schedule', {
        correlationId,
        subreddit,
        collectableMarketKeyHint: params.collectableMarketKeyHint,
        error:
          error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : { message: String(error) },
      });
      throw error;
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
    Array<{ subreddit: string; collectableMarketKey: string }>
  > {
    const targets = await this.marketRegistry.listCommunityMarketTargets({
      onlyCollectable: true,
    });

    return targets.map((target) => ({
      subreddit: target.community,
      collectableMarketKey: target.marketKey,
    }));
  }

  private buildCollectionMarketKey(record: {
    name: string;
    marketKey: string | null;
  }): string {
    const rawKey =
      typeof record.marketKey === 'string' && record.marketKey.trim()
        ? record.marketKey
        : record.name;
    return rawKey.trim().toLowerCase();
  }
}
