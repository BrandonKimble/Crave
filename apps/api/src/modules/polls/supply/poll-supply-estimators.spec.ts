import {
  ESTIMATOR_NAMES,
  GLOBAL_KEY,
  PollSupplyEstimators,
} from './poll-supply-estimators';
import { CONVERSION_PRIOR, VIABILITY_PRIOR } from './poll-supply.constants';

const NOW = new Date('2026-07-19T14:00:00Z');
const PLACE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLACE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('PollSupplyEstimators (§4 via the §21.1 Estimator primitive)', () => {
  const estimators = new PollSupplyEstimators();

  it('registers all four supply estimators with readers ENABLED (priors edition)', () => {
    const registry = estimators.buildRegistry();
    for (const name of Object.values(ESTIMATOR_NAMES)) {
      const config = registry.getConfig(name);
      expect(config).toBeDefined();
      expect(config!.reader.enabled).toBe(true);
    }
  });

  it('at priors: every reading IS the prior (the §4 launch state)', () => {
    const registry = estimators.buildRegistry();
    const viability = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.viability,
      PLACE_A,
      NOW,
    );
    expect(viability.estimate).toBe(VIABILITY_PRIOR);
    expect(viability.priorWeight).toBe(1);
    const conversion = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.conversion,
      PLACE_A,
      NOW,
    );
    expect(conversion.estimate).toBe(CONVERSION_PRIOR);
  });

  it('viability prior 15 SELF-ERASES as observations accrue (K2 law)', () => {
    const registry = estimators.buildRegistry();
    // Ten cohorts of strong-content polls at ~30 answers each.
    for (let i = 0; i < 10; i += 1) {
      estimators.observeCohort(registry, {
        placeId: PLACE_A,
        attentionMass: 100,
        answerCounts: [30, 30],
        viableAnswerCounts: [30, 30],
        observedAt: new Date(NOW.getTime() - (10 - i) * 24 * 60 * 60 * 1000),
      });
    }
    const reading = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.viability,
      PLACE_A,
      NOW,
    );
    expect(reading.estimate).toBeGreaterThan(25); // pulled far off the prior…
    expect(reading.priorWeight).toBeLessThan(0.1); // …because the prior eroded
  });

  it('hierarchical global→place: a place with NO data reads the GLOBAL estimate, not the raw prior', () => {
    const registry = estimators.buildRegistry();
    for (let i = 0; i < 8; i += 1) {
      estimators.observeCohort(registry, {
        placeId: PLACE_A,
        attentionMass: 200,
        answerCounts: [50],
        viableAnswerCounts: [50],
        observedAt: new Date(NOW.getTime() - (8 - i) * 24 * 60 * 60 * 1000),
      });
    }
    const globalReading = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.viability,
      PLACE_B, // never observed → falls to global
      NOW,
    );
    const rawGlobal = registry.read(ESTIMATOR_NAMES.viability, GLOBAL_KEY, NOW);
    expect(globalReading.estimate).toBe(rawGlobal.estimate);
    expect(globalReading.estimate).toBeGreaterThan(VIABILITY_PRIOR);
  });

  it('place data dominates its own reading as it accrues (refined per-place)', () => {
    const registry = estimators.buildRegistry();
    // Global stream says viability ~50 via a busy metro…
    for (let i = 0; i < 8; i += 1) {
      estimators.observeCohort(registry, {
        placeId: PLACE_A,
        attentionMass: 200,
        answerCounts: [50],
        viableAnswerCounts: [50],
        observedAt: new Date(NOW.getTime() - (8 - i) * 24 * 60 * 60 * 1000),
      });
    }
    // …but PLACE_B's own polls produce strong content at ~10.
    for (let i = 0; i < 8; i += 1) {
      estimators.observeCohort(registry, {
        placeId: PLACE_B,
        attentionMass: 20,
        answerCounts: [10],
        viableAnswerCounts: [10],
        observedAt: new Date(NOW.getTime() - (8 - i) * 24 * 60 * 60 * 1000),
      });
    }
    const reading = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.viability,
      PLACE_B,
      NOW,
    );
    // The global stream contains B's own observations too, so the pull is
    // upward of 10 but far below the metro's 50.
    expect(reading.estimate).toBeLessThan(25);
    expect(reading.nEffective).toBeGreaterThan(0);
  });

  it('conversion observes answers-per-attention; tail-concentration only from cohorts of ≥2', () => {
    const registry = estimators.buildRegistry();
    estimators.observeCohort(registry, {
      placeId: PLACE_A,
      attentionMass: 100,
      answerCounts: [20, 10], // total 30 → conversion obs 0.3; tail 10/15
      viableAnswerCounts: [],
      observedAt: NOW,
    });
    const conversion = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.conversion,
      PLACE_A,
      NOW,
    );
    // One obs (0.3) blended 1:1 with the global stream (itself one obs at
    // 0.3 blended with prior 1.0) — strictly below prior, above raw obs.
    expect(conversion.estimate).toBeLessThan(CONVERSION_PRIOR);
    expect(conversion.estimate).toBeGreaterThan(0.3);
    const tail = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.tailConcentration,
      PLACE_A,
      NOW,
    );
    expect(tail.estimate).toBeLessThan(1);

    // A single-poll cohort records NO tail observation (trivially 1).
    const registry2 = estimators.buildRegistry();
    estimators.observeCohort(registry2, {
      placeId: PLACE_A,
      attentionMass: 100,
      answerCounts: [20],
      viableAnswerCounts: [],
      observedAt: NOW,
    });
    const tail2 = estimators.hierarchicalRead(
      registry2,
      ESTIMATOR_NAMES.tailConcentration,
      PLACE_A,
      NOW,
    );
    expect(tail2.estimate).toBe(1);
  });

  it('zero-attention cohorts record no conversion observation (no ÷0 fabrication)', () => {
    const registry = estimators.buildRegistry();
    estimators.observeCohort(registry, {
      placeId: PLACE_A,
      attentionMass: 0,
      answerCounts: [5],
      viableAnswerCounts: [],
      observedAt: NOW,
    });
    const conversion = estimators.hierarchicalRead(
      registry,
      ESTIMATOR_NAMES.conversion,
      PLACE_A,
      NOW,
    );
    expect(conversion.estimate).toBe(CONVERSION_PRIOR);
    expect(conversion.priorWeight).toBe(1);
  });
});
