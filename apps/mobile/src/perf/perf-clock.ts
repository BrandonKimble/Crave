/**
 * THE PERF DIRECTORY'S CLOCK AND NUMBER HELPERS — one declaration each.
 *
 * F873 (2026-08-03): "what time is it" was answered SIX times in this one directory
 * (PerfScenarioCoordinator, perf-scenario-attribution, perf-scenario-work-span,
 * perf-scenario-hermes-sampling-profiler, reveal-commit-attribution, ResidentShellPrototype),
 * each an identical `performance.now() ?? Date.now()` re-declaration — in the module whose
 * entire job is to agree with itself about time. `clamp` / `round1` / `percentile` were
 * duplicated verbatim between the two samplers alongside them. Six clocks cannot be proven
 * to agree; one can.
 */

/**
 * Monotonic-where-available milliseconds. `performance.now()` is preferred because it does
 * not jump when the wall clock is adjusted; `Date.now()` is the fallback on a runtime that
 * lacks it (a measured span across a clock adjustment is the failure mode being avoided).
 */
export const perfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** One decimal place — the resolution every perf log in this directory reports at. */
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Nearest-rank percentile. Empty input is 0 — there is no sample to report. */
export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index] ?? 0;
};
