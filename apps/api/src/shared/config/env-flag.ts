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
