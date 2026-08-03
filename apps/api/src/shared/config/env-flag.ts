/**
 * ONE spelling of "is this env var on".
 *
 * WHY (red team 2026-08-02). `COLLECTION_SCHEDULER_ENABLED` had two readers
 * with two different answers: the collector pacer lowercased before comparing,
 * and Reddit's credential check compared case-sensitively against `'true'`.
 * So `COLLECTION_SCHEDULER_ENABLED=TRUE` started the pacer dispatching
 * collection while Reddit skipped credential validation entirely — one switch,
 * two answers, and the disagreement is silent.
 *
 * The codebase also carries at least three other dialects: `=== 'false'` for
 * an inverted-sense flag, `'true' || '1'`, and bare truthiness. Each is a place
 * where a plausible value does the wrong thing.
 *
 * This accepts the spellings a human actually types and treats everything else
 * as OFF, because a flag nobody can prove is on should not be on.
 */
const TRUTHY = new Set(['true', '1', 'yes', 'on']);
const FALSY = new Set(['false', '0', 'no', 'off', '']);

export function isEnvFlagEnabled(
  raw: string | undefined | null,
  fallback = false,
): boolean {
  if (raw === undefined || raw === null) return fallback;
  const value = raw.trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  // An unrecognized value is not a silent yes.
  return false;
}

/**
 * The companion for OPT-DOWN flags: a switch that is ON by default and whose
 * env var exists only to turn it off (e.g. `COLLECTION_RELEVANCE_GATE=off`).
 *
 * `isEnvFlagEnabled(raw, true)` is the WRONG tool for those: it reads an
 * unrecognized value as OFF, so a typo would silently DISABLE a protection —
 * and for an opt-down flag the unsafe direction is off, not on. This answers
 * the narrower question — "did someone explicitly say no?" — using the same
 * one FALSY set, so there is still exactly one dialect.
 */
export function isEnvFlagExplicitlyDisabled(
  raw: string | undefined | null,
): boolean {
  if (raw === undefined || raw === null) return false;
  const value = raw.trim().toLowerCase();
  if (value === '') return false;
  return FALSY.has(value);
}
