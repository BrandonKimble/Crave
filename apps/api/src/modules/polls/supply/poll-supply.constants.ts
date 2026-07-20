/**
 * §22 item 4 — poll supply constants, each classified under the Constants
 * Constitution (master plan §16). NO caps, NO arbitrary numbers: every value
 * below is exactly one of the six kinds, named in its comment. Unclassifiable
 * numbers are not allowed to exist.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DAYS_PER_WEEK = 7; // definitional (calendar fact)

/** K1 (owner-ratified product sentence): "7d cycle" — recency is flat across
 *  the current weekly cycle. */
export const RECENCY_FLAT_DAYS = 7;

/** K1: "14d demand half-life" — after the flat week, influence halves every
 *  14 days. Also the credit-decay half-life (§4: "Credit decays (14d
 *  half-life)"). */
export const DEMAND_HALF_LIFE_DAYS = 14;

/** K1: "28d cooldown gaussian" — a just-polled subject recovers availability
 *  on a 28-day gaussian ramp. Also the rolling-baseline horizon the
 *  resurgence read reuses (baseline window = 4 weekly cycles = 28d; no new
 *  number is minted for it). */
export const COOLDOWN_GAUSSIAN_DAYS = 28;

/** K1: the 7-day poll window (seeded ritual polls close together a week
 *  later = weekly results day). Stamped per-poll as closeWindowDays. */
export const SEEDED_POLL_WINDOW_DAYS = 7;

/** K1: the weekly ritual moment — Sunday (dow 0) 09:00 LOCAL (§4). Two
 *  facts of the ratified sentence, not tunables. */
export const RITUAL_LOCAL_DAY_OF_WEEK = 0;
export const RITUAL_LOCAL_HOUR = 9;

/** K2 (data; self-erasing prior): viability(place) day-one prior = 15
 *  answers — the participation level at which polls demonstrably produce
 *  strong content. SELF-ERASING via the estimator registry; measured
 *  globally, refined per-place (hierarchical). Prior value 15 is in the
 *  ratified §4 text; self-erasure RATIFIED with the priors docket 2026-07-19. */
export const VIABILITY_PRIOR = 15;

/** K2 (prior strength, inventoried): one pseudo-observation — the weakest
 *  informative prior (the first real cohort already halves its weight).
 *  Strength is part of the prior spec; self-erasure is the point. */
export const SUPPLY_PRIOR_STRENGTH = 1;

/** K2 (self-erasing prior): global conversion (answers-per-attention) prior
 *  = 1.0 — "one unit of attention mass converts to about one answer". Neutral
 *  unit prior; §18.6 instruments the real value from the FIRST Sundays.
 *  RATIFIED 2026-07-19 (owner docket item 4). */
export const CONVERSION_PRIOR = 1.0;

/** K2 (self-erasing prior): tail-concentration prior = 1.0 (neutral — a flat
 *  answering tail). Measured per cohort as weakest/mean answers; scales the
 *  warm-start prediction down when answering concentrates at the top.
 *  RATIFIED 2026-07-19 (owner docket item 4). */
export const TAIL_CONCENTRATION_PRIOR = 1.0;

/** K2 (data; own inventory line): supply-estimator observation half-life =
 *  28d — how long a closed cohort's evidence keeps speaking to the
 *  conversion/yield/concentration/viability estimators. This is a PRIOR on
 *  the evidence clock, numerically coincident with the K1 28d cooldown
 *  gaussian but NOT derived from it: the cooldown is a ratified product
 *  sentence about subject repetition; this is a measurable estimator
 *  property (re-fit when drift injection says the evidence clock is wrong). */
export const SUPPLY_ESTIMATOR_HALF_LIFE_DAYS = 28;

/** K6 (definitional — nothing changes them): majority = 1/2 (the median
 *  test); minimal step = +/-1; the exploration slot / start floor = 1. */
export const MEDIAN_TEST_MAJORITY = 0.5;
export const FRONTIER_STEP = 1;
export const EXPLORATION_SLOT = 1;

/** Definitional: "negligible" = a relative half-life-decayed weight below one
 *  part in a thousand — strictly below the resolution of every consumer of
 *  these kernels (the frontier moves in INTEGER steps, credit publishes on
 *  floor(credit), the median test compares a probability to 1/2). Not a
 *  tunable: it only says when a contribution can no longer change any
 *  decision, so query horizons derived from it are pure efficiency bounds,
 *  never behavior knobs. */
export const NEGLIGIBLE_CONTRIBUTION_EPSILON = 1e-3;

/** DERIVED (no new number): half-lives until a decayed weight falls under
 *  NEGLIGIBLE_CONTRIBUTION_EPSILON — ceil(log2(1/epsilon)) = 10. */
export const HALF_LIVES_TO_NEGLIGIBLE = Math.ceil(
  Math.log2(1 / NEGLIGIBLE_CONTRIBUTION_EPSILON),
);

/** DERIVED demand-kernel horizon: the recency kernel is flat for
 *  RECENCY_FLAT_DAYS then halves every DEMAND_HALF_LIFE_DAYS, so beyond
 *  flat + 10 half-lives (7 + 140 = 147d) a signal's weight is < epsilon and
 *  cannot move any consumer — the kernel's OWN horizon, used to bound
 *  occurred_at scans (the kernel still extinguishes inside the bound). */
export const DEMAND_KERNEL_HORIZON_DAYS =
  RECENCY_FLAT_DAYS + HALF_LIVES_TO_NEGLIGIBLE * DEMAND_HALF_LIFE_DAYS;

/** DERIVED estimator-evidence horizon: cohort observations decay on
 *  SUPPLY_ESTIMATOR_HALF_LIFE_DAYS, so cohorts launched more than 10
 *  half-lives ago (280d) contribute < epsilon to every estimate — the
 *  harvest's launchedAt lower bound. */
export const ESTIMATOR_EVIDENCE_HORIZON_DAYS =
  HALF_LIVES_TO_NEGLIGIBLE * SUPPLY_ESTIMATOR_HALF_LIFE_DAYS;
