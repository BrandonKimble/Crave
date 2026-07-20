/**
 * §11 collector estimators through THE Estimator primitive (§21.1), priors
 * edition (§22 deferral law: defer estimator READERS, never observations).
 *
 * - collector.sourceArrivalRate — docsPerDay per source, derived ONLY from
 *   the adapter-declared unbiased lane (chronological; §10 sampling law —
 *   keyword hits never feed it). Reader ON: it is a measurement, not a gate.
 * - collector.termHitRate — did an attempted term produce content. Its
 *   consumer (selection) gates its own observations (an unattempted term
 *   records nothing), so it carries optimisticSelection excitation
 *   (closed-loop law §16). Reader OFF until the §22 trigger: the measured
 *   expected-new-content model (arrival × hit) replaces the cooldown-constant
 *   priors once engine cadence data accrues. Until then the cooldown
 *   constants in KeywordAttemptHistoryService ARE the model's cold-start
 *   priors — behavior is identical by construction.
 * - family yield (§11 portfolio) is NOT registered yet: its durable
 *   observation stream needs the proposing family stamped on attempt rows —
 *   that column lands with the measured-yield competition trigger (§22:
 *   "family competition on measured yield once attempt volume exists").
 *   Registering an estimator with neither reads nor durable observations
 *   would be dead code, which the registry model forbids.
 *
 * Durability model (same as PollSupplyEstimators): the registry is a READ
 * engine — a selection run builds a FRESH registry and REPLAYS observations
 * from durable collector state (keyword_attempt_history rows, lane output
 * facts), so restarts never lose or double-count.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EstimatorRegistry } from '../../estimators/estimator-registry';

export const COLLECTOR_ESTIMATOR_NAMES = {
  sourceArrivalRate: 'collector.sourceArrivalRate',
  termHitRate: 'collector.termHitRate',
} as const;

/** K2 priors (self-erasing; OWNER-RATIFY §18): a reddit source arrives ~10
 *  docs/day until measured; a term hits half its attempts until measured. */
const ARRIVAL_RATE_PRIOR_DOCS_PER_DAY = 10;
const ARRIVAL_RATE_PRIOR_STRENGTH = 7;
const TERM_HIT_RATE_PRIOR = 0.5;
const TERM_HIT_RATE_PRIOR_STRENGTH = 4;

export function termKey(normalizedTerm: string): string {
  return `term:${normalizedTerm}`;
}

export function sourceKey(sourceId: string): string {
  return `source:${sourceId}`;
}

@Injectable()
export class CollectorEstimators {
  constructor(private readonly prisma: PrismaService) {}

  buildRegistry(): EstimatorRegistry {
    const registry = new EstimatorRegistry();
    registry.register({
      name: COLLECTOR_ESTIMATOR_NAMES.sourceArrivalRate,
      statistic: 'rate',
      prior: {
        value: ARRIVAL_RATE_PRIOR_DOCS_PER_DAY,
        strength: ARRIVAL_RATE_PRIOR_STRENGTH,
      },
      hierarchy: 'sourcePlatform',
      halfLifeDays: 21,
      consumerGatesObservations: false,
      exploration: 'none',
      versionBindings: [],
      reader: { enabled: true },
    });
    registry.register({
      name: COLLECTOR_ESTIMATOR_NAMES.termHitRate,
      statistic: 'ratio',
      prior: {
        value: TERM_HIT_RATE_PRIOR,
        strength: TERM_HIT_RATE_PRIOR_STRENGTH,
      },
      hierarchy: 'termGlobal',
      halfLifeDays: 45,
      consumerGatesObservations: true,
      exploration: 'optimisticSelection',
      versionBindings: [],
      reader: {
        enabled: false,
        turnOnTrigger:
          '§22: engine cadence data accrues — measured expected-new-content ' +
          '(arrival × hit) replaces the cooldown-constant priors',
      },
    });
    return registry;
  }

  /**
   * Replay durable term-attempt outcomes for one engine into the registry
   * (observations always record — §22). success=1, no_results=0; errors and
   * governance deferrals record NOTHING (§12.3: a rate limit or "not now"
   * can never brand a term dead).
   */
  async replayEngineAttempts(
    registry: EstimatorRegistry,
    engineId: string,
  ): Promise<void> {
    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: { engineId },
      select: {
        normalizedTerm: true,
        lastOutcome: true,
        lastAttemptAt: true,
      },
    });
    for (const row of rows) {
      if (!row.lastAttemptAt) continue;
      const value =
        row.lastOutcome === 'success'
          ? 1
          : row.lastOutcome === 'no_results'
            ? 0
            : null;
      if (value === null) continue;
      registry.observe(COLLECTOR_ESTIMATOR_NAMES.termHitRate, {
        subjectKey: termKey(row.normalizedTerm),
        value,
        observedAt: row.lastAttemptAt,
      });
    }
  }

  /** Record one unbiased-lane tick's arrival observation (docs per covered
   *  day) — called by the pacer when a chronological run reports output. */
  observeArrival(
    registry: EstimatorRegistry,
    params: {
      sourceId: string;
      outputDocs: number;
      coveredDays: number;
      observedAt: Date;
    },
  ): void {
    if (params.coveredDays <= 0) return;
    registry.observe(COLLECTOR_ESTIMATOR_NAMES.sourceArrivalRate, {
      subjectKey: sourceKey(params.sourceId),
      value: params.outputDocs / params.coveredDays,
      observedAt: params.observedAt,
    });
  }
}
