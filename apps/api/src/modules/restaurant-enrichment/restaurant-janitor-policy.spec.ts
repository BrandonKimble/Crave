import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// THE POLICY MUST READ A FIELD THAT MEANS WHAT IT SAYS.
//
// The janitor gated archive/retry on
// `restaurant_metadata->'lastEnrichmentAttempt'->>'count'`. Its only writer
// set that to `ranked.length` — the number of Google CANDIDATES returned, not
// the number of attempts. Two live consequences:
//
//   * A restaurant was ARCHIVED because Google returned the MOST evidence for
//     it (>= 3 candidates read as ">= 3 failed attempts").
//   * The `error` path wrote no count at all, so those placeholders sat at 0
//     forever and were re-enriched EVERY WEEK, permanently, at real Places
//     spend — the exact class the $118 and $323 lessons are about.
//
// A policy contract expressed as a JSON path in a raw SQL string in a
// different file cannot notice when its writer starts meaning something else.
//
// SCOPE (F370/D30). This file used to guard BOTH ends by scanning source text,
// and the READER half was proven always-green: inverting the archive
// comparison to `< threshold` — which archives every healthy placeholder and
// spares every failed one — left it 4/4 passing. The reader half now lives in
// restaurant-janitor-policy.integration.spec.ts, where the policy is EXECUTED
// against a real Postgres and the assertions are about which ids come back.
//
// What remains here is the WRITER half, and it is deliberately still a text
// scan: its subject is not a behaviour with an output to observe but the SHAPE
// of a Prisma update payload — `{ increment: 1 }` versus a bare assignment —
// which is the exact difference between a counter and the candidate-count blob
// it replaced. Read it as a lint, not as a proof: it can catch the old bug
// coming back by name, and it cannot tell you the janitor works.

const MODULE_DIR = __dirname;

/**
 * Comments are stripped before asserting. The first version of this spec
 * failed against the FIXED code because the explanatory comment describing the
 * old JSON path contains that path verbatim — a scanner that reads prose as
 * code is a scanner that lies in whichever direction is least convenient.
 */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter(
      (line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'),
    )
    .join('\n');
}

const enrichment = codeOnly(
  readFileSync(
    join(MODULE_DIR, 'restaurant-location-enrichment.service.ts'),
    'utf8',
  ),
);

describe('the counter is actually written', () => {
  it('every terminal-failure path INCREMENTS it (a replaced value is how the old bug worked)', () => {
    const increments =
      enrichment.match(/enrichmentFailureCount:\s*\{\s*increment:\s*1\s*\}/g) ??
      [];
    // recordNoMatchCandidates (status 'no_match') and recordEnrichmentFailure
    // (status 'error') — the error arm is the one that previously wrote
    // nothing and caused the permanent weekly re-enrichment.
    expect(increments).toHaveLength(2);
  });

  it('the counter is never assigned a raw value — only incremented', () => {
    // `enrichmentFailureCount: <number>` would reintroduce "replaced, not
    // accumulated", which is what made the blob unable to count anything.
    const rawAssignment = /enrichmentFailureCount:\s*(?!\{)\S/.exec(enrichment);
    expect(rawAssignment?.[0] ?? null).toBeNull();
  });
});
