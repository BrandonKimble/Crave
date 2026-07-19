/**
 * THE Estimator primitive (master plan §21.1): every adaptive quantity in the
 * system — viability, answerYield, conversion, concentration, expected-new-
 * content, thread-activity half-life, burst variance, kind weights, demand
 * estimators — is ONE primitive with N configs, never N implementations.
 *
 * Laws enforced structurally here:
 * - Self-erasing priors: read() blends prior and observations by effective
 *   sample size; the prior's weight decays as data accrues. A constant is a
 *   claim obeyed forever; a prior is a guess the system is built to replace.
 * - Closed-loop measurement law (§16): an estimator whose consumer gates its
 *   own observations CANNOT register without an exploration mechanism.
 * - Staging surface (§22): estimators register with their reader ON or OFF.
 *   OFF = read() returns the prior verbatim while observations still record
 *   ("defer estimator READERS, never observations"). Each OFF registration
 *   must name its turn-on trigger so deferral cannot rot into deletion.
 * - Version binding (§16 K5): a bound version change widens uncertainty /
 *   flags re-probe instead of silently mixing regimes.
 */

export type EstimatorStatistic = 'mean' | 'rate' | 'ratio';

export type EstimatorHierarchy =
  | 'none'
  /** Place-keyed estimators shrink along the places containment DAG. */
  | 'placesDag'
  /** Source-keyed estimators shrink toward their platform class. */
  | 'sourcePlatform'
  /** Term-keyed estimators shrink toward the global term base rate. */
  | 'termGlobal';

export type EstimatorExploration =
  /** ONLY legal when the consumer does not gate this estimator's own
   *  observations (e.g. answerYield: contraction-to-zero is the desired
   *  fixpoint). */
  | 'none'
  /** The consumer's own bounded oscillation supplies excitation (median-test
   *  ±1 dither). */
  | 'dither'
  /** Competing estimates are selected optimistically (upper-confidence) so a
   *  starved candidate can always re-demonstrate. */
  | 'optimisticSelection'
  /** Uncertainty widens with time-since-observation so stale estimates invite
   *  re-measurement. */
  | 'timeWidening';

export type EstimatorConfig = {
  /** Unique registry name, e.g. 'poll.viability', 'poll.conversion'. */
  name: string;
  statistic: EstimatorStatistic;
  /** The self-erasing prior: value + strength (pseudo-observations). */
  prior: { value: number; strength: number };
  hierarchy: EstimatorHierarchy;
  /** Decay half-life for observations, in days. */
  halfLifeDays: number;
  /**
   * TRUE when this estimator's consumer gates the observations that update it
   * (viability knee, term hit rates, kind weights, family yield). Such an
   * estimator MUST declare a non-'none' exploration mechanism.
   */
  consumerGatesObservations: boolean;
  exploration: EstimatorExploration;
  /** K5 bindings: names of versions whose change invalidates the regime
   *  (e.g. 'feedAlgoVersion', 'scoreVersion', 'gateModelVersion'). */
  versionBindings: readonly string[];
  /**
   * Staging (§22): OFF = read() returns the prior while observations record.
   * Every OFF registration names its turn-on trigger.
   */
  reader: { enabled: true } | { enabled: false; turnOnTrigger: string };
};

export type EstimatorObservation = {
  subjectKey: string;
  value: number;
  weight?: number;
  observedAt: Date;
};

export type EstimatorReading = {
  estimate: number;
  /** Std-error-flavored uncertainty; Infinity when no data and no prior. */
  uncertainty: number;
  nEffective: number;
  /** 1 = pure prior, 0 = fully measured — the self-erasure gauge. */
  priorWeight: number;
  /** TRUE while the reader is staged off (estimate === prior.value). */
  readerDeferred: boolean;
};

type SubjectState = {
  weightedSum: number;
  weightTotal: number;
  weightSquares: number;
  sumOfSquares: number;
  lastObservedAt: Date | null;
  lastDecayedAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class EstimatorRegistrationError extends Error {}

/**
 * In-memory engine + durable-observation seam: Phase A persists observations
 * via the signals ledger / aggregate (the durable side); this registry is the
 * READ engine over per-subject running moments. Hot consumers hold a local
 * registry instance — never a service hop (§21.1 risk note).
 */
export class EstimatorRegistry {
  private readonly configs = new Map<string, EstimatorConfig>();
  private readonly states = new Map<string, Map<string, SubjectState>>();

  register(config: EstimatorConfig): void {
    if (this.configs.has(config.name)) {
      throw new EstimatorRegistrationError(
        `Estimator '${config.name}' is already registered`,
      );
    }
    // The closed-loop measurement law, enforced at the type/registration
    // boundary (master plan §16/§21.1): no self-gating estimator without an
    // excitation source.
    if (config.consumerGatesObservations && config.exploration === 'none') {
      throw new EstimatorRegistrationError(
        `Estimator '${config.name}' gates its own observations and MUST ` +
          `declare an exploration mechanism (closed-loop measurement law)`,
      );
    }
    if (!config.reader.enabled && !config.reader.turnOnTrigger.trim()) {
      throw new EstimatorRegistrationError(
        `Estimator '${config.name}' defers its reader without a turn-on ` +
          `trigger (deferral must not rot into deletion)`,
      );
    }
    if (config.prior.strength <= 0) {
      throw new EstimatorRegistrationError(
        `Estimator '${config.name}' needs prior.strength > 0 (a prior IS ` +
          `pseudo-observations; zero would divide by zero at cold start)`,
      );
    }
    this.configs.set(config.name, config);
    this.states.set(config.name, new Map());
  }

  getConfig(name: string): EstimatorConfig | undefined {
    return this.configs.get(name);
  }

  listRegistered(): EstimatorConfig[] {
    return Array.from(this.configs.values());
  }

  /** Observations ALWAYS record — even while the reader is deferred. */
  observe(name: string, observation: EstimatorObservation): void {
    const config = this.requireConfig(name);
    const subjects = this.states.get(name)!;
    const state =
      subjects.get(observation.subjectKey) ??
      ({
        weightedSum: 0,
        weightTotal: 0,
        weightSquares: 0,
        sumOfSquares: 0,
        lastObservedAt: null,
        lastDecayedAt: null,
      } satisfies SubjectState);
    this.decayState(state, config, observation.observedAt);
    const weight = observation.weight ?? 1;
    state.weightedSum += observation.value * weight;
    state.weightTotal += weight;
    state.weightSquares += weight * weight;
    state.sumOfSquares += observation.value * observation.value * weight;
    state.lastObservedAt = observation.observedAt;
    subjects.set(observation.subjectKey, state);
  }

  read(
    name: string,
    subjectKey: string,
    at: Date = new Date(),
  ): EstimatorReading {
    const config = this.requireConfig(name);
    const state = this.states.get(name)!.get(subjectKey);
    if (!config.reader.enabled) {
      // Staged-off reader: the prior IS the system (§22), observations keep
      // recording underneath.
      return {
        estimate: config.prior.value,
        uncertainty: Number.POSITIVE_INFINITY,
        nEffective: this.effectiveN(state, config, at),
        priorWeight: 1,
        readerDeferred: true,
      };
    }
    const nEffective = this.effectiveN(state, config, at);
    const priorStrength = config.prior.strength;
    const total = nEffective + priorStrength;
    const observedMean =
      state && state.weightTotal > 0
        ? state.weightedSum / state.weightTotal
        : 0;
    const estimate =
      (observedMean * nEffective + config.prior.value * priorStrength) / total;
    const variance =
      state && state.weightTotal > 0
        ? Math.max(
            state.sumOfSquares / state.weightTotal -
              observedMean * observedMean,
            0,
          )
        : 0;
    let uncertainty = Math.sqrt(variance / Math.max(total, 1));
    if (config.exploration === 'timeWidening' && state?.lastObservedAt) {
      // Closed-loop law: uncertainty grows with silence so stale estimates
      // invite re-measurement instead of fossilizing.
      const silentDays = Math.max(
        0,
        (at.getTime() - state.lastObservedAt.getTime()) / DAY_MS,
      );
      uncertainty *= 1 + silentDays / config.halfLifeDays;
    }
    return {
      estimate,
      uncertainty,
      nEffective,
      priorWeight: priorStrength / total,
      readerDeferred: false,
    };
  }

  private requireConfig(name: string): EstimatorConfig {
    const config = this.configs.get(name);
    if (!config) {
      throw new EstimatorRegistrationError(
        `Estimator '${name}' is not registered`,
      );
    }
    return config;
  }

  private effectiveN(
    state: SubjectState | undefined,
    config: EstimatorConfig,
    at: Date,
  ): number {
    if (!state) {
      return 0;
    }
    const clone: SubjectState = { ...state };
    this.decayState(clone, config, at);
    return clone.weightTotal;
  }

  private decayState(
    state: SubjectState,
    config: EstimatorConfig,
    at: Date,
  ): void {
    const reference = state.lastDecayedAt ?? state.lastObservedAt;
    if (!reference) {
      state.lastDecayedAt = at;
      return;
    }
    const elapsedDays = (at.getTime() - reference.getTime()) / DAY_MS;
    if (elapsedDays <= 0) {
      return;
    }
    const factor = Math.pow(0.5, elapsedDays / config.halfLifeDays);
    state.weightedSum *= factor;
    state.weightTotal *= factor;
    state.weightSquares *= factor;
    state.sumOfSquares *= factor;
    state.lastDecayedAt = at;
  }
}
