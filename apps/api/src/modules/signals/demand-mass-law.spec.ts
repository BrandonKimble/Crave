import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '../../shared/testing/code-only';

// ONE LAW, TWO READERS.
//
// The §4 daily-acts rule had two incompatible SQL implementations over the
// same table (red team 2026-08-02):
//
//   demand-mass.reader.ts   excluded echo kinds, required an entity subject,
//                           and grouped by KIND — two kinds on one day are two
//                           acts and must SUM.
//   signal-demand-read.ts   did none of it: no echo exclusion, no
//                           subject_type filter, no kind in the grain, so
//                           every kind of a day collapsed into a single MAX.
//
// Same entity, same day, a different score — and the looser one is what the
// collector's territory read used to decide what gets enriched. The RECENCY
// half of this law was hoisted into dayRecencySql for exactly this reason; the
// act-identity half was left behind.

// COMMENT-STRIPPED (red team 2026-08-02). Every assertion here is text
// presence, so `AND TRUE /* was dayActsFilterSql(...) */` satisfied the guard
// with the filter gone. A scanner that reads prose as implementation is a
// search for the word we hoped to find.
function read(...parts: string[]): string {
  return codeOnly(readFileSync(join(__dirname, ...parts), 'utf8'));
}

const massReader = read('..', 'polls', 'supply', 'demand-mass.reader.ts');
const signalsReader = read('signal-demand-read.service.ts');
const actIdentity = read('act-identity.ts');

describe('the §4 daily-acts law has one statement', () => {
  it('act-identity owns the filter and the grain', () => {
    expect(actIdentity).toContain('export function dayActsFilterSql');
    expect(actIdentity).toContain('DAY_ACTS_GRAIN_SQL');
  });

  it('the signals reader applies the shared filter, not its own looser one', () => {
    expect(signalsReader).toContain('dayActsFilterSql(');
  });

  it('both readers exclude echo kinds — the divergence that mattered most', () => {
    // The mass reader names them directly; the signals reader now passes them
    // into the shared filter. Either way, neither may count an echo.
    expect(massReader).toContain('ECHO_KINDS');
    // Asserted at the CALL, not anywhere in the file — the bare name was
    // satisfied by the import statement alone, which stayed green with the
    // filter deleted.
    expect(signalsReader).toMatch(/dayActsFilterSql\(\s*ECHO_SIGNAL_KINDS/);
  });

  it('both readers keep KIND in the daily grain', () => {
    // Collapsing kinds into one MAX silently under-counts demand: one actor
    // searching AND selecting on the same day is two acts, not one.
    expect(massReader).toContain('a.kind, a.subject_id');
    expect(signalsReader).toContain('GROUP BY 1, 2, 3, a.kind');
  });

  it('the signals reader SUMs across kinds before applying recency', () => {
    // Adding kind to the grain without summing it back would multiply the
    // recency weight per kind instead of weighting the day once.
    expect(signalsReader).toContain('by_day AS (');
    expect(signalsReader).toMatch(/SUM\(day_acts\)::float8 AS day_acts/);
  });
});
