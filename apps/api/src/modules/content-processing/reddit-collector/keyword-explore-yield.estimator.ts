import { Injectable } from '@nestjs/common';
import {
  EstimatorRegistry,
  type EstimatorConfig,
  type EstimatorReading,
} from '../../estimators/estimator-registry';
import { PrismaEstimatorStateStore } from '../../estimators/estimator-state.store';

/**
 * D41 — the explore family's ranking input, MEASURED.
 *
 * What it replaces: a hand-weighted blend
 * (0.45*novelty + 0.35*localSpecialization + 0.2*trend) carried unexamined
 * from the original overhaul plan — the only unratified constants left in
 * keyword-slice-selection, ranking spend on three proxies for yield while
 * the actual yield sat unread in the attempt ledger.
 *
 * GRAIN = (engineName, entityType), the vocabulary CLASS (D41 §2). Per-TERM
 * was rejected on evidence: the explore floor is 2 terms of 25 over hundreds
 * of candidates, so a term never reaches the two effective observations the
 * registry needs for a measured dispersion — every term would read Infinity
 * forever and "UCB" would rank nothing. The class accrues ~2 observations
 * per cycle and answers a question the ranker can actually act on: does
 * exploring this vocabulary class in this engine return documents?
 *
 * OUTCOME = resultCount, the documents the search returned (D41 §4). It is
 * the one honest per-term number at the chokepoint; per-term DOWNSTREAM
 * yield (new mentions, new entities) is unattributable by construction,
 * because the batch pipeline unions post ids across all of a cycle's terms
 * before anything is processed. Only HARVESTS are observed — an error or a
 * rate-limit is not a measurement of a class's yield (§12.3's law, same as
 * the harvest snapshot's).
 */
export const KEYWORD_EXPLORE_YIELD_ESTIMATOR_NAME = 'collection.exploreYield';

/** Mirrors the 30d demand window every other input to this family is drawn
 *  over (KEYWORD_DEMAND_WINDOW_DAYS default) — a class's yield is believed
 *  over the same horizon its candidates are. */
const EXPLORE_YIELD_HALF_LIFE_DAYS = 30;

export const KEYWORD_EXPLORE_YIELD_ESTIMATOR: EstimatorConfig = {
  name: KEYWORD_EXPLORE_YIELD_ESTIMATOR_NAME,
  statistic: 'mean',
  // The smallest honest count, one pseudo-observation deep: "a search
  // returns one whole document" is the same unit the file's expected-new-
  // docs law already speaks, and strength 1 is the weakest legal prior —
  // erased by the first real harvest, exactly as the self-erasure law wants.
  prior: { value: 1, strength: 1 },
  hierarchy: 'none',
  halfLifeDays: EXPLORE_YIELD_HALF_LIFE_DAYS,
  // Selection decides which classes get attempted, and only attempts
  // produce observations — textbook self-gating, hence the mandatory
  // exploration mechanism below.
  consumerGatesObservations: true,
  exploration: 'optimisticSelection',
  versionBindings: ['keywordCollectionScorerVersion'],
  reader: { enabled: true },
};

export function exploreYieldSubjectKey(
  engineName: string,
  entityType: string,
): string {
  return `${engineName.trim().toLowerCase()}::${String(entityType)}`;
}

@Injectable()
export class KeywordExploreYieldEstimatorService {
  private readonly registry: EstimatorRegistry;

  constructor(store: PrismaEstimatorStateStore) {
    // Durable state means the writer (the orchestrator, in the queue
    // consumer) and the reader (slice selection, on the pacer cron) no
    // longer have to be the same object — or the same process.
    this.registry = new EstimatorRegistry(store);
    this.registry.register(KEYWORD_EXPLORE_YIELD_ESTIMATOR);
  }

  /** Load-on-first-read for one selection's classes. */
  async primeClasses(
    engineName: string,
    entityTypes: Array<string>,
  ): Promise<void> {
    await this.registry.hydrate(
      KEYWORD_EXPLORE_YIELD_ESTIMATOR_NAME,
      entityTypes.map((entityType) =>
        exploreYieldSubjectKey(engineName, entityType),
      ),
    );
  }

  /**
   * The optimistic (upper-confidence) reading for a class. Infinity when the
   * class has no measured dispersion — a starved class WINS selection, which
   * is the whole promise of 'optimisticSelection' and the cold-start law's
   * act-then-measure in one number.
   */
  classReading(
    engineName: string,
    entityType: string,
    at: Date = new Date(),
  ): EstimatorReading {
    return this.registry.read(
      KEYWORD_EXPLORE_YIELD_ESTIMATOR_NAME,
      exploreYieldSubjectKey(engineName, entityType),
      at,
    );
  }

  upperConfidenceBound(
    engineName: string,
    entityType: string,
    at: Date = new Date(),
  ): number {
    const reading = this.classReading(engineName, entityType, at);
    return reading.estimate + reading.uncertainty;
  }

  /** Record one harvest's measured yield against its class. */
  async observeHarvest(params: {
    engineName: string;
    entityType: string;
    resultCount: number;
    observedAt: Date;
  }): Promise<void> {
    if (!Number.isFinite(params.resultCount) || params.resultCount < 0) {
      return;
    }
    await this.registry.observeDurable(KEYWORD_EXPLORE_YIELD_ESTIMATOR_NAME, {
      subjectKey: exploreYieldSubjectKey(params.engineName, params.entityType),
      value: params.resultCount,
      observedAt: params.observedAt,
    });
  }
}
