/**
 * Keyword sort-plan derivation (was KeywordSearchSchedulerService's
 * buildSortPlan). Cheap 'new' every dispatch; heavy 'relevance'+'top' when
 * the durable lane-state watermark (lastTopRelevanceRunAt) is older than the
 * K1 cadence-clamp sentence (60d). The old ×3-of-safeIntervalDays term died
 * with the cooldown timers (no-fake-estimates law, 2026-07-24).
 */
import type { KeywordSearchSortPlan } from './keyword-search-orchestrator.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildKeywordSortPlan(params: {
  lastTopRelevanceRunAt?: Date;
  runAt?: Date;
  forceHeavy?: boolean;
}): KeywordSearchSortPlan[] {
  const runAt =
    params.runAt instanceof Date && !Number.isNaN(params.runAt.getTime())
      ? params.runAt
      : new Date();
  // §16: the 60 is K1 — the owner's cadence-clamp sentence ("no source
  // unvisited longer than 60d", plan §16 K1 list) as the heavy-pass floor.
  const thresholdDays = 60;
  const thresholdMs = thresholdDays * MS_PER_DAY;

  const heavyDue =
    params.forceHeavy === true ||
    !params.lastTopRelevanceRunAt ||
    runAt.getTime() - params.lastTopRelevanceRunAt.getTime() >= thresholdMs;

  const sortPlan: KeywordSearchSortPlan[] = [{ sort: 'new' }];
  if (heavyDue) {
    sortPlan.push({ sort: 'relevance' }, { sort: 'top' });
  }

  return sortPlan;
}
