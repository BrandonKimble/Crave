import { Inject, Injectable } from '@nestjs/common';
import {
  DemandScoringConsumerKind,
  DemandScoringDecisionState,
  DemandSubjectKind,
  EntityType,
  KeywordAttemptOutcome,
  OnDemandReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { stripGenericTokens } from '../../../shared/utils/generic-token-handling';
import { MarketRegistryService } from '../../markets/market-registry.service';
import { DemandScoringTraceService } from '../../analytics/demand-scoring-trace.service';
import * as curves from '../../analytics/demand-scoring/curves';
import { ON_DEMAND_MIN_RESULTS } from '../../search/on-demand-tuning.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MAX_TERMS_PER_CYCLE = 25;

const SLICE_QUOTAS = {
  unmet: 5,
  refresh: 10,
  demand: 8,
  explore: 2,
} as const;

const SLICE_BACKFILL_WEIGHT: Record<KeywordSlice, number> = {
  unmet: 1.2,
  refresh: 1.1,
  demand: 1,
  explore: 0.65,
};

const MIN_SELECTABLE_SCORE_BY_SLICE: Record<KeywordSlice, number> = {
  unmet: 1,
  refresh: 0.2,
  demand: 1,
  explore: 0.2,
};

const SLICE_PRIORITY: KeywordSlice[] = [
  'unmet',
  'refresh',
  'demand',
  'explore',
];

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TREND_WINDOW_DAYS = 7;
const DEFAULT_SAFE_INTERVAL_DAYS = 7;
const KEYWORD_COLLECTION_SCORER_VERSION = 'keyword-collection-v1';
const UNMET_CURRENT_CYCLE_DAYS = 7;
const UNMET_HALF_LIFE_DAYS = 14;

const DEMAND_WEIGHT_FAVORITES = 1.5;
const DEMAND_WEIGHT_CARD_ENGAGEMENT = 0.6;
const DEMAND_WEIGHT_EXPLICIT_SELECTION = 1.5;
const DEMAND_WEIGHT_QUERY_PRIMARY = 1;

const NO_RESULTS_RECOVERY_DAYS = 45;

const REFRESH_STALENESS_SATURATION_DAYS = 90;

const EXPLORE_RECENT_ATTEMPT_DAYS = 30;

const EXPLORE_SIGNAL_CARD_ENGAGEMENT_FLOOR = 2;
const EXPLORE_SIGNAL_EXPLICIT_SELECTION_FLOOR = 2;
const EXPLORE_SIGNAL_FAVORITE_FLOOR = 1;
const EXPLORE_SIGNAL_UNMET_FLOOR = 2;

const ENTITY_SIGNAL_CANDIDATE_LIMIT = MAX_TERMS_PER_CYCLE * 50;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function shouldTraceAllDemandCandidates(): boolean {
  return (
    process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES?.trim().toLowerCase() ===
    'true'
  );
}

export type KeywordSlice = 'unmet' | 'refresh' | 'demand' | 'explore';

export interface KeywordTermCandidate {
  term: string;
  normalizedTerm: string;
  slice: KeywordSlice;
  score: number;
  entityType?: EntityType;
  origin?: Record<string, unknown>;
}

export interface KeywordSliceSelectionStats {
  candidatesBySlice: Record<KeywordSlice, number>;
  eligibleBySlice: Record<KeywordSlice, number>;
  selectedBySlice: Record<KeywordSlice, number>;
  underfilledBySlice: Record<KeywordSlice, number>;
  dropped: {
    invalid: number;
    cooldown: number;
    deduped: number;
  };
}

export interface KeywordSliceSelectionResult {
  subreddit: string;
  collectableMarketKey: string;
  safeIntervalDays: number;
  windowDays: number;
  maxTerms: number;
  quotas: Record<KeywordSlice, number>;
  terms: KeywordTermCandidate[];
  stats: KeywordSliceSelectionStats;
}

interface SoftReservationSelection {
  selected: KeywordTermCandidate[];
  selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
  underfilledBySlice: Record<KeywordSlice, number>;
}

interface KeywordGateRejectTrace {
  candidate: KeywordTermCandidate;
  decisionState: DemandScoringDecisionState;
  decisionReason: string;
}

type CommunityLookup = {
  safeIntervalDays: number | null;
} | null;

@Injectable()
export class KeywordSliceSelectionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketRegistry: MarketRegistryService,
    private readonly scoringTrace: DemandScoringTraceService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('KeywordSliceSelectionService');
  }

  async selectTermsForSubreddit(
    subreddit: string,
  ): Promise<KeywordSliceSelectionResult> {
    const normalizedSubreddit = subreddit.trim();
    const community = await this.lookupCommunity(normalizedSubreddit);
    const mappedMarketKey =
      await this.marketRegistry.resolveMarketKeyForCommunity(
        normalizedSubreddit,
      );
    if (!mappedMarketKey) {
      throw new Error(
        `No marketKey configured for collection community "${normalizedSubreddit}"`,
      );
    }
    const collectableMarketKey = mappedMarketKey;
    const safeIntervalDays = this.resolveSafeIntervalDays(community);
    const now = new Date();
    const windowDays = this.resolveWindowDays(
      process.env.KEYWORD_DEMAND_WINDOW_DAYS,
      DEFAULT_WINDOW_DAYS,
    );
    const trendWindowDays = this.resolveWindowDays(
      process.env.KEYWORD_TREND_WINDOW_DAYS,
      DEFAULT_TREND_WINDOW_DAYS,
    );
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY);

    const stats: KeywordSliceSelectionStats = {
      candidatesBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      eligibleBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      selectedBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      underfilledBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      dropped: { invalid: 0, cooldown: 0, deduped: 0 },
    };
    const gateRejects: KeywordGateRejectTrace[] = [];

    const candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: await this.loadUnmetCandidates(collectableMarketKey, since, now),
      refresh: await this.loadRefreshCandidates(collectableMarketKey, now),
      demand: await this.loadDemandCandidates(collectableMarketKey, since),
      explore: await this.loadExploreCandidates({
        collectableMarketKey,
        since,
        now,
        trendWindowDays,
      }),
    };

    for (const slice of SLICE_PRIORITY) {
      candidatesBySlice[slice] = this.normalizeAndFilterCandidates(
        candidatesBySlice[slice],
        stats,
        gateRejects,
      );
      candidatesBySlice[slice] = this.dedupeWithinSlice(
        candidatesBySlice[slice],
      );
      candidatesBySlice[slice] = candidatesBySlice[slice].sort(
        (a, b) => b.score - a.score,
      );
      stats.candidatesBySlice[slice] = candidatesBySlice[slice].length;
    }

    const attemptHistoryMap = await this.loadAttemptHistoryByTerm({
      collectableMarketKey,
      normalizedTerms: Array.from(
        new Set(
          SLICE_PRIORITY.flatMap((slice) =>
            candidatesBySlice[slice].map(
              (candidate) => candidate.normalizedTerm,
            ),
          ),
        ),
      ),
    });

    for (const slice of SLICE_PRIORITY) {
      const filtered: KeywordTermCandidate[] = [];
      for (const candidate of candidatesBySlice[slice]) {
        const history = attemptHistoryMap.get(candidate.normalizedTerm);
        const shouldApplySmoothNoResultsRecovery =
          candidate.slice === 'unmet' &&
          history?.lastOutcome === KeywordAttemptOutcome.no_results;
        if (
          history?.cooldownUntil &&
          history.cooldownUntil > now &&
          !shouldApplySmoothNoResultsRecovery
        ) {
          stats.dropped.cooldown += 1;
          gateRejects.push({
            candidate,
            decisionState: DemandScoringDecisionState.gate_reject,
            decisionReason: 'attempt_cooldown_active',
          });
          continue;
        }

        const adjusted = this.applyAttemptHistoryAdjustments(
          candidate,
          history,
          now,
        );
        filtered.push(adjusted);
      }
      candidatesBySlice[slice] = filtered.sort((a, b) => b.score - a.score);
    }

    const dedupedBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: [],
      refresh: [],
      demand: [],
      explore: [],
    };
    const seen = new Set<string>();
    for (const slice of SLICE_PRIORITY) {
      for (const candidate of candidatesBySlice[slice]) {
        if (seen.has(candidate.normalizedTerm)) {
          stats.dropped.deduped += 1;
          gateRejects.push({
            candidate,
            decisionState: DemandScoringDecisionState.dedupe_reject,
            decisionReason: 'duplicate_keyword_term',
          });
          continue;
        }
        seen.add(candidate.normalizedTerm);
        dedupedBySlice[slice].push(candidate);
      }
      stats.eligibleBySlice[slice] = dedupedBySlice[slice].length;
    }

    const quotas: Record<KeywordSlice, number> = {
      unmet: SLICE_QUOTAS.unmet,
      refresh: SLICE_QUOTAS.refresh,
      demand: SLICE_QUOTAS.demand,
      explore: SLICE_QUOTAS.explore,
    };

    const maxTerms = MAX_TERMS_PER_CYCLE;
    const softSelection = this.selectWithSoftReservationsAndBackfill({
      candidatesBySlice: dedupedBySlice,
      reservations: quotas,
      maxTerms,
    });

    for (const slice of SLICE_PRIORITY) {
      stats.selectedBySlice[slice] =
        softSelection.selectedBySlice[slice].length;
      stats.underfilledBySlice[slice] = softSelection.underfilledBySlice[slice];
    }
    const finalSelection = softSelection.selected;

    this.logger.debug('Selected keyword terms for cycle', {
      subreddit: normalizedSubreddit,
      collectableMarketKey,
      maxTerms,
      quotas,
      stats,
      sample: finalSelection.slice(0, 10).map((term) => ({
        slice: term.slice,
        term: term.term,
        normalizedTerm: term.normalizedTerm,
        score: term.score,
      })),
    });

    await this.traceKeywordSelection({
      collectableMarketKey,
      cycleStartAt: since,
      cycleEndAt: now,
      candidatesBySlice: dedupedBySlice,
      gateRejects,
      selected: finalSelection,
      maxTerms,
    });

    return {
      subreddit: normalizedSubreddit,
      collectableMarketKey,
      safeIntervalDays,
      windowDays,
      maxTerms,
      quotas,
      terms: finalSelection,
      stats,
    };
  }

  private normalizeAndFilterCandidates(
    candidates: KeywordTermCandidate[],
    stats: KeywordSliceSelectionStats,
    gateRejects?: KeywordGateRejectTrace[],
  ): KeywordTermCandidate[] {
    const result: KeywordTermCandidate[] = [];

    for (const candidate of candidates) {
      const stripped = stripGenericTokens(candidate.term);
      const term = stripped.text;
      if (!term.length || stripped.isGenericOnly) {
        stats.dropped.invalid += 1;
        gateRejects?.push({
          candidate: {
            ...candidate,
            term: candidate.term,
            normalizedTerm:
              candidate.normalizedTerm || normalizeKeywordTerm(candidate.term),
          },
          decisionState: DemandScoringDecisionState.gate_reject,
          decisionReason: stripped.isGenericOnly
            ? 'generic_only_keyword'
            : 'empty_keyword_term',
        });
        continue;
      }

      const normalizedTerm = normalizeKeywordTerm(term);
      if (!normalizedTerm.length) {
        stats.dropped.invalid += 1;
        gateRejects?.push({
          candidate: {
            ...candidate,
            term,
            normalizedTerm:
              candidate.normalizedTerm || normalizeKeywordTerm(candidate.term),
          },
          decisionState: DemandScoringDecisionState.gate_reject,
          decisionReason: 'invalid_normalized_keyword',
        });
        continue;
      }

      result.push({
        ...candidate,
        term,
        normalizedTerm,
      });
    }

    return result;
  }

  private dedupeWithinSlice(
    candidates: KeywordTermCandidate[],
  ): KeywordTermCandidate[] {
    const byTerm = new Map<string, KeywordTermCandidate>();

    for (const candidate of candidates) {
      const existing = byTerm.get(candidate.normalizedTerm);
      if (!existing || candidate.score > existing.score) {
        byTerm.set(candidate.normalizedTerm, candidate);
      }
    }

    return Array.from(byTerm.values());
  }

  private selectWithSoftReservationsAndBackfill(params: {
    candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
    reservations: Record<KeywordSlice, number>;
    maxTerms: number;
  }): SoftReservationSelection {
    const selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: [],
      refresh: [],
      demand: [],
      explore: [],
    };
    const underfilledBySlice: Record<KeywordSlice, number> = {
      unmet: 0,
      refresh: 0,
      demand: 0,
      explore: 0,
    };
    const selectedTerms = new Set<string>();
    const leftovers: Array<{
      candidate: KeywordTermCandidate;
      slice: KeywordSlice;
      rankQuality: number;
    }> = [];

    for (const slice of SLICE_PRIORITY) {
      const candidates = params.candidatesBySlice[slice];
      const reservation = Math.max(0, params.reservations[slice] ?? 0);
      const naturalLimit = this.naturalReservationLimit(
        candidates,
        reservation,
      );
      const reserved = candidates.slice(0, naturalLimit);

      for (const candidate of reserved) {
        if (selectedTerms.size >= params.maxTerms) {
          break;
        }
        selectedBySlice[slice].push(candidate);
        selectedTerms.add(candidate.normalizedTerm);
      }

      underfilledBySlice[slice] = Math.max(
        0,
        reservation - selectedBySlice[slice].length,
      );

      const topScore = candidates[0]?.score ?? 0;
      for (let index = naturalLimit; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (selectedTerms.has(candidate.normalizedTerm)) {
          continue;
        }
        if (!this.isSelectableCandidate(candidate)) {
          continue;
        }
        const rankQuality =
          topScore > 0 && Number.isFinite(candidate.score)
            ? clamp01(candidate.score / topScore)
            : 0;
        if (rankQuality <= 0) {
          continue;
        }
        leftovers.push({ candidate, slice, rankQuality });
      }
    }

    const selected = SLICE_PRIORITY.flatMap((slice) => selectedBySlice[slice]);
    const remaining = Math.max(0, params.maxTerms - selected.length);
    if (remaining > 0) {
      leftovers.sort((a, b) => {
        const aScore = a.rankQuality * SLICE_BACKFILL_WEIGHT[a.slice];
        const bScore = b.rankQuality * SLICE_BACKFILL_WEIGHT[b.slice];
        return bScore - aScore || b.candidate.score - a.candidate.score;
      });

      for (const { candidate, slice } of leftovers) {
        if (selected.length >= params.maxTerms) {
          break;
        }
        if (selectedTerms.has(candidate.normalizedTerm)) {
          continue;
        }
        selected.push(candidate);
        selectedBySlice[slice].push(candidate);
        selectedTerms.add(candidate.normalizedTerm);
      }
    }

    for (const slice of SLICE_PRIORITY) {
      underfilledBySlice[slice] = Math.max(
        0,
        (params.reservations[slice] ?? 0) - selectedBySlice[slice].length,
      );
    }

    return { selected, selectedBySlice, underfilledBySlice };
  }

  private async traceKeywordSelection(params: {
    collectableMarketKey: string;
    cycleStartAt: Date;
    cycleEndAt: Date;
    candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
    gateRejects?: KeywordGateRejectTrace[];
    selected: KeywordTermCandidate[];
    maxTerms: number;
  }): Promise<void> {
    try {
      const runId = await this.scoringTrace.createRun({
        consumerKind: DemandScoringConsumerKind.keyword_collection,
        collectableMarketKey: params.collectableMarketKey,
        cycleStartAt: params.cycleStartAt,
        cycleEndAt: params.cycleEndAt,
        scorerVersion: KEYWORD_COLLECTION_SCORER_VERSION,
        traceAllCandidates: shouldTraceAllDemandCandidates(),
        metadata: {
          maxTerms: params.maxTerms,
          reservations: SLICE_QUOTAS,
          backfillWeights: SLICE_BACKFILL_WEIGHT,
        },
      });

      const selectedKeyByTerm = new Map(
        params.selected.map((candidate, index) => [
          candidate.normalizedTerm,
          { candidate, rank: index + 1 },
        ]),
      );
      const selectedTraces = params.selected.map((candidate, index) =>
        this.buildKeywordTraceCandidate({
          collectableMarketKey: params.collectableMarketKey,
          candidate,
          rank: index + 1,
          selected: true,
          decisionState: DemandScoringDecisionState.selected,
          decisionReason: 'selected_by_soft_reservation_or_backfill',
        }),
      );

      const traceAllCandidates = shouldTraceAllDemandCandidates();
      const nearMisses = SLICE_PRIORITY.flatMap((slice) => {
        const rejected = params.candidatesBySlice[slice].filter(
          (candidate) => !selectedKeyByTerm.has(candidate.normalizedTerm),
        );
        const traced = traceAllCandidates ? rejected : rejected.slice(0, 5);
        return traced.map((candidate, index) => {
          const isDebugOnlyCandidate = traceAllCandidates && index >= 5;
          return this.buildKeywordTraceCandidate({
            collectableMarketKey: params.collectableMarketKey,
            candidate,
            selected: false,
            decisionState: isDebugOnlyCandidate
              ? DemandScoringDecisionState.budget_reject
              : DemandScoringDecisionState.near_miss,
            decisionReason: isDebugOnlyCandidate
              ? 'trace_all_not_selected'
              : 'strong_leftover_after_budget',
            traceScope: isDebugOnlyCandidate ? 'all_candidate' : 'near_miss',
          });
        });
      });

      await this.scoringTrace.recordCandidates(runId, [
        ...selectedTraces,
        ...nearMisses,
        ...(params.gateRejects ?? []).map((reject) =>
          this.buildKeywordTraceCandidate({
            collectableMarketKey: params.collectableMarketKey,
            candidate: reject.candidate,
            selected: false,
            decisionState: reject.decisionState,
            decisionReason: reject.decisionReason,
          }),
        ),
      ]);
      await this.scoringTrace.finishRun(runId);
    } catch (error) {
      this.logger.warn('Failed to trace keyword collection selection', {
        collectableMarketKey: params.collectableMarketKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private buildKeywordTraceCandidate(params: {
    collectableMarketKey: string;
    candidate: KeywordTermCandidate;
    rank?: number;
    selected: boolean;
    decisionState: DemandScoringDecisionState;
    decisionReason: string;
    traceScope?: 'near_miss' | 'all_candidate';
  }) {
    const origin =
      params.candidate.origin && typeof params.candidate.origin === 'object'
        ? params.candidate.origin
        : {};
    return {
      consumerKind: DemandScoringConsumerKind.keyword_collection,
      candidateKind: `${params.candidate.slice}_term`,
      subjectKind: DemandSubjectKind.term,
      subjectKey: params.candidate.normalizedTerm,
      collectableMarketKey: params.collectableMarketKey,
      entityId:
        typeof origin.entityId === 'string' ? origin.entityId : undefined,
      entityType: params.candidate.entityType ?? null,
      normalizedText: params.candidate.term,
      bucket: params.candidate.slice,
      finalScore: params.candidate.score,
      rank: params.rank,
      selected: params.selected,
      decisionState: params.decisionState,
      decisionReason: params.decisionReason,
      factorBreakdown: {
        score: params.candidate.score,
        origin: this.toJsonValue(origin),
        ...(params.traceScope ? { traceScope: params.traceScope } : {}),
      } satisfies Prisma.InputJsonObject,
    };
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  }

  private naturalReservationLimit(
    candidates: KeywordTermCandidate[],
    reservation: number,
  ): number {
    if (!candidates.length || reservation <= 0) {
      return 0;
    }
    const positiveCandidates = candidates.filter((candidate) =>
      this.isSelectableCandidate(candidate),
    );
    if (!positiveCandidates.length) {
      return 0;
    }

    const reservationCap = Math.min(reservation, positiveCandidates.length);
    const scores = positiveCandidates.map((candidate) => candidate.score);
    const median = this.median(scores);
    const mad = this.median(scores.map((score) => Math.abs(score - median)));
    const robustScale = curves.robustScale(mad);

    let limit = 0;
    for (let index = 0; index < reservationCap; index += 1) {
      const score = scores[index];
      const rank = index + 1;
      const robustZ = (score - median) / robustScale;
      const eligible = rank === 1 || robustZ >= -0.75;
      if (!eligible) {
        break;
      }
      limit = rank;
      const nextScore = scores[index + 1];
      if (rank >= 2 && nextScore !== undefined && score > 0) {
        const dropRatio = nextScore / score;
        if (dropRatio < 0.55) {
          break;
        }
      }
    }

    return Math.max(1, limit);
  }

  private isSelectableCandidate(candidate: KeywordTermCandidate): boolean {
    const score = Number.isFinite(candidate.score) ? candidate.score : 0;
    return score >= MIN_SELECTABLE_SCORE_BY_SLICE[candidate.slice];
  }

  private median(values: number[]): number {
    const sorted = values
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (!sorted.length) {
      return 0;
    }
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private formatDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private resolveWindowDays(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private calculateDemandScore(params: {
    favoriteUsers: number;
    cardEngagementUsers: number;
    explicitSelectionUsers: number;
    queryUsersPrimary: number;
  }): number {
    const favoriteScore = this.normalizeDemandUnit(params.favoriteUsers);
    const cardEngagementScore = this.normalizeDemandUnit(
      params.cardEngagementUsers,
    );
    const explicitSelectionScore = this.normalizeDemandUnit(
      params.explicitSelectionUsers,
    );
    const queryScore = this.normalizeDemandUnit(params.queryUsersPrimary);

    return (
      DEMAND_WEIGHT_FAVORITES * favoriteScore +
      DEMAND_WEIGHT_CARD_ENGAGEMENT * cardEngagementScore +
      DEMAND_WEIGHT_EXPLICIT_SELECTION * explicitSelectionScore +
      DEMAND_WEIGHT_QUERY_PRIMARY * queryScore
    );
  }

  private calculateUnmetScore(params: {
    distinctUsers: number;
    demandScore?: number;
    reason: OnDemandReason;
    resultRestaurantCount: number | null;
    resultFoodCount: number | null;
    lastSeenAt: Date;
    now: Date;
  }): number {
    const severity =
      params.reason === 'low_result'
        ? this.calculateLowResultSeverity({
            restaurantCount: params.resultRestaurantCount,
            foodCount: params.resultFoodCount,
          })
        : 1;
    const demandScore =
      typeof params.demandScore === 'number' &&
      Number.isFinite(params.demandScore)
        ? Math.max(0, params.demandScore)
        : curves.logGrowth(params.distinctUsers);
    const daysSinceLastSeen =
      (params.now.getTime() - params.lastSeenAt.getTime()) / MS_PER_DAY;
    const safeDaysSinceLastSeen =
      Number.isFinite(daysSinceLastSeen) && daysSinceLastSeen > 0
        ? daysSinceLastSeen
        : 0;
    const recencyWeight =
      safeDaysSinceLastSeen <= UNMET_CURRENT_CYCLE_DAYS
        ? 1
        : Math.pow(
            2,
            -(
              (safeDaysSinceLastSeen - UNMET_CURRENT_CYCLE_DAYS) /
              UNMET_HALF_LIFE_DAYS
            ),
          );

    return severity * demandScore * recencyWeight;
  }

  private calculateLowResultSeverity(params: {
    restaurantCount: number | null;
    foodCount: number | null;
  }): number {
    const targetCount = ON_DEMAND_MIN_RESULTS;
    const observedCount =
      typeof params.restaurantCount === 'number'
        ? Math.max(params.restaurantCount, 0)
        : Math.max(params.foodCount ?? 0, 0);
    const coverage = clamp01(observedCount / targetCount);
    return curves.inverseCoverage(coverage, 1.2);
  }

  private normalizeDemandUnit(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private applyAttemptHistoryAdjustments(
    candidate: KeywordTermCandidate,
    history:
      | {
          cooldownUntil: Date | null;
          lastOutcome: KeywordAttemptOutcome | null;
          lastAttemptAt: Date | null;
        }
      | undefined,
    now: Date,
  ): KeywordTermCandidate {
    if (candidate.slice === 'unmet') {
      if (
        history?.lastOutcome === 'no_results' &&
        history.lastAttemptAt instanceof Date &&
        !Number.isNaN(history.lastAttemptAt.getTime())
      ) {
        const daysSinceAttempt =
          (now.getTime() - history.lastAttemptAt.getTime()) / MS_PER_DAY;
        if (Number.isFinite(daysSinceAttempt) && daysSinceAttempt >= 0) {
          const attemptAvailability = curves.gaussianRamp(
            daysSinceAttempt,
            NO_RESULTS_RECOVERY_DAYS,
          );
          const origin =
            candidate.origin && typeof candidate.origin === 'object'
              ? candidate.origin
              : {};
          return {
            ...candidate,
            score: candidate.score * attemptAvailability,
            origin: {
              ...origin,
              attemptAvailability,
              lastOutcome: history.lastOutcome,
              lastAttemptAt: history.lastAttemptAt.toISOString(),
            },
          };
        }
      }

      return candidate;
    }

    if (candidate.slice === 'explore') {
      const origin =
        candidate.origin && typeof candidate.origin === 'object'
          ? candidate.origin
          : {};
      const queryUsers7d =
        typeof origin.queryUsers7d === 'number' ? origin.queryUsers7d : 0;
      const queryUsersPrev7d =
        typeof origin.queryUsersPrev7d === 'number'
          ? origin.queryUsersPrev7d
          : 0;
      const localQueryUsers =
        typeof origin.localQueryUsers === 'number' ? origin.localQueryUsers : 0;
      const globalQueryUsers =
        typeof origin.globalQueryUsers === 'number'
          ? origin.globalQueryUsers
          : 0;

      const trend = clamp01(
        (queryUsers7d - queryUsersPrev7d) / Math.max(1, queryUsersPrev7d),
      );

      const otherUsers = Math.max(0, globalQueryUsers - localQueryUsers);
      const localSpecialization = clamp01(
        (localQueryUsers + 1) / (otherUsers + 1) / 3,
      );

      const novelty = (() => {
        if (
          history?.lastAttemptAt instanceof Date &&
          !Number.isNaN(history.lastAttemptAt.getTime())
        ) {
          const daysSinceAttempt =
            (now.getTime() - history.lastAttemptAt.getTime()) / MS_PER_DAY;
          const safeDays =
            Number.isFinite(daysSinceAttempt) && daysSinceAttempt > 0
              ? daysSinceAttempt
              : 0;
          return clamp01(safeDays / EXPLORE_RECENT_ATTEMPT_DAYS);
        }
        return 1;
      })();

      return {
        ...candidate,
        score: 0.45 * novelty + 0.35 * localSpecialization + 0.2 * trend,
        origin: {
          ...origin,
          novelty,
          trend,
          localSpecialization,
          lastOutcome: history?.lastOutcome ?? null,
          lastAttemptAt: history?.lastAttemptAt?.toISOString() ?? null,
        },
      };
    }

    return candidate;
  }

  private async loadUnmetCandidates(
    marketKey: string,
    since: Date,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        term: string;
        entityType: EntityType;
        entityId: string | null;
        reason: OnDemandReason;
        distinctUserCount: number;
        demandScore: number;
        resultRestaurantCount: number | null;
        resultFoodCount: number | null;
        lastSeenAt: Date;
        askCount: number;
      }>
    >(Prisma.sql`
      WITH user_counts AS (
        SELECT
          LOWER(TRIM(term)) AS normalized_term,
          MIN(term) AS term,
          entity_type,
          entity_id,
          reason,
          COALESCE(user_id::text, 'anonymous:' || ask_event_id::text) AS user_key,
          COUNT(*)::float AS ask_count,
          MIN(result_restaurant_count) AS result_restaurant_count,
          MIN(result_food_count) AS result_food_count,
          MAX(asked_at) AS last_seen_at
        FROM collection_on_demand_ask_events
        WHERE asked_at >= (${this.formatDateKey(since)}::date::timestamp AT TIME ZONE 'UTC')
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${marketKey})
          AND reason IN ('unresolved'::"OnDemandReason", 'low_result'::"OnDemandReason")
          AND NULLIF(LOWER(TRIM(term)), '') IS NOT NULL
        GROUP BY
          LOWER(TRIM(term)),
          entity_type,
          entity_id,
          reason,
          COALESCE(user_id::text, 'anonymous:' || ask_event_id::text)
      )
      SELECT
        MIN(term) AS "term",
        entity_type AS "entityType",
        entity_id AS "entityId",
        reason,
        COUNT(*)::int AS "distinctUserCount",
        SUM(LN(1 + ask_count) / LN(2))::float AS "demandScore",
        MIN(result_restaurant_count)::int AS "resultRestaurantCount",
        MIN(result_food_count)::int AS "resultFoodCount",
        MAX(last_seen_at) AS "lastSeenAt",
        SUM(ask_count)::int AS "askCount"
      FROM user_counts
      GROUP BY normalized_term, entity_type, entity_id, reason
      ORDER BY "demandScore" DESC, "lastSeenAt" DESC
      LIMIT ${MAX_TERMS_PER_CYCLE * 10}
    `);

    return rows.map((request) => ({
      term: request.term,
      normalizedTerm: '',
      slice: 'unmet',
      score: this.calculateUnmetScore({
        distinctUsers: request.distinctUserCount,
        demandScore: request.demandScore,
        reason: request.reason,
        resultRestaurantCount: request.resultRestaurantCount,
        resultFoodCount: request.resultFoodCount,
        lastSeenAt: request.lastSeenAt,
        now,
      }),
      entityType: request.entityType,
      origin: {
        reason: request.reason,
        distinctUserCount: request.distinctUserCount,
        demandScore: request.demandScore,
        askCount: request.askCount,
        entityId: request.entityId,
        resultRestaurantCount: request.resultRestaurantCount ?? 0,
        resultFoodCount: request.resultFoodCount ?? 0,
        lastSeenAt: request.lastSeenAt.toISOString(),
      },
    }));
  }

  private async loadDemandCandidates(
    collectableMarketKey: string,
    since: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.loadEntityDemandSignalRows({
      collectableMarketKey,
      since,
      limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
    });

    return rows.map((row) => {
      const demandScore = this.calculateDemandScore({
        favoriteUsers: row.favoriteUsers,
        cardEngagementUsers: row.viewUsers,
        explicitSelectionUsers: row.autocompleteUsers,
        queryUsersPrimary: row.queryUsersPrimary,
      });

      return {
        term: row.entityName,
        normalizedTerm: '',
        slice: 'demand',
        score: demandScore,
        entityType: row.entityType,
        origin: {
          entityId: row.entityId,
          favoriteUsers: row.favoriteUsers,
          cardEngagementUsers: row.viewUsers,
          explicitSelectionUsers: row.autocompleteUsers,
          queryUsersPrimary: row.queryUsersPrimary,
          viewUsers: row.viewUsers,
          autocompleteUsers: row.autocompleteUsers,
          lastQueryAt: row.lastQueryAt?.toISOString() ?? null,
          lastViewAt: row.lastViewAt?.toISOString() ?? null,
        },
      };
    });
  }

  private async loadExploreCandidates(params: {
    collectableMarketKey: string;
    since: Date;
    now: Date;
    trendWindowDays: number;
  }): Promise<KeywordTermCandidate[]> {
    const rows = await this.loadEntityDemandSignalRows({
      collectableMarketKey: params.collectableMarketKey,
      since: params.since,
      limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
    });

    if (!rows.length) {
      return [];
    }

    const unmetRequests = await this.prisma.$queryRaw<
      Array<{ term: string; demandScore: number }>
    >(Prisma.sql`
      WITH user_counts AS (
        SELECT
          LOWER(TRIM(term)) AS normalized_term,
          MIN(term) AS term,
          COALESCE(user_id::text, 'anonymous:' || ask_event_id::text) AS user_key,
          COUNT(*)::float AS ask_count,
          MAX(asked_at) AS last_seen_at
        FROM collection_on_demand_ask_events
        WHERE asked_at >= (${this.formatDateKey(params.since)}::date::timestamp AT TIME ZONE 'UTC')
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${params.collectableMarketKey})
          AND reason IN ('unresolved'::"OnDemandReason", 'low_result'::"OnDemandReason")
          AND NULLIF(LOWER(TRIM(term)), '') IS NOT NULL
        GROUP BY
          LOWER(TRIM(term)),
          COALESCE(user_id::text, 'anonymous:' || ask_event_id::text)
      )
      SELECT
        MIN(term) AS term,
        SUM(LN(1 + ask_count) / LN(2))::float AS "demandScore"
      FROM user_counts
      GROUP BY normalized_term
      ORDER BY "demandScore" DESC, MAX(last_seen_at) DESC
      LIMIT ${ENTITY_SIGNAL_CANDIDATE_LIMIT}
    `);

    const unmetByNormalizedTerm = new Map<string, number>();
    for (const request of unmetRequests) {
      const stripped = stripGenericTokens(request.term);
      if (!stripped.text.length || stripped.isGenericOnly) {
        continue;
      }
      const normalized = normalizeKeywordTerm(stripped.text);
      if (!normalized.length) {
        continue;
      }
      unmetByNormalizedTerm.set(
        normalized,
        Math.max(
          unmetByNormalizedTerm.get(normalized) ?? 0,
          request.demandScore,
        ),
      );
    }

    const trendSince = new Date(
      params.now.getTime() - params.trendWindowDays * MS_PER_DAY,
    );
    const prevTrendSince = new Date(
      params.now.getTime() - params.trendWindowDays * 2 * MS_PER_DAY,
    );

    const entityIds = Array.from(new Set(rows.map((row) => row.entityId)));
    const trendByEntityId = await this.loadTrendCountsByEntity({
      collectableMarketKey: params.collectableMarketKey,
      entityIds,
      since: prevTrendSince,
      trendSince,
    });

    const termKeys = Array.from(
      new Set(
        rows
          .map((row) => row.entityName.trim().toLowerCase())
          .filter((name) => name.length),
      ),
    );
    const entityTypes = Array.from(new Set(rows.map((row) => row.entityType)));

    const globalQueryUsersByTerm = await this.loadGlobalQueryCountsByTerm({
      since: params.since,
      termKeys,
      entityTypes,
    });

    const candidates: KeywordTermCandidate[] = [];

    for (const row of rows) {
      const stripped = stripGenericTokens(row.entityName);
      const normalized = stripped.text.length
        ? normalizeKeywordTerm(stripped.text)
        : '';
      const unmetDistinctUsers = normalized.length
        ? (unmetByNormalizedTerm.get(normalized) ?? 0)
        : 0;

      const signalFloorMet =
        row.viewUsers >= EXPLORE_SIGNAL_CARD_ENGAGEMENT_FLOOR ||
        row.autocompleteUsers >= EXPLORE_SIGNAL_EXPLICIT_SELECTION_FLOOR ||
        row.favoriteUsers >= EXPLORE_SIGNAL_FAVORITE_FLOOR ||
        unmetDistinctUsers >= EXPLORE_SIGNAL_UNMET_FLOOR;

      if (!signalFloorMet) {
        continue;
      }

      const termKey = row.entityName.trim().toLowerCase();
      const globalQueryUsers =
        globalQueryUsersByTerm.get(`${row.entityType}:${termKey}`) ?? 0;

      const trend = trendByEntityId.get(row.entityId) ?? {
        queryUsers7d: 0,
        queryUsersPrev7d: 0,
      };

      candidates.push({
        term: row.entityName,
        normalizedTerm: '',
        slice: 'explore',
        score: 0,
        entityType: row.entityType,
        origin: {
          entityId: row.entityId,
          favoriteUsers: row.favoriteUsers,
          cardEngagementUsers: row.viewUsers,
          explicitSelectionUsers: row.autocompleteUsers,
          queryUsersPrimary: row.queryUsersPrimary,
          unmetDistinctUsers,
          viewUsers: row.viewUsers,
          autocompleteUsers: row.autocompleteUsers,
          lastQueryAt: row.lastQueryAt?.toISOString() ?? null,
          lastViewAt: row.lastViewAt?.toISOString() ?? null,
          queryUsers7d: trend.queryUsers7d,
          queryUsersPrev7d: trend.queryUsersPrev7d,
          localQueryUsers: row.queryUsersPrimary,
          globalQueryUsers,
        },
      });
    }

    return candidates;
  }

  private async loadEntityDemandSignalRows(params: {
    collectableMarketKey: string;
    since: Date;
    limit: number;
  }): Promise<
    Array<{
      entityId: string;
      entityType: EntityType;
      entityName: string;
      favoriteUsers: number;
      viewUsers: number;
      autocompleteUsers: number;
      queryUsersPrimary: number;
      lastQueryAt: Date | null;
      lastViewAt: Date | null;
    }>
  > {
    const limit =
      Number.isFinite(params.limit) && params.limit > 0
        ? Math.floor(params.limit)
        : ENTITY_SIGNAL_CANDIDATE_LIMIT;
    const sinceKey = this.formatDateKey(params.since);

    if (!params.collectableMarketKey.trim()) {
      return [];
    }

    return await this.prisma.$queryRaw<
      Array<{
        entityId: string;
        entityType: EntityType;
        entityName: string;
        favoriteUsers: number;
        viewUsers: number;
        autocompleteUsers: number;
        queryUsersPrimary: number;
        lastQueryAt: Date | null;
        lastViewAt: Date | null;
      }>
    >(Prisma.sql`
      WITH local_query_user AS (
        SELECT
          entity_id,
          entity_type,
          user_id,
          SUM(signal_count * CASE WHEN signal_kind = 'cache' THEN 0.35 ELSE 1.0 END)::float AS user_signal_count,
          MAX(last_seen_at) AS last_query_at
        FROM user_search_demand_daily
        WHERE demand_date >= ${sinceKey}::date
          AND subject_kind = 'entity'
          AND source_kind = 'search_log'
          AND signal_kind IN ('backend', 'cache')
          AND user_id IS NOT NULL
          AND entity_id IS NOT NULL
          AND entity_type IS NOT NULL
          AND market_key IS NULL
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${params.collectableMarketKey})
        GROUP BY entity_id, entity_type, user_id
      ),
      local_query AS (
        SELECT
          entity_id,
          entity_type,
          SUM(LN(1 + user_signal_count) / LN(2))::float AS query_users_primary,
          MAX(last_query_at) AS last_query_at
        FROM local_query_user
        GROUP BY entity_id, entity_type
        ORDER BY query_users_primary DESC, last_query_at DESC
        LIMIT ${limit}
      ),
      local_autocomplete_user AS (
        SELECT
          entity_id,
          entity_type,
          user_id,
          SUM(signal_count * 1.5)::float AS user_signal_count
        FROM user_search_demand_daily
        WHERE demand_date >= ${sinceKey}::date
          AND subject_kind = 'entity'
          AND source_kind = 'search_log'
          AND signal_kind = 'autocomplete_selection'
          AND user_id IS NOT NULL
          AND entity_id IS NOT NULL
          AND entity_type IS NOT NULL
          AND market_key IS NULL
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${params.collectableMarketKey})
        GROUP BY entity_id, entity_type, user_id
      ),
      local_autocomplete AS (
        SELECT
          entity_id,
          entity_type,
          SUM(LN(1 + user_signal_count) / LN(2))::float AS autocomplete_users
        FROM local_autocomplete_user
        GROUP BY entity_id, entity_type
        ORDER BY autocomplete_users DESC
        LIMIT ${limit}
      ),
      candidate_ids AS (
        SELECT entity_id, entity_type FROM local_query
        UNION
        SELECT entity_id, entity_type FROM local_autocomplete
      )
      SELECT
        e.entity_id AS "entityId",
        e.type AS "entityType",
        e.name AS "entityName",
        0::float AS "favoriteUsers",
        0::float AS "viewUsers",
        NULL::timestamp AS "lastViewAt",
        COALESCE(la.autocomplete_users, 0)::float AS "autocompleteUsers",
        COALESCE(lq.query_users_primary, 0)::float AS "queryUsersPrimary",
        lq.last_query_at AS "lastQueryAt"
      FROM candidate_ids c
      JOIN core_entities e ON e.entity_id = c.entity_id
      LEFT JOIN local_autocomplete la
        ON la.entity_id = c.entity_id AND la.entity_type = c.entity_type
      LEFT JOIN local_query lq
        ON lq.entity_id = c.entity_id AND lq.entity_type = c.entity_type
      WHERE e.type IN ('restaurant', 'food', 'food_attribute', 'restaurant_attribute')
      ORDER BY
        (
          COALESCE(la.autocomplete_users, 0) * 2
          + COALESCE(lq.query_users_primary, 0)
        ) DESC,
        COALESCE(lq.last_query_at, 'epoch'::timestamp) DESC
      LIMIT ${limit}
    `);
  }

  private async loadTrendCountsByEntity(params: {
    collectableMarketKey: string;
    entityIds: string[];
    since: Date;
    trendSince: Date;
  }): Promise<Map<string, { queryUsers7d: number; queryUsersPrev7d: number }>> {
    if (!params.entityIds.length) {
      return new Map();
    }
    const sinceKey = this.formatDateKey(params.since);
    const trendSinceKey = this.formatDateKey(params.trendSince);

    const rows = await this.prisma.$queryRaw<
      Array<{
        entityId: string;
        queryUsers7d: number;
        queryUsersPrev7d: number;
      }>
    >(Prisma.sql`
      WITH user_counts AS (
        SELECT
          entity_id,
          user_id,
          SUM(signal_count * CASE WHEN signal_kind = 'cache' THEN 0.35 ELSE 1.0 END)
            FILTER (WHERE demand_date >= ${trendSinceKey}::date)::float AS current_signal_count,
          SUM(signal_count * CASE WHEN signal_kind = 'cache' THEN 0.35 ELSE 1.0 END)
            FILTER (
              WHERE demand_date >= ${sinceKey}::date
                AND demand_date < ${trendSinceKey}::date
            )::float AS previous_signal_count
        FROM user_search_demand_daily
        WHERE demand_date >= ${sinceKey}::date
          AND subject_kind = 'entity'
          AND source_kind = 'search_log'
          AND signal_kind IN ('backend', 'cache')
          AND user_id IS NOT NULL
          AND market_key IS NULL
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${
            params.collectableMarketKey
          })
          AND entity_id IN (${Prisma.join(
            params.entityIds.map((id) => Prisma.sql`${id}::uuid`),
          )})
        GROUP BY entity_id, user_id
      )
      SELECT
        entity_id AS "entityId",
        COALESCE(SUM(LN(1 + COALESCE(current_signal_count, 0)) / LN(2)), 0)::float AS "queryUsers7d",
        COALESCE(SUM(LN(1 + COALESCE(previous_signal_count, 0)) / LN(2)), 0)::float AS "queryUsersPrev7d"
      FROM user_counts
      GROUP BY entity_id
    `);

    return new Map(
      rows.map((row) => [
        row.entityId,
        {
          queryUsers7d: row.queryUsers7d,
          queryUsersPrev7d: row.queryUsersPrev7d,
        },
      ]),
    );
  }

  private async loadGlobalQueryCountsByTerm(params: {
    since: Date;
    termKeys: string[];
    entityTypes: EntityType[];
  }): Promise<Map<string, number>> {
    if (!params.termKeys.length || !params.entityTypes.length) {
      return new Map();
    }
    const sinceKey = this.formatDateKey(params.since);

    const rows = await this.prisma.$queryRaw<
      Array<{
        entityType: EntityType;
        termKey: string;
        globalQueryUsers: number;
      }>
    >(Prisma.sql`
      WITH user_counts AS (
        SELECT
          e.type AS entity_type,
          LOWER(e.name) AS term_key,
          d.user_id,
          SUM(d.signal_count * CASE WHEN d.signal_kind = 'cache' THEN 0.35 ELSE 1.0 END)::float AS user_signal_count
        FROM user_search_demand_daily d
        JOIN core_entities e ON e.entity_id = d.entity_id
        WHERE d.demand_date >= ${sinceKey}::date
          AND d.subject_kind = 'entity'
          AND d.source_kind = 'search_log'
          AND d.signal_kind IN ('backend', 'cache')
          AND d.market_key IS NULL
          AND d.collectable_market_key IS NULL
          AND d.user_id IS NOT NULL
          AND LOWER(e.name) IN (${Prisma.join(params.termKeys)})
          AND e.type IN (${Prisma.join(
            params.entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
          )})
        GROUP BY e.type, LOWER(e.name), d.user_id
      )
      SELECT
        entity_type AS "entityType",
        term_key AS "termKey",
        COALESCE(SUM(LN(1 + user_signal_count) / LN(2)), 0)::float AS "globalQueryUsers"
      FROM user_counts
      GROUP BY entity_type, term_key
    `);

    return new Map(
      rows.map((row) => [
        `${row.entityType}:${row.termKey}`,
        row.globalQueryUsers,
      ]),
    );
  }

  private async loadRefreshCandidates(
    collectableMarketKey: string,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: { collectableMarketKey },
      orderBy: [{ lastSuccessAt: 'asc' }, { lastAttemptAt: 'asc' }],
      take: MAX_TERMS_PER_CYCLE * 10,
    });

    return rows.map((row) => {
      const stalenessDays = this.calculateStalenessDays(
        row.lastSuccessAt,
        row.lastAttemptAt,
        now,
      );
      const stalenessScore = clamp01(
        stalenessDays / REFRESH_STALENESS_SATURATION_DAYS,
      );

      return {
        term: row.normalizedTerm,
        normalizedTerm: row.normalizedTerm,
        slice: 'refresh',
        score: stalenessScore,
        origin: {
          stalenessDays,
          lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
          lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
          lastOutcome: row.lastOutcome ?? null,
          cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
        },
      };
    });
  }

  private calculateStalenessDays(
    lastSuccessAt: Date | null,
    lastAttemptAt: Date | null,
    now: Date,
  ): number {
    const anchor = lastSuccessAt ?? lastAttemptAt;
    if (!anchor) {
      return 365;
    }
    const days = (now.getTime() - anchor.getTime()) / MS_PER_DAY;
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    return Math.min(365, days);
  }

  private async loadAttemptHistoryByTerm(params: {
    collectableMarketKey: string;
    normalizedTerms: string[];
  }): Promise<
    Map<
      string,
      {
        cooldownUntil: Date | null;
        lastOutcome: KeywordAttemptOutcome | null;
        lastAttemptAt: Date | null;
      }
    >
  > {
    if (!params.normalizedTerms.length) {
      return new Map();
    }

    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: {
        collectableMarketKey: params.collectableMarketKey,
        normalizedTerm: { in: params.normalizedTerms },
      },
      select: {
        normalizedTerm: true,
        cooldownUntil: true,
        lastOutcome: true,
        lastAttemptAt: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.normalizedTerm,
        {
          cooldownUntil: row.cooldownUntil,
          lastOutcome: row.lastOutcome,
          lastAttemptAt: row.lastAttemptAt,
        },
      ]),
    );
  }

  private async lookupCommunity(subreddit: string): Promise<CommunityLookup> {
    if (!subreddit.length) {
      return null;
    }

    return (await this.prisma.collectionCommunity.findFirst({
      where: {
        communityName: { equals: subreddit, mode: 'insensitive' },
      },
      select: { safeIntervalDays: true },
    })) as CommunityLookup;
  }

  private resolveSafeIntervalDays(community: CommunityLookup): number {
    const raw =
      typeof community?.safeIntervalDays === 'number'
        ? community.safeIntervalDays
        : null;
    if (raw && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return DEFAULT_SAFE_INTERVAL_DAYS;
  }
}
