/**
 * §4 supply controller — pure math (the weekly ritual owns persistence).
 *
 * creditRate(place) = weeklyDemandMass × answerYield(place) ÷ viability(place)
 *   — polls-per-week the place's demonstrated answering warrants.
 *
 * Warm start: every place starts at max(1, predicted frontier), where
 *   predicted frontier = attention mass × conversion × tail-concentration
 *   ÷ viability. No "launch city" concept — big places warm-start because
 *   their mass justifies it; small places predict <1 and start at the
 *   exploration slot (1, K6).
 *
 * First-cohort correction: when the first cohort has closed, the SAME
 *   prediction re-runs against readings that now include the cohort's
 *   measured conversion/concentration and the frontier JUMPS to the
 *   re-estimate (no slew — slew is for LEARNED frontiers only).
 *
 * Steady state — the median test: expand when P(weakest poll ≥ viability)
 *   > ½, contract when < ½ (½ is definitional, K6). NO dead zone; a tie
 *   expands (the +1 exploration slot bias) so the frontier oscillates ±1 by
 *   design — bounded dither IS the exploration excitation the viability
 *   estimator's closed loop requires. ±1/week is the slew limit for a
 *   LEARNED frontier only (K3 controller cycle).
 *
 * Credit: an accumulating warrant — accrues at creditRate, decays on the K1
 *   14d half-life, is spent 1-per-published-poll. The decay IS the
 *   anti-trickle law: a place whose creditRate stays below ~ln2/2 per week
 *   equilibrates under 1 credit and structurally never publishes — no
 *   minimum-demand threshold constant exists anywhere.
 *
 * NO CAPS: nothing in this file bounds supply from above by a constant.
 */
import {
  DAYS_PER_WEEK,
  DEMAND_HALF_LIFE_DAYS,
  EXPLORATION_SLOT,
  FRONTIER_STEP,
  MEDIAN_TEST_MAJORITY,
  MS_PER_DAY,
} from './poll-supply.constants';

export type SupplyPhase = 'warm_start' | 'learned';

export interface SupplyState {
  frontier: number;
  phase: SupplyPhase;
  credit: number;
  creditUpdatedAt: Date | null;
}

export interface SupplyReadings {
  /** Place-level demand mass at the tick (the attention mass). */
  weeklyDemandMass: number;
  /** answers-per-attention, hierarchical place→global→prior. */
  answerYield: number;
  /** Global (→place) conversion, the warm-start predictor input. */
  conversion: number;
  /** Tail-concentration (weakest/mean answering), warm-start input. */
  tailConcentration: number;
  viability: { estimate: number; uncertainty: number };
}

export interface SupplyDecisionInput {
  now: Date;
  /** null = the place has never ticked (warm start). */
  state: SupplyState | null;
  readings: SupplyReadings;
  /**
   * Distinct-voter answer counts of the most recent cohort whose 7-day
   * window has fully elapsed, or null when no cohort has closed yet.
   * Derived from the immutable poll_vote ledger, so it never waits on the
   * lifecycle cron.
   */
  lastClosedCohortAnswerCounts: number[] | null;
}

export interface SupplyDecision {
  frontier: number;
  phase: SupplyPhase;
  /** Credit AFTER accrual/decay, BEFORE the publish spend. */
  credit: number;
  /** Polls warranted this tick = min(frontier, floor(credit)). */
  cohortTarget: number;
  creditRate: number;
  predictedFrontier: number;
  /** Median-test probability, when it ran this tick. */
  medianTestP?: number;
}

/**
 * Standard-normal CDF via the Numerical Recipes erfc polynomial (~1.2e-7).
 * The coefficients are published mathematical constants — definitional, not
 * tunables (§16).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) {
    return z > 0 ? 1 : 0;
  }
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const tau =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277)))))))),
    );
  const erfc = z >= 0 ? tau : 2 - tau;
  return 1 - erfc / 2;
}

/** P(weakest ≥ viability) under the viability estimate's uncertainty. With
 *  zero uncertainty (pure prior / no variance) it degenerates to the step
 *  function, with the tie (weakest == viability) counting as ≥ (P = 1 →
 *  expand — the K6 tie-to-exploration reading of "no dead zone"). */
export function medianTestProbability(
  weakestAnswers: number,
  viability: { estimate: number; uncertainty: number },
): number {
  if (!(viability.uncertainty > 0) || !Number.isFinite(viability.uncertainty)) {
    return weakestAnswers >= viability.estimate ? 1 : 0;
  }
  return normalCdf(
    (weakestAnswers - viability.estimate) / viability.uncertainty,
  );
}

function predictFrontier(readings: SupplyReadings): number {
  const viability = Math.max(readings.viability.estimate, Number.EPSILON);
  return (
    (readings.weeklyDemandMass *
      readings.conversion *
      readings.tailConcentration) /
    viability
  );
}

export function decideSupply(input: SupplyDecisionInput): SupplyDecision {
  const { now, state, readings, lastClosedCohortAnswerCounts } = input;
  const viability = Math.max(readings.viability.estimate, Number.EPSILON);
  const creditRate =
    (readings.weeklyDemandMass * readings.answerYield) / viability;
  const predicted = predictFrontier(readings);

  if (!state) {
    // Warm start: the prediction IS the warrant — it both sets the frontier
    // and mints the first cohort's credit (there is no accrual history yet).
    const frontier = Math.max(EXPLORATION_SLOT, Math.round(predicted));
    return {
      frontier,
      phase: 'warm_start',
      credit: frontier,
      cohortTarget: frontier,
      creditRate,
      predictedFrontier: predicted,
    };
  }

  // Credit accrual since the last tick: decay the balance on the K1 14d
  // half-life, then add creditRate × elapsed weeks (discrete integration at
  // tick granularity).
  const elapsedDays = state.creditUpdatedAt
    ? Math.max(
        0,
        (now.getTime() - state.creditUpdatedAt.getTime()) / MS_PER_DAY,
      )
    : 0;
  const decayed =
    state.credit * Math.pow(0.5, elapsedDays / DEMAND_HALF_LIFE_DAYS);
  const credit = decayed + creditRate * (elapsedDays / DAYS_PER_WEEK);

  let frontier = state.frontier;
  let phase = state.phase;
  let medianTestP: number | undefined;

  if (state.phase === 'warm_start') {
    if (lastClosedCohortAnswerCounts) {
      // First-cohort correction: JUMP to the re-estimate (readings already
      // include the cohort's measured conversion/concentration).
      frontier = Math.max(EXPLORATION_SLOT, Math.round(predicted));
      phase = 'learned';
    }
  } else if (lastClosedCohortAnswerCounts?.length) {
    // Steady state: the median test, ±1/week slew (LEARNED frontiers only).
    const weakest = Math.min(...lastClosedCohortAnswerCounts);
    medianTestP = medianTestProbability(weakest, readings.viability);
    frontier =
      state.frontier +
      (medianTestP >= MEDIAN_TEST_MAJORITY ? FRONTIER_STEP : -FRONTIER_STEP);
    frontier = Math.max(EXPLORATION_SLOT, frontier);
  }
  // No cohort evidence since the last tick → hold (no dither without an
  // observation to dither around).

  return {
    frontier,
    phase,
    credit,
    cohortTarget: Math.min(frontier, Math.floor(credit)),
    creditRate,
    predictedFrontier: predicted,
    medianTestP,
  };
}
