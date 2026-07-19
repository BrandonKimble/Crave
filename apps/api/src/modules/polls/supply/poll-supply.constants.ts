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
 *  globally, refined per-place (hierarchical). OWNER-RATIFY(§18.1). */
export const VIABILITY_PRIOR = 15;

/** K2 (prior strength, inventoried): one pseudo-observation — the weakest
 *  informative prior (the first real cohort already halves its weight).
 *  Strength is part of the prior spec; self-erasure is the point. */
export const SUPPLY_PRIOR_STRENGTH = 1;

/** K2 (self-erasing prior): global conversion (answers-per-attention) prior
 *  = 1.0 — "one unit of attention mass converts to about one answer". Neutral
 *  unit prior; §18.6 instruments the real value from the FIRST Sundays.
 *  OWNER-RATIFY(§18.1). */
export const CONVERSION_PRIOR = 1.0;

/** K2 (self-erasing prior): tail-concentration prior = 1.0 (neutral — a flat
 *  answering tail). Measured per cohort as weakest/mean answers; scales the
 *  warm-start prediction down when answering concentrates at the top.
 *  OWNER-RATIFY(§18.1). */
export const TAIL_CONCENTRATION_PRIOR = 1.0;

/** K1-derived (no new number): supply-estimator observation half-life reuses
 *  the ratified 28d baseline/cooldown horizon — cohort evidence stops
 *  speaking on the same clock the demand baseline does. */
export const SUPPLY_ESTIMATOR_HALF_LIFE_DAYS = COOLDOWN_GAUSSIAN_DAYS;

/** K6 (definitional — nothing changes them): majority = 1/2 (the median
 *  test); minimal step = +/-1; the exploration slot / start floor = 1. */
export const MEDIAN_TEST_MAJORITY = 0.5;
export const FRONTIER_STEP = 1;
export const EXPLORATION_SLOT = 1;
