/**
 * §11 term selection for one SOURCE's keyword dispatch, at priors (§22 item 7).
 *
 * The four judgment FAMILIES — unmet, refresh, demand, explore — propose
 * candidates; the §11 portfolio applies:
 * - TWO floors only, each a fraction of the dispatch (K1 sentences; the
 *   FRACTIONS are K2 priors marked OWNER-RATIFY §18.1): UNMET ("user-expressed
 *   gaps always get attention" — a product promise independent of yield) and
 *   EXPLORE ("insurance for the unmeasurable").
 * - Refresh + demand compete for ALL remaining capacity via WITHIN-FAMILY
 *   percentile normalization — cross-family weights do not exist (the old
 *   SLICE_QUOTAS + SLICE_BACKFILL_WEIGHT machinery is dead).
 *
 * Demand inputs (C3): territory demand is read from the signals ledger /
 * signal_demand_daily aggregate via SignalDemandReadService — the old
 * user_search_demand_daily reads are DEAD. Territory = the engine's member
 * places + DAG descendants (derived, never stored). The unmet family still
 * reads the on-demand ask-event gap record keyed by the engine's legacy
 * market-key name; that table moves onto the ledger in Phase C.
 *
 * Expected-new-content model (§11) at priors: the attempt-history cooldown
 * constants ARE its cold-start priors (the measured arrival × hit reader is
 * trigger-deferred per §22 — see collector-estimators.ts); unmet demand may
 * PIERCE the clamp via the smooth no-results recovery (§11 merge law).
 */
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
import { DemandScoringTraceService } from '../../analytics/demand-scoring-trace.service';
import * as curves from '../../analytics/demand-scoring/curves';
import { ON_DEMAND_MIN_RESULTS } from '../../search/on-demand-tuning.constants';
import { SignalDemandReadService } from '../../signals/signal-demand-read.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** §11 keyword recall / dispatch size — fixture-set ~25–100; 25 is the
 *  standing prior (OWNER-RATIFY §18.1). */
const MAX_TERMS_PER_CYCLE = 25;

/** §11 portfolio floor FRACTIONS of each dispatch — K2 priors, OWNER-RATIFY
 *  (§18.1). Derived from the pre-cut quotas (5/25, 2/25) so the priors
 *  edition is behaviorally continuous. */
export const UNMET_FLOOR_FRACTION = 0.2;
export const EXPLORE_FLOOR_FRACTION = 0.08;

/** Score-quality gates per family (a floor guarantees ATTENTION when real
 *  candidates exist — it never manufactures busywork). */
const MIN_SELECTABLE_SCORE_BY_SLICE: Record<KeywordSlice, number> = {
  unmet: 1,
  refresh: 0.2,
  demand: 1,
  explore: 0.2,
};

/** Dedupe priority: floor families first, then the competitive families. */
const SLICE_PRIORITY: KeywordSlice[] = [
  'unmet',
  'explore',
  'refresh',
  'demand',
];

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TREND_WINDOW_DAYS = 7;
const KEYWORD_COLLECTION_SCORER_VERSION = 'keyword-collection-v2';
const UNMET_CURRENT_CYCLE_DAYS = 7;
const UNMET_HALF_LIFE_DAYS = 14;

/** 45d no-results recovery — K2 prior of the expected-new-content model
 *  (§16: the cooldown constants survive as its cold-start priors). */
const NO_RESULTS_RECOVERY_DAYS = 45;

const REFRESH_STALENESS_SATURATION_DAYS = 90;

const EXPLORE_RECENT_ATTEMPT_DAYS = 30;

/** Explore admission floor: distinct territory actors (K2 prior). */
const EXPLORE_DISTINCT_ACTOR_FLOOR = 2;

const ENTITY_SIGNAL_CANDIDATE_LIMIT = MAX_TERMS_PER_CYCLE * 50;

const COLLECTIBLE_ENTITY_TYPES = [
  'restaurant',
  'food',
  'food_attribute',
  'restaurant_attribute',
];

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

/** The source under selection — §10: work keys off SOURCE rows. */
export interface KeywordSelectionSource {
  sourceId: string;
  /** Platform handle (subreddit). */
  handle: string;
  engineId: string;
  /** Engine natural key — the legacy collectable market key during Phase B/C
   *  (the ask-event unmet lane and attempt-history legacy PK read by it). */
  engineName: string;
  territoryPlaceIds: string[];
  safeIntervalDays: number;
}

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
  dropped: {
    invalid: number;
    cooldown: number;
    deduped: number;
  };
}

export interface KeywordSliceSelectionResult {
  source: KeywordSelectionSource;
  windowDays: number;
  maxTerms: number;
  floors: { unmet: number; explore: number };
  terms: KeywordTermCandidate[];
  stats: KeywordSliceSelectionStats;
}

interface KeywordGateRejectTrace {
  candidate: KeywordTermCandidate;
  decisionState: DemandScoringDecisionState;
  decisionReason: string;
}

@Injectable()
export class KeywordSliceSelectionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalDemand: SignalDemandReadService,
    private readonly scoringTrace: DemandScoringTraceService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('KeywordSliceSelectionService');
  }

  async selectTermsForSource(
    source: KeywordSelectionSource,
  ): Promise<KeywordSliceSelectionResult> {
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
      dropped: { invalid: 0, cooldown: 0, deduped: 0 },
    };
    const gateRejects: KeywordGateRejectTrace[] = [];

    const territoryDemand = await this.signalDemand.territoryEntityDemand({
      placeIds: source.territoryPlaceIds,
      windowDays,
      limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
      entityTypes: COLLECTIBLE_ENTITY_TYPES,
    });

    const candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: await this.loadUnmetCandidates(
        source.territoryPlaceIds,
        since,
        now,
      ),
      refresh: await this.loadRefreshCandidates(source.engineId, now),
      demand: territoryDemand.map((row) => ({
        term: row.entityName,
        normalizedTerm: '',
        slice: 'demand' as const,
        score: row.demandScore,
        entityType: row.entityType as EntityType,
        origin: {
          entityId: row.entityId,
          demandScore: row.demandScore,
          distinctActors: row.distinctActors,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        },
      })),
      explore: await this.loadExploreCandidates({
        source,
        territoryDemand,
        since,
        trendWindowDays,
        windowDays,
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
      engineId: source.engineId,
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
        // §11 merge law: the expected-new-content clamp (cooldown priors) may
        // be PIERCED by renewed user-expressed demand — unmet no-results
        // candidates recover smoothly instead of hard-gating.
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
            decisionReason: 'expected_new_content_clamp',
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

    const maxTerms = MAX_TERMS_PER_CYCLE;
    const floors = {
      unmet: Math.round(UNMET_FLOOR_FRACTION * maxTerms),
      explore: Math.round(EXPLORE_FLOOR_FRACTION * maxTerms),
    };
    const selection = this.selectWithFloorsAndCompetition({
      candidatesBySlice: dedupedBySlice,
      floors,
      maxTerms,
    });

    for (const slice of SLICE_PRIORITY) {
      stats.selectedBySlice[slice] = selection.selectedBySlice[slice].length;
    }
    const finalSelection = selection.selected;

    this.logger.debug('Selected keyword terms for dispatch', {
      sourceId: source.sourceId,
      handle: source.handle,
      engineId: source.engineId,
      maxTerms,
      floors,
      stats,
      sample: finalSelection.slice(0, 10).map((term) => ({
        slice: term.slice,
        term: term.term,
        normalizedTerm: term.normalizedTerm,
        score: term.score,
      })),
    });

    await this.traceKeywordSelection({
      engineName: source.engineName,
      cycleStartAt: since,
      cycleEndAt: now,
      candidatesBySlice: dedupedBySlice,
      gateRejects,
      selected: finalSelection,
      maxTerms,
      floors,
    });

    return {
      source,
      windowDays,
      maxTerms,
      floors,
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

  /**
   * §11 portfolio selection: two FLOORS (fractions of the dispatch) for unmet
   * and explore; refresh + demand compete for everything else via
   * within-family PERCENTILE normalization (a family's #1 is comparable to
   * the other family's #1 regardless of score units — cross-family weights
   * do not exist). A floor family with fewer real candidates than its floor
   * returns the slack to the competitive pool.
   */
  private selectWithFloorsAndCompetition(params: {
    candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
    floors: { unmet: number; explore: number };
    maxTerms: number;
  }): {
    selected: KeywordTermCandidate[];
    selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
  } {
    const selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: [],
      refresh: [],
      demand: [],
      explore: [],
    };
    const selectedTerms = new Set<string>();
    const selected: KeywordTermCandidate[] = [];

    const take = (candidate: KeywordTermCandidate, slice: KeywordSlice) => {
      selected.push(candidate);
      selectedBySlice[slice].push(candidate);
      selectedTerms.add(candidate.normalizedTerm);
    };

    // 1. Floors — filled by score, quality-gated.
    for (const slice of ['unmet', 'explore'] as const) {
      const floor = params.floors[slice];
      for (const candidate of params.candidatesBySlice[slice]) {
        if (selectedBySlice[slice].length >= floor) break;
        if (selected.length >= params.maxTerms) break;
        if (!this.isSelectableCandidate(candidate)) continue;
        if (selectedTerms.has(candidate.normalizedTerm)) continue;
        take(candidate, slice);
      }
    }

    // 2. Refresh + demand compete for the remainder by within-family
    //    percentile (rank position inside its own family).
    const competitors: Array<{
      candidate: KeywordTermCandidate;
      slice: KeywordSlice;
      percentile: number;
    }> = [];
    for (const slice of ['refresh', 'demand'] as const) {
      const family = params.candidatesBySlice[slice].filter(
        (candidate) =>
          this.isSelectableCandidate(candidate) &&
          !selectedTerms.has(candidate.normalizedTerm),
      );
      family.forEach((candidate, index) => {
        competitors.push({
          candidate,
          slice,
          percentile: 1 - index / Math.max(1, family.length),
        });
      });
    }
    competitors.sort(
      (a, b) =>
        b.percentile - a.percentile || b.candidate.score - a.candidate.score,
    );
    for (const { candidate, slice } of competitors) {
      if (selected.length >= params.maxTerms) break;
      if (selectedTerms.has(candidate.normalizedTerm)) continue;
      take(candidate, slice);
    }

    // 3. Floor-family overflow backfills any remaining capacity (floors are
    //    minimums, not caps).
    for (const slice of ['unmet', 'explore'] as const) {
      for (const candidate of params.candidatesBySlice[slice]) {
        if (selected.length >= params.maxTerms) break;
        if (!this.isSelectableCandidate(candidate)) continue;
        if (selectedTerms.has(candidate.normalizedTerm)) continue;
        take(candidate, slice);
      }
    }

    return { selected, selectedBySlice };
  }

  private async traceKeywordSelection(params: {
    engineName: string;
    cycleStartAt: Date;
    cycleEndAt: Date;
    candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
    gateRejects?: KeywordGateRejectTrace[];
    selected: KeywordTermCandidate[];
    maxTerms: number;
    floors: { unmet: number; explore: number };
  }): Promise<void> {
    try {
      const runId = await this.scoringTrace.createRun({
        consumerKind: DemandScoringConsumerKind.keyword_collection,
        collectableMarketKey: params.engineName,
        cycleStartAt: params.cycleStartAt,
        cycleEndAt: params.cycleEndAt,
        scorerVersion: KEYWORD_COLLECTION_SCORER_VERSION,
        traceAllCandidates: shouldTraceAllDemandCandidates(),
        metadata: {
          maxTerms: params.maxTerms,
          floors: params.floors,
          floorFractions: {
            unmet: UNMET_FLOOR_FRACTION,
            explore: EXPLORE_FLOOR_FRACTION,
          },
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
          engineName: params.engineName,
          candidate,
          rank: index + 1,
          selected: true,
          decisionState: DemandScoringDecisionState.selected,
          decisionReason: 'selected_by_floor_or_competition',
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
            engineName: params.engineName,
            candidate,
            selected: false,
            decisionState: isDebugOnlyCandidate
              ? DemandScoringDecisionState.budget_reject
              : DemandScoringDecisionState.near_miss,
            decisionReason: isDebugOnlyCandidate
              ? 'trace_all_not_selected'
              : 'strong_leftover_after_dispatch',
            traceScope: isDebugOnlyCandidate ? 'all_candidate' : 'near_miss',
          });
        });
      });

      await this.scoringTrace.recordCandidates(runId, [
        ...selectedTraces,
        ...nearMisses,
        ...(params.gateRejects ?? []).map((reject) =>
          this.buildKeywordTraceCandidate({
            engineName: params.engineName,
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
        engineName: params.engineName,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private buildKeywordTraceCandidate(params: {
    engineName: string;
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
      collectableMarketKey: params.engineName,
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

  private isSelectableCandidate(candidate: KeywordTermCandidate): boolean {
    const score = Number.isFinite(candidate.score) ? candidate.score : 0;
    return score >= MIN_SELECTABLE_SCORE_BY_SLICE[candidate.slice];
  }

  private resolveWindowDays(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
      const currentActs =
        typeof origin.currentActs === 'number' ? origin.currentActs : 0;
      const previousActs =
        typeof origin.previousActs === 'number' ? origin.previousActs : 0;
      const localDemand =
        typeof origin.localDemand === 'number' ? origin.localDemand : 0;
      const globalDemand =
        typeof origin.globalDemand === 'number' ? origin.globalDemand : 0;

      const trend = clamp01(
        (currentActs - previousActs) / Math.max(1, previousActs),
      );

      const otherDemand = Math.max(0, globalDemand - localDemand);
      const localSpecialization = clamp01(
        (localDemand + 1) / (otherDemand + 1) / 3,
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

  /**
   * UNMET family — user-expressed collection gaps read from the signals
   * ledger (kind = 'on_demand_ask'), scoped by the engine's TERRITORY (C3:
   * demand reaches collection only through the ledger; the legacy
   * collection_on_demand_ask_events read died in Phase C).
   */
  private async loadUnmetCandidates(
    territoryPlaceIds: string[],
    since: Date,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.signalDemand.territoryUnmetAsks({
      placeIds: territoryPlaceIds,
      since,
      limit: MAX_TERMS_PER_CYCLE * 10,
    });

    return rows
      .filter((row): row is typeof row & { entityType: EntityType } =>
        (Object.values(EntityType) as string[]).includes(row.entityType),
      )
      .map((request) => ({
        term: request.term,
        normalizedTerm: '',
        slice: 'unmet',
        score: this.calculateUnmetScore({
          distinctUsers: request.distinctUserCount,
          demandScore: request.demandScore,
          reason: request.reason as OnDemandReason,
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

  /**
   * EXPLORE family — territory entities with a minimal distinct-actor
   * footprint scored by novelty + local specialization + trend, all read
   * from the signals substrate.
   */
  private async loadExploreCandidates(params: {
    source: KeywordSelectionSource;
    territoryDemand: Array<{
      entityId: string;
      entityType: string;
      entityName: string;
      demandScore: number;
      distinctActors: number;
      lastSeenAt: Date | null;
    }>;
    since: Date;
    trendWindowDays: number;
    windowDays: number;
  }): Promise<KeywordTermCandidate[]> {
    const eligible = params.territoryDemand.filter(
      (row) => row.distinctActors >= EXPLORE_DISTINCT_ACTOR_FLOOR,
    );
    if (!eligible.length) {
      return [];
    }
    const entityIds = eligible.map((row) => row.entityId);
    const [trendByEntity, globalDemandByEntity] = await Promise.all([
      this.signalDemand.territoryEntityTrend({
        placeIds: params.source.territoryPlaceIds,
        entityIds,
        trendWindowDays: params.trendWindowDays,
      }),
      this.signalDemand.globalEntityDemand({
        entityIds,
        windowDays: params.windowDays,
      }),
    ]);

    return eligible.map((row) => {
      const trend = trendByEntity.get(row.entityId) ?? {
        currentActs: 0,
        previousActs: 0,
      };
      return {
        term: row.entityName,
        normalizedTerm: '',
        slice: 'explore' as const,
        score: 0,
        entityType: row.entityType as EntityType,
        origin: {
          entityId: row.entityId,
          distinctActors: row.distinctActors,
          localDemand: row.demandScore,
          globalDemand: globalDemandByEntity.get(row.entityId) ?? 0,
          currentActs: trend.currentActs,
          previousActs: trend.previousActs,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        },
      };
    });
  }

  /** REFRESH family — the (engine, term) attempt ledger, staleness-scored. */
  private async loadRefreshCandidates(
    engineId: string,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: { engineId },
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
    engineId: string;
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
        engineId: params.engineId,
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
}
