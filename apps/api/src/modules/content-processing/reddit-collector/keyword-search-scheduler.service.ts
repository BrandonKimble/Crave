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
import { ON_DEMAND_MIN_RESULTS } from '../../search/on-demand-tuning.constants';
import type {
  KeywordSearchSortPlan,
  KeywordSearchTerm,
} from './keyword-search-orchestrator.service';

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
 * Keyword planning PROVIDER (not a scheduler — cadence is owned by
 * CollectionSchedulerService via collection_schedules rows).
 *
 * Provides:
 * - buildScheduleForCommunity: term selection + sort plan for a due keyword
 *   cadence row (demand-aware priority via slice selection)
 * - findHotSpikeCandidates: on-demand spike scoring across enabled keyword
 *   markets
 * - recordTopRelevanceRun: durable heavy-sort stamp on the cadence row
 */
@Injectable()
export class KeywordSearchSchedulerService implements OnModuleInit {
  private logger!: LoggerService;

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
  /**
   * PROVIDER for the consolidated CollectionScheduler (plans/collection-
   * scheduler-consolidation.md): build the due keyword work for ONE community
   * from durable inputs — no in-memory schedule map involved.
   */
  async buildScheduleForCommunity(
    subreddit: string,
    lastTopRelevanceRunAt: Date | null,
  ): Promise<{
    collectableMarketKey: string;
    safeIntervalDays: number;
    terms: KeywordSearchTerm[];
    sortPlan: KeywordSearchSortPlan[];
  }> {
    const selection = await this.selectTermsForSubreddit({ subreddit });
    return {
      collectableMarketKey: selection.collectableMarketKey,
      safeIntervalDays: selection.safeIntervalDays,
      terms: selection.terms,
      sortPlan: this.buildSortPlan({
        safeIntervalDays: selection.safeIntervalDays,
        lastTopRelevanceRunAt: lastTopRelevanceRunAt ?? undefined,
        runAt: new Date(),
      }),
    };
  }

  async findHotSpikeCandidates(): Promise<HotSpikeKeywordCandidate[]> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    const now = new Date();
    const sinceLookback = new Date(now.getTime() - HOT_SPIKE_LOOKBACK_MS);
    const since24h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS);
    const since48h = new Date(now.getTime() - HOT_SPIKE_WINDOW_MS * 2);

    // Durable market whitelist: collection_schedules keyword rows (the old
    // in-memory schedule map is gone) supply hot-spike eligibility + the
    // per-market context candidates need.
    const keywordRows = await this.prisma.collectionSchedule.findMany({
      where: { workKind: 'keyword', enabled: true },
      select: { community: true, intervalDays: true, metadata: true },
    });
    const scheduleByMarketKey = new Map<
      string,
      {
        subreddit: string;
        collectableMarketKey: string;
        safeIntervalDays: number;
        lastTopRelevanceRunAt?: Date;
      }
    >();
    for (const row of keywordRows) {
      const resolvedKey = (
        (await this.marketRegistry.resolveMarketKeyForCommunity(
          row.community,
        )) ?? row.community
      )
        .trim()
        .toLowerCase();
      const metadata = (row.metadata ?? {}) as {
        lastTopRelevanceRunAt?: string;
      };
      scheduleByMarketKey.set(resolvedKey, {
        subreddit: row.community,
        collectableMarketKey: resolvedKey,
        safeIntervalDays: row.intervalDays,
        lastTopRelevanceRunAt: metadata.lastTopRelevanceRunAt
          ? new Date(metadata.lastTopRelevanceRunAt)
          : undefined,
      });
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
    return ON_DEMAND_MIN_RESULTS;
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

  /** Durable: stamp the community's keyword cadence row so future runs skip
   *  heavy sorts recently covered by a hot-spike job. */
  async recordTopRelevanceRun(
    community: string,
    executedAt: Date,
  ): Promise<void> {
    const safeExecutedAt =
      executedAt instanceof Date && !Number.isNaN(executedAt.getTime())
        ? executedAt
        : new Date();
    const row = await this.prisma.collectionSchedule.findUnique({
      where: { community_workKind: { community, workKind: 'keyword' } },
      select: { metadata: true },
    });
    if (!row) return;
    await this.prisma.collectionSchedule.update({
      where: { community_workKind: { community, workKind: 'keyword' } },
      data: {
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          lastTopRelevanceRunAt: safeExecutedAt.toISOString(),
        },
        updatedAt: new Date(),
      },
    });
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
}
