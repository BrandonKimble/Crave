/**
 * C2: the reddit platform ADAPTER declaration — the platform's lanes,
 * cadences, and request-cost estimates live HERE, not in the pacer.
 * Collection behaviors attach to sources; the pacer stays platform-neutral.
 *
 * reddit lanes (§10): chronological (unbiased sample — the docsPerDay
 * sampling lane), keyword (pull, biased — never feeds docsPerDay). archive is
 * a ONE-SHOT proposed sweep (§10 — zero reddit calls, pushshift files), never
 * a standing lane, so it does not appear here. poll_surface is push-complete
 * with ZERO pull lanes and therefore has no adapter entry at all.
 */

export const REDDIT_POOL_NAME = 'reddit.requests';

export interface RedditLaneDeclaration {
  lane: 'chronological' | 'keyword';
  defaultCadenceDays: number;
  /** K1 lateness-tolerance sentence as a number (§14.3): chronological
   *  declares ≈ its cadence; a keyword sweep a week late is fine.
   *  OWNER-RATIFY (§18). */
  defaultLatenessToleranceDays: number;
  /** Declared reddit-request demand for one dispatch of this lane — the
   *  governor reservation estimate (declared-vs-actual pairs measure drift). */
  estimateRequests(context: { termCount?: number }): number;
}

export const REDDIT_LANES: readonly RedditLaneDeclaration[] = [
  {
    lane: 'chronological',
    defaultCadenceDays: 1,
    defaultLatenessToleranceDays: 1,
    // /new listing pages: 1000-post max at 100/page.
    estimateRequests: () => 10,
  },
  {
    lane: 'keyword',
    defaultCadenceDays: 7,
    defaultLatenessToleranceDays: 7,
    // Per term: one search request per sort in the plan (≤3) plus thread
    // fetches for uncovered results — coverage makes covered results free
    // post-archive (§11), so the estimate prices the search calls.
    estimateRequests: ({ termCount }) => Math.max(1, (termCount ?? 1) * 4),
  },
] as const;

export function redditLaneDeclaration(
  lane: string,
): RedditLaneDeclaration | undefined {
  return REDDIT_LANES.find((declaration) => declaration.lane === lane);
}
