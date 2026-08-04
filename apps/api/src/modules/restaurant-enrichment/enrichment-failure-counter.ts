/**
 * A COUNTER THAT CAN ONLY COUNT.
 *
 * `enrichmentFailureCount` gates the janitor's archive/retry policy. Its
 * predecessor was `restaurant_metadata->'lastEnrichmentAttempt'->>'count'`,
 * whose only writer ASSIGNED it `ranked.length` — the number of Google
 * candidates returned, not the number of attempts. Two live consequences:
 *
 *   - a restaurant was ARCHIVED because Google returned the MOST evidence for
 *     it (>= 3 candidates read as ">= 3 failed attempts");
 *   - the `error` path wrote no count at all, so those placeholders sat at 0
 *     forever and were re-enriched EVERY WEEK at real Places spend — the class
 *     the $118 and $323 lessons are both about.
 *
 * The difference between a counter and that blob is `{ increment: 1 }` versus a
 * bare assignment. A spec used to police it by regexing the enrichment service
 * for the increment form and for the absence of raw assignment — which could
 * only see the one file it knew to read, and could not see a new one.
 *
 * So the increment is the only form this module hands out, and an ESLint
 * selector refuses a bare numeric or identifier assignment to the field
 * anywhere in the tree. Prisma's generated update type accepts `number` too;
 * that is the door the lint rule closes.
 */

/** The one legal write. Spread into a Prisma `data` payload. */
export function countEnrichmentFailure(): {
  enrichmentFailureCount: { increment: number };
} {
  return { enrichmentFailureCount: { increment: 1 } };
}
