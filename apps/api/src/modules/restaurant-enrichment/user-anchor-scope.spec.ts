import { readFileSync } from 'fs';
import { join } from 'path';
import { userAnchoredEntitySql } from './user-anchor-scope';

/**
 * THE ANCHOR-ROSTER INVARIANT (grounding red team 2026-08-31).
 *
 * `scripts/reload/preserved-anchors.sql` is the AUTHORITATIVE anchor law
 * for the wipe; `user-anchor-scope.ts` mirrors its per-entity anchor
 * sources for runtime consumers (the janitor). This spec prevents ROSTER
 * drift: every anchor source table the SQL file reads must appear in the
 * TS predicate, and vice versa. It is deliberately a roster check, not a
 * semantics proof — a new anchor source added to either file fails here
 * until it appears in both (the semantics of each clause are reviewed at
 * the site, per the FK-policy legend in the SQL file).
 */

// Tables that anchor an ENTITY, in both files.
const ENTITY_ANCHOR_TABLES = [
  'poll_topics',
  'user_list_items',
  'photos',
  'curated_list_items',
  'collection_on_demand_requests',
  'signals',
  'signal_demand_daily',
  'poll_endorsements',
  'messages',
  'poll_comments',
  'core_restaurant_items',
];

// Read by the SQL file's preserved_entities build but deliberately NOT
// mirrored in the runtime predicate (wipe-only concerns — see the header
// comment in user-anchor-scope.ts).
const WIPE_ONLY_TABLES = ['core_restaurant_locations', 'entity_redirects'];

// Non-source references the roster scan must ignore.
const STRUCTURAL_NAMES = [
  'preserved_connections',
  'preserved_entities',
  'hops',
];

const sqlFile = readFileSync(
  join(__dirname, '../../../scripts/reload/preserved-anchors.sql'),
  'utf8',
);

/** Every `FROM <table>` / `JOIN <table>` token in a SQL text (comments
 *  stripped first — prose says "from" too). */
function referencedTables(sql: string): Set<string> {
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const tables = new Set<string>();
  for (const match of withoutComments.matchAll(
    /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    tables.add(match[1].toLowerCase());
  }
  return tables;
}

describe('the user-anchor roster cannot drift between the wipe SQL and the runtime predicate', () => {
  it('the runtime predicate reads exactly the entity-anchor tables', () => {
    const tsTables = referencedTables(userAnchoredEntitySql('e'));
    expect([...tsTables].sort()).toEqual([...ENTITY_ANCHOR_TABLES].sort());
  });

  it('the wipe SQL reads the same roster (plus its wipe-only concerns)', () => {
    const sqlTables = referencedTables(sqlFile);
    for (const name of STRUCTURAL_NAMES) {
      sqlTables.delete(name);
    }
    const expected = [...ENTITY_ANCHOR_TABLES, ...WIPE_ONLY_TABLES].sort();
    expect([...sqlTables].sort()).toEqual(expected);
  });

  it('the two-half composite endorsement subject is handled in both', () => {
    // The one anchor whose id is not a bare uuid: the poll-local
    // 'restaurantId::foodId' composite. Both halves must be reachable.
    const ts = userAnchoredEntitySql('e');
    expect(ts).toContain("|| '::%'");
    expect(ts).toContain("'%::' ||");
    expect(sqlFile).toContain("split_part(subject_id, '::', 1)");
    expect(sqlFile).toContain("split_part(subject_id, '::', 2)");
  });
});
