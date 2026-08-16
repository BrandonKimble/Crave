/**
 * §11 term selection for one SOURCE's keyword dispatch, at priors (§22 item 7).
 *
 * The four judgment FAMILIES — unmet, refresh, demand, explore — propose
 * candidates; the §11 portfolio applies:
 * - TWO floors only, each a fraction of the dispatch (K1 sentences; the
 *   FRACTIONS RATIFIED 2026-07-19, owner docket item 5): UNMET ("user-expressed
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
 * market-key name (markets exterminated 2026-07-22; name is history).
 *
 * EXPLORE ranking (D41, 2026-08-03): the explore family's score is the
 * MEASURED upper-confidence bound on its vocabulary class's yield —
 * documents returned per search, per (engine, entityType), through the
 * estimator registry over its new durable state table. The hand-weighted
 * blend that stood here (0.45 novelty + 0.35 localSpecialization + 0.2
 * trend) ranked spend on three proxies for a quantity the attempt ledger
 * had been measuring all along. Ties — every class at cold start — break by
 * COVERAGE ROTATION (never-attempted first, then oldest), a scan policy
 * rather than a score.
 *
 * Expected-new-content model (§11) — DERIVED, no timers (no-fake-estimates
 * law, 2026-07-24): a harvested term is eligible again when
 * (corpusNow − corpusAtHarvest) × (lastResultCount ÷ corpusAtHarvest) ≥ 1 —
 * the source has produced enough new content that the term's MEASURED match
 * share expects at least one whole new document (the smallest honest count;
 * same pattern as §2(e) frequent = 2). Rotation emerges without cooldowns:
 * just-harvested terms have corpus delta ≈ 0 and sink; hot sources
 * resurface terms fast, quiet ones slowly. Measured-barren terms (share 0)
 * re-enter only via renewed user demand (the §11 unmet PIERCE — known-zero
 * is evidence, not a timeout). Never-harvested terms are always eligible
 * (candidacy itself is demand-ranked; the first search IS the measurement).
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
import {
  JudgedVocabularyService,
  tokenize as judgedVocabularyTokens,
} from '../entity-resolver/judged-vocabulary.service';
import { normalizeClaimLocale } from '../entity-resolver/word-vocabulary-lanes';
import { DemandScoringTraceService } from '../../analytics/demand-scoring-trace.service';
import * as curves from '../../analytics/demand-scoring/curves';
import { ON_DEMAND_MIN_RESULTS } from '../../search/on-demand-tuning.constants';
import { SignalDemandReadService } from '../../signals/signal-demand-read.service';
import { OpsAlertsService } from '../../external-integrations/shared/ops-alerts.service';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { KeywordExploreYieldEstimatorService } from './keyword-explore-yield.estimator';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** §11 keyword recall / dispatch size — fixture-set ~25–100; 25 is the
 *  standing prior (§11 recall prior — standing owner item, unchanged). */
const MAX_TERMS_PER_CYCLE = 25;

/** §11 portfolio floor FRACTIONS of each dispatch — K2 priors carried from
 * the old 5/25 + 2/25 quotas; RATIFIED 2026-07-19 (owner docket item 5).
 *  (§18.1). Derived from the pre-cut quotas (5/25, 2/25) so the priors
 *  edition is behaviorally continuous. */
export const UNMET_FLOOR_FRACTION = 0.2;
export const EXPLORE_FLOOR_FRACTION = 0.08;

/** Score-quality gates per family (a floor guarantees ATTENTION when real
 *  candidates exist — it never manufactures busywork). */
// §16 K1 INTERIM — RATIFIED 2026-07-24 (§18-8b(c), owner-delegated):
// quality bars so weak candidates don't spend budget. Honest units:
// refresh 0.2 ⇔ "a term earns a refresh only after ≥18 days stale"
// (0.2 × the 90d staleness saturation); unmet/demand 1 = one whole unit
// of demand-score mass. Scheduled to DISSOLVE into rank-under-budget
// when the v2 scheduler lands — bars die when ranking makes them moot.
// EXPLORE's bar is 0 here BY DERIVATION, not by omission (D41 §5). The old
// 0.2 was denominated in the deleted blend's [0,1] units and could not
// outlive it. Explore now scores in DOCUMENTS (a measured-yield upper
// bound), and the document-units bar already exists upstream in this file's
// own law — the expected-new-docs clamp, "≥ 1 whole document", the smallest
// honest count. Restating it here would be a second, redundant opinion.
const MIN_SELECTABLE_SCORE_BY_SLICE: Record<KeywordSlice, number> = {
  unmet: 1,
  refresh: 0.2,
  demand: 1,
  explore: 0,
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

/** 45d no-results recovery — K1 (the 45d no-results recovery sentence, §16 K1 list — cross-referenced by K2)
 *  (§16: the cooldown constants survive as its cold-start priors). */
const NO_RESULTS_RECOVERY_DAYS = 45;

const REFRESH_STALENESS_SATURATION_DAYS = 90;

/** Explore admission floor: distinct territory actors (K2 prior). */
const EXPLORE_DISTINCT_ACTOR_FLOOR = 2;

const ENTITY_SIGNAL_CANDIDATE_LIMIT = MAX_TERMS_PER_CYCLE * 50;

const COLLECTIBLE_ENTITY_TYPES = [
  'restaurant',
  'food',
  'item_attribute',
  'place_attribute',
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

/**
 * Coverage rotation key (D41 §3): never-attempted sorts first (−Infinity),
 * then oldest attempt first. Read from the attempt ledger's lastAttemptAt,
 * which the explore branch records into origin.
 */
function coverageRotationKey(candidate: KeywordTermCandidate): number {
  const raw =
    candidate.origin && typeof candidate.origin === 'object'
      ? candidate.origin.lastAttemptAt
      : null;
  if (typeof raw !== 'string') {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function shouldTraceAllDemandCandidates(): boolean {
  // Canonical env-flag dialect (F466/F401): default OFF, unchanged.
  return isEnvFlagEnabled(process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES);
}

export type KeywordSlice = 'unmet' | 'refresh' | 'demand' | 'explore';

/**
 * THE derived expected-new-docs law (no-fake-estimates, 2026-07-24), pure:
 * how many new documents a re-search of this term should return, from the
 * harvest snapshot alone. corpus delta × measured match share. Infinity =
 * never harvested (the first search IS the measurement — always eligible).
 */
export function keywordTermExpectedNewDocs(
  history:
    | {
        lastHarvestAt: Date | null;
        lastResultCount: number | null;
        corpusDocsAtHarvest: number | null;
      }
    | undefined,
  corpusDocsNow: number,
): number {
  const harvested =
    history?.lastHarvestAt != null &&
    typeof history.corpusDocsAtHarvest === 'number' &&
    history.corpusDocsAtHarvest > 0;
  if (!harvested) {
    return Number.POSITIVE_INFINITY;
  }
  const corpusAtHarvest = history.corpusDocsAtHarvest as number;
  return (
    Math.max(0, corpusDocsNow - corpusAtHarvest) *
    ((history.lastResultCount ?? 0) / corpusAtHarvest)
  );
}

/** The source under selection — §10: work keys off SOURCE rows. */
export interface KeywordSelectionSource {
  sourceId: string;
  /** Platform handle (subreddit). */
  handle: string;
  engineId: string;
  /** Engine natural key (historical market-key format; markets are gone —
   *  the ask-event unmet lane and attempt-history PK still read it). */
  engineName: string;
  territoryPlaceIds: string[];
}

export interface KeywordTermCandidate {
  term: string;
  normalizedTerm: string;
  /**
   * The language this term was ASKED in. GENERICNESS IS A CLAIM ABOUT A
   * LANGUAGE: 'top' is a filler word in English and a real word in
   * Vietnamese, so stripping a term's tokens without knowing its language
   * either mangles a foreign ask or lets an English filler through — and a
   * term judged generic-only is DELETED from the cycle, not merely trimmed.
   *
   * EVERY SLICE ANSWERS THIS NOW (F5, 2026-08-11). It used to be "unmet
   * only", with the other three left null and a comment explaining that null
   * meant English-by-construction — which is a fact stated in a comment
   * where the code needed it as a value:
   *   - unmet   — the asker's own language, from `signals.detected_locale`.
   *   - demand / explore — one of OUR canonical entity names, English by
   *     construction (the non-English vocabulary lives in entity_surface).
   *   - refresh — read back off the attempt ledger's own `locale` column,
   *     which exists precisely because this slice re-runs a term days later
   *     with no request in scope.
   *
   * null now means what it should: nobody ever recorded one. It still
   * resolves to the stripper's default.
   */
  locale?: string | null;
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
    belowExpectedNew: number;
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
    private readonly exploreYield: KeywordExploreYieldEstimatorService,
    private readonly scoringTrace: DemandScoringTraceService,
    private readonly opsAlerts: OpsAlertsService,
    private readonly judgedVocabulary: JudgedVocabularyService,
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
      dropped: { invalid: 0, belowExpectedNew: 0, deduped: 0 },
    };
    const gateRejects: KeywordGateRejectTrace[] = [];

    // SKIP THIS CYCLE, LOUDLY (audit 2026-08-02, F207).
    //
    // The demand read's expansions (redirect sources, place ancestors) used to
    // swallow a DB error and return the unexpanded input — a SMALLER demand
    // score with nothing to say it was smaller, feeding straight into what
    // this selection decides to enrich, i.e. real money. They throw now, and
    // this is the call site that owns the policy: an unavailable demand read
    // is not "no demand". We do NOT select on a partial answer; the throw
    // propagates to the pacer, which logs and leaves the lane DUE so the next
    // tick retries — no cadence advance, no under-counted cycle. The alert is
    // here because the pacer's log alone is not owner-visible.
    let territoryDemand: Awaited<
      ReturnType<SignalDemandReadService['territoryEntityDemand']>
    >;
    try {
      territoryDemand = await this.signalDemand.territoryEntityDemand({
        placeIds: source.territoryPlaceIds,
        windowDays,
        limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
        entityTypes: COLLECTIBLE_ENTITY_TYPES,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Territory demand read failed; skipping this cycle', {
        handle: source.handle,
        sourceId: source.sourceId,
        error: { message },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        kind: 'collector_demand_read_unavailable',
        title: `Collector skipped a cycle: demand read unavailable (r/${source.handle})`,
        body: [
          `The territory demand read for r/${source.handle} could not be computed, so no keyword slice was selected this cycle.`,
          `Error: ${message}`,
          'This is the loud version of what used to be silent: the read previously degraded to an UNDER-COUNTED score and the collector spent against it.',
          'The lane stays due; the next tick retries.',
        ].join('\n'),
        dedupeKey: `collector_demand_read_unavailable:${source.sourceId}:${new Date().toISOString().slice(0, 10)}`,
      });
      throw error;
    }

    const candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: await this.loadUnmetCandidates(
        source.territoryPlaceIds,
        since,
        now,
      ),
      refresh: await this.loadRefreshCandidates(source.engineName, now),
      demand: territoryDemand.map((row) => ({
        term: row.entityName,
        normalizedTerm: '',
        // Our canonical entity name, English by construction — see the
        // explore loader below for why this is stated rather than left null.
        locale: 'en',
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
      candidatesBySlice[slice] = await this.normalizeAndFilterCandidates(
        candidatesBySlice[slice],
        stats,
        gateRejects,
      );
      candidatesBySlice[slice] = this.dedupeWithinSlice(
        candidatesBySlice[slice],
      );
      candidatesBySlice[slice] = candidatesBySlice[slice].sort((a, b) =>
        this.compareCandidates(a, b),
      );
      stats.candidatesBySlice[slice] = candidatesBySlice[slice].length;
    }

    // The eligibility derivation's live corpus size (posts only — the unit
    // reddit search results share). One count per selection.
    const corpusRows = await this.prisma.$queryRaw<
      Array<{ n: bigint | number }>
    >`
      SELECT count(*) AS n FROM collection_source_documents
      WHERE community = ${source.handle}
        AND source_type = 'post'
    `;
    const corpusDocsNow = Number(corpusRows[0]?.n ?? 0);

    const attemptHistoryMap = await this.loadAttemptHistoryByTerm({
      engineName: source.engineName,
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

    // D41 load-on-first-read: one durable fetch for the explore classes this
    // selection can rank, before any candidate is scored.
    await this.exploreYield.primeClasses(
      source.engineName,
      Array.from(
        new Set(
          candidatesBySlice.explore.map(
            (candidate) => candidate.entityType ?? 'unknown',
          ),
        ),
      ),
    );

    for (const slice of SLICE_PRIORITY) {
      const filtered: KeywordTermCandidate[] = [];
      for (const candidate of candidatesBySlice[slice]) {
        const history = attemptHistoryMap.get(candidate.normalizedTerm);
        // §11 merge law: the expected-new-content clamp may be PIERCED by
        // renewed user-expressed demand — unmet no-results candidates
        // recover smoothly instead of hard-gating.
        const shouldApplySmoothNoResultsRecovery =
          candidate.slice === 'unmet' &&
          history?.lastOutcome === KeywordAttemptOutcome.no_results;
        // THE DERIVED CLAMP: harvested terms wait until the corpus delta ×
        // their measured match share expects ≥ 1 whole new document.
        const expectedNewDocs = keywordTermExpectedNewDocs(
          history,
          corpusDocsNow,
        );
        if (expectedNewDocs < 1 && !shouldApplySmoothNoResultsRecovery) {
          stats.dropped.belowExpectedNew += 1;
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
          source.engineName,
        );
        filtered.push(adjusted);
      }
      candidatesBySlice[slice] = filtered.sort((a, b) =>
        this.compareCandidates(a, b),
      );
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

  /**
   * THE WRITE DOOR (2026-08-13). A surviving candidate becomes a keyword the
   * collector will pay Reddit and the LLM to search, so no unjudged token may
   * reach the demand record: every token of every candidate is heard, in its
   * own language, in ONE batched hearing before any of them is filtered.
   *
   * Batched deliberately at the slice level rather than per candidate — a
   * slice is hundreds of terms and a per-term door would be hundreds of round
   * trips for a question each word is only ever asked once.
   */
  private async normalizeAndFilterCandidates(
    candidates: KeywordTermCandidate[],
    stats: KeywordSliceSelectionStats,
    gateRejects?: KeywordGateRejectTrace[],
  ): Promise<KeywordTermCandidate[]> {
    const result: KeywordTermCandidate[] = [];

    await this.judgedVocabulary.ensureJudged(
      candidates.flatMap((candidate) =>
        judgedVocabularyTokens(candidate.term).map((word) => ({
          word,
          locale: candidate.locale ?? 'und',
        })),
      ),
    );

    for (const candidate of candidates) {
      const judged = this.judgedVocabulary.stripGrammar(
        candidate.term,
        judgedVocabularyTokens(candidate.term),
        normalizeClaimLocale(candidate.locale),
      );
      // HELD: a word here has no verdict yet, so this term may not become a
      // demand record. It is queued and returns on the next cycle, judged.
      const stripped =
        judged.isGenericOnly ||
        this.judgedVocabulary.holdsUnjudged(candidate.term, candidate.locale)
          ? { text: '', isGenericOnly: true }
          : this.judgedVocabulary.stripAskFrame(judged.text, candidate.locale);
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
        engineName: params.engineName,
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
      engineName: params.engineName,
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
        // Infinity is a legal explore score; JSON has no word for it.
        score: Number.isFinite(params.candidate.score)
          ? params.candidate.score
          : null,
        origin: this.toJsonValue(origin),
        ...(params.traceScope ? { traceScope: params.traceScope } : {}),
      } satisfies Prisma.InputJsonObject,
    };
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  }

  private isSelectableCandidate(candidate: KeywordTermCandidate): boolean {
    // An unmeasured upper bound is MAXIMAL, not missing: Infinity is the
    // registry's contract for "no measured dispersion", and the whole point
    // of optimistic selection is that such a candidate outranks every
    // measured one. Folding it to 0 (the old finite-or-zero rule) would have
    // made the starved candidate the first thing a bar rejected.
    if (candidate.score === Number.POSITIVE_INFINITY) {
      return true;
    }
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
    resultPlaceCount: number | null;
    resultItemCount: number | null;
    lastSeenAt: Date;
    now: Date;
  }): number {
    const severity =
      params.reason === 'low_result'
        ? this.calculateLowResultSeverity({
            placeCount: params.resultPlaceCount,
            itemCount: params.resultItemCount,
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
    placeCount: number | null;
    itemCount: number | null;
  }): number {
    const targetCount = ON_DEMAND_MIN_RESULTS;
    const observedCount =
      typeof params.placeCount === 'number'
        ? Math.max(params.placeCount, 0)
        : Math.max(params.itemCount ?? 0, 0);
    const coverage = clamp01(observedCount / targetCount);
    return curves.inverseCoverage(coverage, 1.2);
  }

  private applyAttemptHistoryAdjustments(
    candidate: KeywordTermCandidate,
    history:
      | {
          lastOutcome: KeywordAttemptOutcome | null;
          lastAttemptAt: Date | null;
        }
      | undefined,
    now: Date,
    engineName?: string,
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

      // D41: the score IS the class's measured-yield upper-confidence bound,
      // in DOCUMENTS PER SEARCH. Infinity = a class with no measured
      // dispersion, which therefore wins optimistically — the starved
      // candidate re-demonstrating, exactly what 'optimisticSelection'
      // promises and what the cold-start law asks for (act, then measure).
      //
      // The three proxies that used to be blended here — novelty, trend,
      // localSpecialization — are GONE as ranking inputs. Their raw inputs
      // (currentActs/previousActs/localDemand/globalDemand) stay in origin
      // as recorded diagnostics; nothing reads them to decide anything.
      const reading = engineName
        ? this.exploreYield.classReading(
            engineName,
            candidate.entityType ?? 'unknown',
            now,
          )
        : null;
      const upperBound = reading
        ? reading.estimate + reading.uncertainty
        : Number.POSITIVE_INFINITY;

      return {
        ...candidate,
        score: upperBound,
        origin: {
          ...origin,
          exploreYield: reading
            ? {
                estimate: reading.estimate,
                uncertainty: Number.isFinite(reading.uncertainty)
                  ? reading.uncertainty
                  : null,
                nEffective: reading.nEffective,
                priorWeight: reading.priorWeight,
                upperBound: Number.isFinite(upperBound) ? upperBound : null,
              }
            : null,
          lastOutcome: history?.lastOutcome ?? null,
          lastAttemptAt: history?.lastAttemptAt?.toISOString() ?? null,
        },
      };
    }

    return candidate;
  }

  /**
   * Ordering. Score DESC, written subtraction-free because an explore score
   * is legitimately Infinity and `Infinity - Infinity` is NaN — a comparator
   * that returns NaN silently leaves the array in whatever order it started.
   *
   * Within a tie, EXPLORE falls back to COVERAGE ROTATION (D41 §3):
   * never-attempted first, then least-recently-attempted. This is a scan
   * policy — explore is coverage of untried vocabulary — and deliberately
   * not a score: it reintroduces no weight and makes no claim about which
   * term is better, only which has waited longest for its turn.
   */
  private compareCandidates(
    a: KeywordTermCandidate,
    b: KeywordTermCandidate,
  ): number {
    if (a.score !== b.score) {
      return a.score > b.score ? -1 : 1;
    }
    if (a.slice === 'explore' && b.slice === 'explore') {
      return coverageRotationKey(a) - coverageRotationKey(b);
    }
    return 0;
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

    // UNTYPED DEMAND IS DEMAND (ideal-abstraction round 5): dispatch is a
    // literal keyword search on `term` — the type was never consulted, yet
    // this filter silently DROPPED every untyped ask (gazetteer residue).
    // A user asking for a word we lack is a complete collection seed.
    return rows.map((request) => ({
      term: request.term,
      normalizedTerm: '',
      // The asker's language, carried from the ledger (step 3 left this
      // English pending the column that now holds it).
      locale: request.detectedLocale,
      slice: 'unmet',
      score: this.calculateUnmetScore({
        distinctUsers: request.distinctUserCount,
        demandScore: request.demandScore,
        reason: request.reason as OnDemandReason,
        resultPlaceCount: request.resultPlaceCount,
        resultItemCount: request.resultItemCount,
        lastSeenAt: request.lastSeenAt,
        now,
      }),
      entityType: (Object.values(EntityType) as string[]).includes(
        request.entityType,
      )
        ? (request.entityType as EntityType)
        : undefined,
      origin: {
        reason: request.reason,
        distinctUserCount: request.distinctUserCount,
        demandScore: request.demandScore,
        askCount: request.askCount,
        entityId: request.entityId,
        resultPlaceCount: request.resultPlaceCount ?? 0,
        resultItemCount: request.resultItemCount ?? 0,
        lastSeenAt: request.lastSeenAt.toISOString(),
      },
    }));
  }

  /**
   * EXPLORE family — territory entities with a minimal distinct-actor
   * footprint. CANDIDACY is decided here (the distinct-actor floor, an
   * eligibility gate); RANKING is not: the score is stamped later from the
   * measured class-yield upper bound (D41). The demand/trend numbers this
   * loads are recorded into origin as DIAGNOSTICS — no consumer ranks on
   * them any more.
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
        // STATED, NOT LEFT NULL. An explore candidate is one of OUR canonical
        // entity names, and those are English by construction — the whole
        // non-English vocabulary lives in entity_surface, never in
        // core_entities.name. Saying 'en' out loud is the difference between
        // "we know this is English" and "nobody looked", which is exactly the
        // distinction this whole correction is about.
        locale: 'en',
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
    engineName: string,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: { engineName: engineName.trim().toLowerCase() },
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
        // THE QUERY, not its fold. `normalizedTerm` is the ledger IDENTITY —
        // NFKD with every combining mark stripped — and re-sending it put
        // 'bun đau mam tom' on the wire forever in place of
        // 'bún đậu mắm tôm'. The zero results that came back were then
        // written here as a harvest snapshot, teaching the eligibility clamp
        // the term was barren. Identity keys the row; `term` is what we ask.
        term: row.term,
        normalizedTerm: row.normalizedTerm,
        // THE ASK'S OWN LANGUAGE, read back off the ledger row (F5). This
        // slice re-runs a term days after somebody asked for it, with no
        // request anywhere in scope, so this column is the ONLY thing that
        // can tell the ask-shape strip which language to judge it in — and
        // judging a Vietnamese term by the English generic list DELETES it
        // from the cycle ('top'). Null means nobody recorded one, which
        // resolves to the stripper's default exactly as before.
        locale: row.locale,
        slice: 'refresh',
        score: stalenessScore,
        origin: {
          stalenessDays,
          lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
          lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
          lastOutcome: row.lastOutcome ?? null,
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
    /** Attempt rows key by (engineName, normalizedTerm) — the PK. Reading
     *  by the nullable engineId column made rows written without it
     *  invisible (red-team 2026-07-24 finding 2). */
    engineName: string;
    normalizedTerms: string[];
  }): Promise<
    Map<
      string,
      {
        lastOutcome: KeywordAttemptOutcome | null;
        lastAttemptAt: Date | null;
        lastHarvestAt: Date | null;
        lastResultCount: number | null;
        corpusDocsAtHarvest: number | null;
      }
    >
  > {
    if (!params.normalizedTerms.length) {
      return new Map();
    }

    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: {
        engineName: params.engineName.trim().toLowerCase(),
        normalizedTerm: { in: params.normalizedTerms },
      },
      select: {
        normalizedTerm: true,
        lastOutcome: true,
        lastAttemptAt: true,
        lastHarvestAt: true,
        lastResultCount: true,
        corpusDocsAtHarvest: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.normalizedTerm,
        {
          lastOutcome: row.lastOutcome,
          lastAttemptAt: row.lastAttemptAt,
          lastHarvestAt: row.lastHarvestAt,
          lastResultCount: row.lastResultCount,
          corpusDocsAtHarvest: row.corpusDocsAtHarvest,
        },
      ]),
    );
  }
}
