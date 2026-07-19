/**
 * §4 supply estimators, all through THE Estimator primitive (§21.1 —
 * src/modules/estimators/estimator-registry.ts; the closed-loop law is
 * enforced at registration there).
 *
 * Durability model: the registry is an in-memory READ engine; the durable
 * side is the ledger + poll rows. A ritual run therefore builds a FRESH
 * registry and REPLAYS observations from durable outcomes (closed seeded
 * cohorts + poll_vote signals) — restarts can never lose or double-count an
 * observation, and the registry's decay applies through each observation's
 * real observedAt.
 *
 * Readers are ENABLED (priors edition, §22): they return the prior until
 * observations accrue — that IS the §4 "at priors" launch state; no
 * turn-on trigger is needed because nothing is deferred.
 *
 * Hierarchy note: the registry declares 'placesDag' shrinkage but its read()
 * is flat per subject key, so the global→place composition happens here:
 * hierarchicalRead() re-blends the place's observed mean against the GLOBAL
 * estimate acting as the prior (which itself shrinks toward the day-one
 * prior). Place data dominates as it accrues — self-erasure at both levels.
 */
import { Injectable } from '@nestjs/common';
import {
  EstimatorReading,
  EstimatorRegistry,
} from '../../estimators/estimator-registry';
import {
  CONVERSION_PRIOR,
  SUPPLY_ESTIMATOR_HALF_LIFE_DAYS,
  SUPPLY_PRIOR_STRENGTH,
  TAIL_CONCENTRATION_PRIOR,
  VIABILITY_PRIOR,
} from './poll-supply.constants';

export const GLOBAL_KEY = 'global';

export const ESTIMATOR_NAMES = {
  /** answers-per-attention, the warm-start predictor input (global prior). */
  conversion: 'poll.conversion',
  /** answers-per-attention as the credit-rate factor (place-level; global
   *  conversion as prior). EXEMPT from the exploration law (§16):
   *  contraction-to-zero is its desired fixpoint — ghost towns must be able
   *  to asymptote to zero seeding. */
  answerYield: 'poll.answerYield',
  /** weakest/mean answering of a cohort — how evenly answering fills the
   *  frontier tail. */
  tailConcentration: 'poll.tailConcentration',
  /** The participation level at which polls demonstrably produce strong
   *  content. Prior 15 (K2, SELF-ERASING). Its consumer gates its own
   *  observations (the frontier decides which polls exist), so it MUST carry
   *  exploration — the controller's ±1 median-test dither is the declared
   *  excitation. */
  viability: 'poll.viability',
} as const;

export interface CohortOutcome {
  placeId: string;
  /** The cohort's weekOf LABEL (local Sunday calendar date, YYYY-MM-DD) —
   *  cohort closure and once-only evidence consumption are judged in label
   *  space (red-team 1a/2b), never by wall-clock elapsed ms. */
  weekOf: string;
  /** Attention mass of the place at the cohort's launch. */
  attentionMass: number;
  /** Distinct-voter answer counts per poll in the cohort. */
  answerCounts: number[];
  /** Answer counts of the cohort's polls that demonstrated strong content
   *  (launch proxy: graduated AND carried discussion — see harvest). */
  viableAnswerCounts: number[];
  observedAt: Date;
}

export function placeKey(placeId: string): string {
  return `place:${placeId}`;
}

@Injectable()
export class PollSupplyEstimators {
  /** Fresh registry per ritual run — see the durability model above. */
  buildRegistry(): EstimatorRegistry {
    const registry = new EstimatorRegistry();
    registry.register({
      name: ESTIMATOR_NAMES.conversion,
      statistic: 'ratio',
      prior: { value: CONVERSION_PRIOR, strength: SUPPLY_PRIOR_STRENGTH },
      hierarchy: 'placesDag',
      halfLifeDays: SUPPLY_ESTIMATOR_HALF_LIFE_DAYS,
      // Conversion updates from cohorts the frontier chose to publish, and
      // the median-test dither is the standing excitation.
      consumerGatesObservations: true,
      exploration: 'dither',
      versionBindings: ['feedAlgoVersion'],
      reader: { enabled: true },
    });
    registry.register({
      name: ESTIMATOR_NAMES.answerYield,
      statistic: 'ratio',
      prior: { value: CONVERSION_PRIOR, strength: SUPPLY_PRIOR_STRENGTH },
      hierarchy: 'placesDag',
      halfLifeDays: SUPPLY_ESTIMATOR_HALF_LIFE_DAYS,
      // §16: answerYield is EXPLICITLY EXEMPT from the closed-loop law —
      // contraction to zero is the desired fixpoint (ghost towns terminate).
      // The flag encodes "bound by the closed-loop law", which this one is
      // not, per the owner-ratified exemption.
      consumerGatesObservations: false,
      exploration: 'none',
      versionBindings: ['feedAlgoVersion'],
      reader: { enabled: true },
    });
    registry.register({
      name: ESTIMATOR_NAMES.tailConcentration,
      statistic: 'ratio',
      prior: {
        value: TAIL_CONCENTRATION_PRIOR,
        strength: SUPPLY_PRIOR_STRENGTH,
      },
      hierarchy: 'placesDag',
      halfLifeDays: SUPPLY_ESTIMATOR_HALF_LIFE_DAYS,
      consumerGatesObservations: true,
      exploration: 'dither',
      versionBindings: ['feedAlgoVersion'],
      reader: { enabled: true },
    });
    registry.register({
      name: ESTIMATOR_NAMES.viability,
      statistic: 'mean',
      prior: { value: VIABILITY_PRIOR, strength: SUPPLY_PRIOR_STRENGTH },
      hierarchy: 'placesDag',
      halfLifeDays: SUPPLY_ESTIMATOR_HALF_LIFE_DAYS,
      consumerGatesObservations: true,
      exploration: 'dither',
      versionBindings: ['feedAlgoVersion'],
      reader: { enabled: true },
    });
    return registry;
  }

  /** Replay one cohort's durable outcome into the registry (place + global
   *  streams — the global stream is the hierarchical parent). */
  observeCohort(registry: EstimatorRegistry, outcome: CohortOutcome): void {
    const keys = [placeKey(outcome.placeId), GLOBAL_KEY];
    const totalAnswers = outcome.answerCounts.reduce((sum, n) => sum + n, 0);

    if (outcome.attentionMass > 0) {
      const conversion = totalAnswers / outcome.attentionMass;
      for (const subjectKey of keys) {
        registry.observe(ESTIMATOR_NAMES.conversion, {
          subjectKey,
          value: conversion,
          observedAt: outcome.observedAt,
        });
        registry.observe(ESTIMATOR_NAMES.answerYield, {
          subjectKey,
          value: conversion,
          observedAt: outcome.observedAt,
        });
      }
    }

    if (outcome.answerCounts.length >= 2) {
      // weakest/mean — 1 for a flat tail, →0 when answering concentrates at
      // the top. Single-poll cohorts are trivially 1 and carry no tail
      // information, so they record nothing.
      const mean = totalAnswers / outcome.answerCounts.length;
      if (mean > 0) {
        const concentration = Math.min(...outcome.answerCounts) / mean;
        for (const subjectKey of keys) {
          registry.observe(ESTIMATOR_NAMES.tailConcentration, {
            subjectKey,
            value: concentration,
            observedAt: outcome.observedAt,
          });
        }
      }
    }

    for (const answers of outcome.viableAnswerCounts) {
      for (const subjectKey of keys) {
        registry.observe(ESTIMATOR_NAMES.viability, {
          subjectKey,
          value: answers,
          observedAt: outcome.observedAt,
        });
      }
    }
  }

  /**
   * Hierarchical global→place read: the place's observed mean shrinks toward
   * the GLOBAL estimate (which itself shrinks toward the day-one prior). The
   * place's observed mean is recovered by inverting the registry's own
   * prior blend; with zero place data this returns the global reading
   * verbatim — the §4 "measured globally, refined per-place" ladder.
   */
  hierarchicalRead(
    registry: EstimatorRegistry,
    name: string,
    placeId: string,
    at: Date,
  ): EstimatorReading {
    const global = registry.read(name, GLOBAL_KEY, at);
    const place = registry.read(name, placeKey(placeId), at);
    if (place.nEffective <= 0 || place.priorWeight >= 1) {
      return global;
    }
    // Invert the registry's static-prior blend to the raw place mean…
    const config = registry.getConfig(name)!;
    const placeMean =
      (place.estimate - config.prior.value * place.priorWeight) /
      (1 - place.priorWeight);
    // …then re-blend against the global estimate as the prior.
    const strength = config.prior.strength;
    const total = place.nEffective + strength;
    const estimate =
      (placeMean * place.nEffective + global.estimate * strength) / total;
    return {
      estimate,
      uncertainty: place.uncertainty,
      nEffective: place.nEffective,
      priorWeight: strength / total,
      readerDeferred: false,
    };
  }
}
