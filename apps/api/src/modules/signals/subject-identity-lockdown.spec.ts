import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import {
  redirectJoinSql,
  resolvedSubjectSql,
  subjectMatchesSql,
} from './subject-identity';

/**
 * THE 15TH HAND-ROLLED COALESCE CANNOT APPEAR.
 *
 * Same shape as extraction-scope-lockdown.spec.ts and
 * gemini-gateway-lockdown.spec.ts. The guard this REPLACES was
 * `expect(demandSql).toContain('entity_redirects')` — which a reader that
 * joins the table and then ignores the fold-back passes, and which is exactly
 * the failure mode act-identity.ts names as what let three SQL dialects coexist
 * under one vocabulary.
 *
 * THIS ONE IS MUTATION-CAPABLE. Hand-roll a
 * `COALESCE(r.to_entity_id, s.subject_id)` in any ledger reader — the literal
 * form that lived at fourteen sites — and the first expectation fails naming
 * the file. (Proven RED on 2026-08-02 by planting exactly that in a scratch
 * file, then removing it.)
 */

const SIGNALS_DIR = __dirname;
const API_SRC = join(__dirname, '..', '..');

/**
 * Files that may name `entity_redirects` directly. These are the MERGE-WRITE
 * and projection machinery — they create redirects, or resolve identity on
 * tables that are not the ledger (documents, entity events, connections), so
 * they are not readers of `signals.subject_id` and the builder does not apply.
 */
const ALLOWED = [
  'signals/subject-identity.ts',
  'signals/signals.service.ts',
  'content-processing/entity-resolver/entity-anchor-rehome.service.ts',
  'content-processing/entity-resolver/food-dedupe-merge.service.ts',
  'content-processing/reddit-collector/extraction-scope.service.ts',
  'content-processing/reddit-collector/projection-rebuild.service.ts',
  'content-processing/reddit-collector/unified-processing.service.ts',
  'restaurant-enrichment/restaurant-entity-merge.service.ts',
  // NOT a ledger reader: the home near-you shelf resolves CURATED ROW identity
  // (curated_list_items.entity_id → survivor, then status='active') at read
  // time — the D36/F692 archived-leak law. Same category as the projection
  // machinery above: it never touches signals.subject_id.
  'home/home-feed.service.ts',
  // Ledger readers outside signals/ that F202 named. They are on the list to
  // be converted next; being LISTED is the point — the omission is visible
  // here instead of invisible in their SQL.
  'polls/supply/demand-mass.reader.ts',
  'polls/supply/poll-ballot-mention.service.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.includes('.spec.')) out.push(full);
  }
  return out;
}

/** The literal hand-rolled fold-back, in any alias spelling. */
const HAND_ROLLED_COALESCE = /COALESCE\(\s*\w+\.to_entity_id\s*,/;
const HAND_ROLLED_JOIN = /LEFT JOIN\s+entity_redirects\b/i;

describe('the ledger resolves subject identity in exactly one place', () => {
  it('no file outside the allowlist hand-rolls the redirect join or the fold-back', () => {
    const offenders = walk(API_SRC)
      .filter((file) => {
        const text = readFileSync(file, 'utf-8');
        return HAND_ROLLED_COALESCE.test(text) || HAND_ROLLED_JOIN.test(text);
      })
      .map((file) => file.slice(API_SRC.length + 1))
      .filter((rel) => !ALLOWED.some((allowed) => rel.endsWith(allowed)));

    expect(offenders).toEqual([]);
  });

  it('signal-demand-read.service.ts — the file that held all fourteen copies — holds none', () => {
    const text = readFileSync(
      join(SIGNALS_DIR, 'signal-demand-read.service.ts'),
      'utf-8',
    );
    expect(HAND_ROLLED_COALESCE.test(text)).toBe(false);
    expect(HAND_ROLLED_JOIN.test(text)).toBe(false);
    // ...and it uses the builder instead — an always-green scanner would pass
    // on a file that stopped resolving identity altogether.
    expect(text).toContain('redirectJoinSql(');
    expect(text).toContain('resolvedSubjectSql(');
  });

  it('lastEntityViewAt resolves identity — the reader F202 caught forgetting', () => {
    const text = readFileSync(
      join(SIGNALS_DIR, 'signal-demand-read.service.ts'),
      'utf-8',
    );
    const start = text.indexOf('async lastEntityViewAt(');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, text.indexOf('async restaurantViewStats('));
    expect(body).toContain("redirectJoinSql('s')");
    expect(body).toContain('subjectMatchesSql(');
    // The raw filter that was the defect must not come back.
    expect(body).not.toMatch(/AND\s+s\.subject_id\s*=\s*\$\{/);
  });
});

describe('the builder emits the join and the fold-back over the same aliases', () => {
  const textOf = (sql: Prisma.Sql) => sql.strings.join('?');

  it('a caller cannot take the join and skip the fold-back — they share one alias argument', () => {
    expect(textOf(redirectJoinSql('a'))).toBe(
      'LEFT JOIN entity_redirects r ON r.from_entity_id = a.subject_id',
    );
    expect(textOf(resolvedSubjectSql('a'))).toBe(
      'COALESCE(r.to_entity_id, a.subject_id)',
    );
  });

  it('supports the two-subject case (a food and its serving restaurant) without a second dialect', () => {
    expect(textOf(redirectJoinSql('a', 'rr', 'ctx_restaurant_id'))).toBe(
      'LEFT JOIN entity_redirects rr ON rr.from_entity_id = a.ctx_restaurant_id',
    );
    expect(textOf(resolvedSubjectSql('a', 'rr', 'ctx_restaurant_id'))).toBe(
      'COALESCE(rr.to_entity_id, a.ctx_restaurant_id)',
    );
  });

  it('the predicate form matches merged-away ids, which is the whole point', () => {
    const sql = subjectMatchesSql('s', Prisma.sql`${'abc'}::uuid`);
    expect(textOf(sql)).toContain('COALESCE(r.to_entity_id, s.subject_id)');
  });

  it('refuses an alias that is not an identifier', () => {
    expect(() => redirectJoinSql('a; DROP TABLE signals')).toThrow(
      /Invalid SQL alias/,
    );
    expect(() => resolvedSubjectSql('a', 'r', 'x)--')).toThrow(
      /Invalid SQL alias/,
    );
  });
});
