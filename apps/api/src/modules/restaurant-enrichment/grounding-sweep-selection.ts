/**
 * THE SWEEP'S SELECTION ORDER (grounding red team 2026-08-31 — the batch
 * wedge). The old selection was `ORDER BY createdAt ASC` with a take-limit,
 * and the driver capped --limit at 100: the oldest ~100 ungrounded entities
 * were re-selected on EVERY run, so once the head filled with declined
 * entities (each skipped by the money guard, counting nothing), consecutive
 * sweeps re-bought the same window and never reached entity #101+ of the
 * 1,021 backlog — silently.
 *
 * The rederived rule, pure so a spec can prove it on the exact wedge shape:
 * - EXCLUDE entities at/over the terminal-failure (strike) threshold unless
 *   retryTerminal — they are the money guard's business, not the sweep's;
 *   selecting them only burned window slots on guaranteed skips.
 * - ORDER BY (enrichment_failure_count ASC, last attempt ASC NULLS FIRST,
 *   createdAt ASC): never-attempted entities come first, an entity judged
 *   today sinks below everything attempted longer ago, and creation order
 *   is only the final tiebreak. A declined-heavy head therefore cannot
 *   starve the tail: today's declines fall to the back of tomorrow's line.
 *
 * The comparator + filter here are THE definition; the service applies them
 * in memory over the (small — ~1k) ungrounded-active candidate set, so the
 * DB query stays a plain Prisma findMany and the ordering cannot fork
 * between SQL and spec.
 */

export interface SweepCandidate {
  entityId: string;
  failureCount: number;
  /** ISO timestamp of the last recorded attempt
   *  (restaurant_metadata.lastEnrichmentAttempt.failureAt / attemptedAt),
   *  or null when never attempted. */
  lastAttemptAt: string | null;
  createdAt: Date;
}

/** Terminal-threshold exclusion: mirrors the money guard exactly, minus one
 *  spent selection slot per already-terminal entity. */
export function isSweepEligible(
  candidate: Pick<SweepCandidate, 'failureCount'>,
  terminalThreshold: number,
  retryTerminal: boolean,
): boolean {
  return retryTerminal || (candidate.failureCount ?? 0) < terminalThreshold;
}

export function compareSweepCandidates(
  a: SweepCandidate,
  b: SweepCandidate,
): number {
  const failureDelta = (a.failureCount ?? 0) - (b.failureCount ?? 0);
  if (failureDelta !== 0) return failureDelta;
  // Never-attempted (null) sorts before any attempt; among attempted, the
  // ISO-8601 strings compare lexicographically == chronologically.
  if (a.lastAttemptAt !== b.lastAttemptAt) {
    if (a.lastAttemptAt === null) return -1;
    if (b.lastAttemptAt === null) return 1;
    return a.lastAttemptAt < b.lastAttemptAt ? -1 : 1;
  }
  const createdDelta = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdDelta !== 0) return createdDelta;
  return a.entityId.localeCompare(b.entityId);
}

/** Filter + order + limit — the whole selection rule in one call. */
export function selectSweepCandidates<T extends SweepCandidate>(
  candidates: T[],
  options: {
    terminalThreshold: number;
    retryTerminal: boolean;
    limit: number;
  },
): T[] {
  return candidates
    .filter((candidate) =>
      isSweepEligible(
        candidate,
        options.terminalThreshold,
        options.retryTerminal,
      ),
    )
    .sort(compareSweepCandidates)
    .slice(0, options.limit);
}
