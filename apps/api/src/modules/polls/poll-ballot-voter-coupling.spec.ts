import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * F540 — the per-voter ballot document is excluded from A(τ) (the public-score
 * source-activity baseline) by a SINGLE cross-module contract with no coupling
 * test: the WRITER (poll-ballot-mention.service) must stamp `voterUserId` onto
 * the ballot doc's rawPayload, and the SCORER (public-crave-score.service) must
 * exclude any doc whose raw_payload carries that exact key. If the two drift —
 * the writer renames the key, or the scorer's predicate changes — a poll room's
 * A(τ) silently re-weights by turnout (voters+1 docs instead of 1). This spec
 * couples them on the shared marker literal: change either side alone and it
 * goes RED, which is the drift the finding warned no test could catch.
 */

const MARKER = 'voterUserId';
const ROOT = join(__dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

describe('ballot voter-doc exclusion coupling (F540)', () => {
  const writerSrc = read('modules/polls/supply/poll-ballot-mention.service.ts');
  const scorerSrc = read(
    'modules/content-processing/public-crave-score/public-crave-score.service.ts',
  );

  it('the WRITER stamps the voter marker onto the ballot document payload', () => {
    expect(writerSrc).toContain(`${MARKER}: choice.userId`);
  });

  it('the SCORER excludes ballot documents by that exact marker key', () => {
    // The A(τ) doc-mass LATERAL drops any source doc whose payload carries the
    // voter marker (a ballot claim, not room activity).
    expect(scorerSrc).toContain(`raw_payload ? '${MARKER}'`);
  });

  it('both sides reference the SAME literal — neither can drift silently', () => {
    // Redundant with the two above, stated as the invariant: the identical
    // marker token appears on both ends of the contract.
    expect(writerSrc.includes(MARKER) && scorerSrc.includes(MARKER)).toBe(true);
  });
});
