import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { codeOnly } from './testing/code-only';

// A REPO-WIDE GUARD, because fixing instances does not fix the class.
//
// 162 of this schema's timestamp columns are `timestamp WITHOUT time zone`
// (31 are `with`). Prisma binds a JS Date as `timestamptz`. Where hand-written
// SQL compares the two, Postgres coerces the naive column using the SESSION's
// TimeZone — so the query means something different depending on where the
// server thinks it is. Prisma's own query builder knows each column's type and
// gets this right; only raw SQL bypasses that knowledge.
//
// Three real instances existed (found 2026-08-02): the polls feed keyset,
// which made the feed unpageable on any non-UTC host, the trending decay
// window, and the on-demand placeholder cleanup — an UPDATE whose SCOPE
// shifted with the timezone. Production runs UTC, where the offset is zero and
// all three were invisible.
//
// The rule: a raw-SQL comparison between an `_at` column and a bound value
// must state its frame. `AT TIME ZONE 'UTC'` for a naive column; an entry in
// AWARE_COLUMN_SITES for a genuinely `timestamptz` one. A new comparison fails
// this test until someone decides which it is.

const SRC = join(__dirname, '..');

/**
 * Sites comparing a column that really is `timestamp WITH time zone`, where a
 * bare timestamptz bind is correct. Verified against information_schema.
 */
const AWARE_COLUMN_SITES = new Set([
  // signals.recorded_at :: timestamp with time zone
  'modules/signals/signal-demand-aggregate.service.ts',
  // probed_regions.observed_at :: timestamp with time zone
  'modules/places/places-reconciler.service.ts',
]);

/**
 * EMPTY, AND IT MUST STAY THAT WAY.
 *
 * Every raw comparison against a naive column is now framed. This list exists
 * so that if one ever has to be exempted, the exemption is written down with a
 * reason rather than discovered later. The second test below asserts the list
 * matches reality exactly, so a fixed file cannot linger here and become a
 * place a NEW violation hides.
 */
const KNOWN_UNFRAMED = new Set<string>([]);

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function unframedComparisons(): string[] {
  const offenders: string[] = [];
  for (const file of tsFiles(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (AWARE_COLUMN_SITES.has(rel) || KNOWN_UNFRAMED.has(rel)) continue;
    const source = codeOnly(readFileSync(file, 'utf8'));

    // Scanned over the WHOLE file, not over `Prisma.sql`...`` blocks. An
    // earlier version matched the template literal with [^`]*, which stops at
    // the first backtick — so a backtick inside a SQL COMMENT truncated the
    // block and hid the very comparison being checked. It reported green
    // against a real reintroduced bug. `_at <op> ${...}` is a strong enough
    // SQL signature on its own.
    for (const cmp of source.matchAll(
      /(\w*_at)\s*(?:<=|>=|<|>|=|BETWEEN)\s*(\$\{[^}]*\})/g,
    )) {
      // IN the expression, not NEAR it (red team 2026-08-02). A 200-char
      // forward window let a DOWNSTREAM framed comparison mask an UPSTREAM
      // unframed one — and real WHERE clauses have several time comparisons
      // within 200 chars, so that was the common case, not a corner. The
      // window is now the matched comparison plus the small tail its own
      // conversion would occupy.
      const window = source.slice(
        cmp.index,
        (cmp.index ?? 0) + cmp[0].length + 40,
      );
      // Either the conversion is written inline, or it comes from a helper
      // whose whole job is to apply it.
      // Inline conversion, or the shared helper (under either the canonical
      // name or the signals-module alias that predates it).
      if (
        window.includes(`AT TIME ZONE`) ||
        window.includes('utcInstant(') ||
        window.includes('utcInstantSql(')
      )
        continue;
      offenders.push(`${rel}: ${cmp[0].replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
  return offenders;
}

describe('raw SQL timestamp frame', () => {
  it('every raw comparison against an _at column states its timezone frame', () => {
    expect(unframedComparisons()).toEqual([]);
  });

  it('the known-unframed list is exactly the files that still need it', () => {
    // If a listed file gets fixed, it must leave this list — otherwise the
    // list becomes a place where a NEW violation can hide.
    const stillOffending = new Set<string>();
    for (const file of tsFiles(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (!KNOWN_UNFRAMED.has(rel)) continue;
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const cmp of source.matchAll(
        /(\w*_at)\s*(?:<=|>=|<|>|=|BETWEEN)\s*(\$\{[^}]*\})/g,
      )) {
        // IN the expression, not NEAR it (red team 2026-08-02). A 200-char
        // forward window let a DOWNSTREAM framed comparison mask an UPSTREAM
        // unframed one — and real WHERE clauses have several time comparisons
        // within 200 chars, so that was the common case, not a corner. The
        // window is now the matched comparison plus the small tail its own
        // conversion would occupy.
        const window = source.slice(
          cmp.index,
          (cmp.index ?? 0) + cmp[0].length + 40,
        );
        if (
          window.includes(`AT TIME ZONE`) ||
          window.includes('utcInstant(') ||
          window.includes('utcInstantSql(')
        )
          continue;
        stillOffending.add(rel);
      }
    }
    expect([...stillOffending].sort()).toEqual([...KNOWN_UNFRAMED].sort());
  });
});
