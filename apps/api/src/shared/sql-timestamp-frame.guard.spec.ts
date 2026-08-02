import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
 * KNOWN-UNFRAMED, AND TRACKED RATHER THAN HIDDEN.
 *
 * Each of these compares a NAIVE column against a bound Date, verified against
 * information_schema on 2026-08-02:
 *
 *   collection_source_documents.collected_at / .source_created_at   NAIVE
 *   source_collection_lanes.due_at / .last_ran_at                   NAIVE
 *   collection_runs.started_at, collection_extraction_runs.started_at NAIVE
 *   demand_scoring_runs.started_at                                  NAIVE
 *   signals.occurred_at (and every partition)                       NAIVE
 *   api_usage_ledger.created_at                                     NAIVE
 *
 * They are LATENT, not broken: production and staging both run UTC, where the
 * offset is zero. They are listed — not skipped silently — so the count can
 * only go down, and so a new comparison cannot join them by accident.
 *
 * The real fix is the schema, not these call sites: 162 of this database's
 * timestamp columns are `timestamp WITHOUT time zone` while 31 are `with`, and
 * an instant should be stored as an instant. That is an owner-scale migration
 * (see product/pre-launch.md), not a 3am edit inside another session's tree.
 */
const KNOWN_UNFRAMED = new Set([
  'modules/analytics/demand-scoring-trace.service.ts',
  'modules/content-processing/reddit-collector/collector-pacer.service.ts',
  'modules/content-processing/reddit-collector/collector-source-registry.service.ts',
  'modules/external-integrations/shared/spend-analytics.service.ts',
  'modules/ops-dashboard/ops-summary.service.ts',
  'modules/signals/signal-demand-read.service.ts',
]);

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
    const source = readFileSync(file, 'utf8');

    // Scanned over the WHOLE file, not over `Prisma.sql`...`` blocks. An
    // earlier version matched the template literal with [^`]*, which stops at
    // the first backtick — so a backtick inside a SQL COMMENT truncated the
    // block and hid the very comparison being checked. It reported green
    // against a real reintroduced bug. `_at <op> ${...}` is a strong enough
    // SQL signature on its own.
    for (const cmp of source.matchAll(
      /(\w*_at)\s*(?:<=|>=|<|>|=|BETWEEN)\s*(\$\{[^}]*\})/g,
    )) {
      const window = source.slice(cmp.index, (cmp.index ?? 0) + 200);
      // Either the conversion is written inline, or it comes from a helper
      // whose whole job is to apply it.
      if (window.includes(`AT TIME ZONE`) || window.includes('naiveUtc('))
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
      const source = readFileSync(file, 'utf8');
      for (const cmp of source.matchAll(
        /(\w*_at)\s*(?:<=|>=|<|>|=|BETWEEN)\s*(\$\{[^}]*\})/g,
      )) {
        const window = source.slice(cmp.index, (cmp.index ?? 0) + 200);
        if (window.includes(`AT TIME ZONE`) || window.includes('naiveUtc('))
          continue;
        stillOffending.add(rel);
      }
    }
    expect([...stillOffending].sort()).toEqual([...KNOWN_UNFRAMED].sort());
  });
});
