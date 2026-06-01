/**
 * Shared demand-scoring curve kernel.
 *
 * The search-demand architecture review called for a shared scoring vocabulary
 * across poll topic planning, on-demand collection, and keyword collection
 * priority. Those consumers legitimately differ in *what* they score, so they do
 * NOT share a single `finalScore`. What they share is the *shape* of the curves —
 * saturating growth, gaussian recovery/cooldown, surge-over-baseline, log
 * breadth. Before this module each consumer re-implemented those shapes inline
 * with its own constants, so a curve could silently drift between consumers and
 * none were unit-tested.
 *
 * These are pure functions. Each consumer composes them with its OWN tuning
 * constants (poll cooldown days, keyword half-lives, etc.) — they share the
 * shape, not the tuning. They are exhaustively property-tested in `curves.spec.ts`.
 */

/** Clamp to the unit interval. */
export const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, value));

/**
 * Saturating exponential growth: 0 at x=0, asymptotically 1 as x grows.
 * `rate` controls how quickly it saturates. Result is in [0, 1).
 * Used for diminishing-return boosts (e.g. resurgence credit/boost from surge units).
 */
export const saturating = (x: number, rate: number): number =>
  1 - Math.exp(-rate * Math.max(0, x));

/**
 * Gaussian decay: 1 at x=0, falling to 0 as x passes `scale`. Result is in (0, 1].
 * Used for "freshness fades with time/distance" (e.g. no-results recovery window).
 */
export const gaussianDecay = (x: number, scale: number): number =>
  Math.exp(-Math.pow(Math.max(0, x) / scale, 2));

/**
 * Gaussian ramp: 0 at x=0, rising to 1 as x passes `scale`. Result is in [0, 1).
 * The complement of gaussianDecay; used for cooldown/availability recovery.
 */
export const gaussianRamp = (x: number, scale: number): number =>
  1 - gaussianDecay(x, scale);

/**
 * Half-life decay: 1 at x=0, 0.5 at x=halfLife, halving each halfLife thereafter.
 * Result is in (0, 1]. Used for smooth recency decay after a current cycle.
 */
export const halfLifeDecay = (x: number, halfLife: number): number =>
  Math.pow(0.5, Math.max(0, x) / halfLife);

/**
 * Surge units: how far `current` exceeds `baseline`, measured in log2 doublings
 * above a `knee`. 0 unless current exceeds baseline * 2^knee, then grows by 1 per
 * doubling. Captures "this is genuinely surging vs its own baseline", not raw size.
 */
export const surgeUnits = (
  current: number,
  baseline: number,
  knee = 1,
): number => {
  const ratio = baseline > 0 ? current / baseline : 0;
  return Math.max(0, Math.log2(Math.max(ratio, 0)) - knee);
};

/**
 * Log growth: log2(1 + x). 0 at x=0, monotonically increasing with diminishing
 * returns. The canonical "distinct-user breadth" / log-scaled-demand shape.
 */
export const logGrowth = (x: number): number => Math.log2(1 + Math.max(0, x));

/**
 * Robust scale from a median absolute deviation (MAD). `1.4826 * mad` makes MAD a
 * consistent estimator of the standard deviation for normal data; floored at
 * epsilon so it is safe as a divisor for robust z-scoring.
 */
export const robustScale = (mad: number): number =>
  Math.max(1.4826 * Math.max(0, mad), Number.EPSILON);

/**
 * Inverse-coverage explore curve: high when coverage is low, settling toward a
 * floor as coverage approaches 1. `0.25 + 0.75 * (1 - coverage)^exponent`, so
 * fully-covered subjects keep a small floor of explore weight.
 */
export const inverseCoverage = (coverage: number, exponent = 1.2): number =>
  0.25 + 0.75 * Math.pow(1 - clamp01(coverage), exponent);
