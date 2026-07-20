/**
 * Keyword sort-plan derivation (was KeywordSearchSchedulerService's
 * buildSortPlan). Cheap 'new' every dispatch; heavy 'relevance'+'top' when the
 * durable lane-state watermark (lastTopRelevanceRunAt) is older than
 * max(3 × safeIntervalDays, 60d).
 */
import type { KeywordSearchSortPlan } from './keyword-search-orchestrator.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildKeywordSortPlan(params: {
  safeIntervalDays: number;
  lastTopRelevanceRunAt?: Date;
  runAt?: Date;
  forceHeavy?: boolean;
}): KeywordSearchSortPlan[] {
  const runAt =
    params.runAt instanceof Date && !Number.isNaN(params.runAt.getTime())
      ? params.runAt
      : new Date();
  const safeIntervalDays =
    Number.isFinite(params.safeIntervalDays) && params.safeIntervalDays > 0
      ? params.safeIntervalDays
      : 0;
  const thresholdDays = Math.max(safeIntervalDays * 3, 60);
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
