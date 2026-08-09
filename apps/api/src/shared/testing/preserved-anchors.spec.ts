import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE USER-ANCHOR LAW IS A PROPERTY OF THE SCHEMA, NOT OF A LIST SOMEONE
 * MAINTAINS.
 *
 * `scripts/reload/preserved-anchors.sql` calls itself "THE canonical
 * user-anchor set (single source of truth)". It is an ENUMERATION, and an
 * enumeration cannot be a single source of truth for a growing schema — it is
 * true only until the next table is added. It already failed once exactly that
 * way: messaging shipped after the set was written, so `messages.shared_entity_id`
 * (a DM entity share — the one surface whose whole point is a durable link)
 * was missing, and a wipe would have deleted the entity behind a share card,
 * rendering it permanently "unavailable". That is precisely the broken user
 * link law 2 of wipe-city-derived.sql forbids (audit 2026-08-03, F1250, proven
 * RED on the mirror with a GREEN control).
 *
 * This is the `filesImporting()` lesson in SQL, and the remedy is the same
 * one: derive the census from the whole tree instead of from memory. Every
 * column in the schema that STORES a core_entities / connection id must be
 * either
 *
 *   (a) COVERED — an arm of preserved-anchors.sql reads it, or
 *   (b) EXEMPT  — listed below with the reason it needs no anchor, and (when
 *       the reason is "derived") the ANCHORED surface it is derived from.
 *
 * A new column that is neither fails this test. So the next `messages` fails a
 * test instead of failing a user.
 *
 * MUTATION PROOF (the RED recipe): delete the `FROM messages` arm from
 * preserved-anchors.sql and this spec fails naming `messages.shared_entity_id`.
 * Delete any other arm and it names that column instead.
 */

const SCHEMA = join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma');
const ANCHORS = join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'reload',
  'preserved-anchors.sql',
);

/**
 * A column STORES an entity/connection reference iff its name has one of these
 * shapes. Deliberately name-shaped rather than FK-shaped: the defect column
 * (`messages.shared_entity_id`) is a bare `text` with NO foreign key, so an
 * FK-driven census would have missed it in the identical way the hand list did.
 */
const REFERENCE_SHAPE =
  /(^|_)(entity_id|entity_ids|restaurant_id|dish_id|food_id|subject_id|connection_id)$|^target_[a-z_]+_id$/;

type Column = { table: string; column: string };

/** Every `table.column` in schema.prisma whose name is reference-shaped. */
function referenceColumns(): Column[] {
  const lines = readFileSync(SCHEMA, 'utf8').split('\n');
  const out: Column[] = [];
  let model: string | null = null;
  let mappedTable: string | null = null;
  let pending: Column[] = [];

  const flush = (table: string): void => {
    for (const c of pending) out.push({ table, column: c.column });
    pending = [];
  };

  for (const line of lines) {
    const open = /^model\s+(\w+)\s*\{/.exec(line);
    if (open) {
      model = open[1];
      mappedTable = null;
      pending = [];
      continue;
    }
    if (model === null) continue;
    if (/^\}/.test(line)) {
      // A model's table name is its @@map value if present, else the model
      // name — and it holds for EVERY field regardless of whether the field
      // was declared before or after the `@@map` line. Flushing on `@@map`
      // (the prior bug) keyed post-@@map fields under the model name, latent
      // only because Prisma convention puts @@map last.
      flush(mappedTable ?? model);
      model = null;
      mappedTable = null;
      continue;
    }
    const mapped = /@@map\("([^"]+)"\)/.exec(line);
    if (mapped) {
      mappedTable = mapped[1];
      continue;
    }
    const field = /^\s{2}(\w+)\s+\w+/.exec(line);
    if (!field) continue;
    const colMap = /@map\("([^"]+)"\)/.exec(line);
    const column = colMap ? colMap[1] : field[1];
    if (REFERENCE_SHAPE.test(column)) pending.push({ table: '', column });
  }
  return out;
}

/**
 * Every `table.column` an arm of preserved-anchors.sql actually reads.
 *
 * The file is a union of arms; each arm names its source tables in its own
 * `FROM`/`JOIN`. A column counts as covered for `<table>.<column>` only when
 * it is READ AS that column of that table:
 *
 *   - a qualified reference `<alias>.<column>` where the alias resolves,
 *     through the arm's own FROM/JOIN aliases, to `<table>`; or
 *   - a BARE `<column>` token, but ONLY in an arm that has exactly one real
 *     table in scope, so the token cannot belong to anything else.
 *
 * This is what makes the comment TRUE: crediting a bare identifier to the
 * arm's FROM-table regardless of which JOINed table it belongs to (the prior
 * behaviour) satisfied coverage from a column that merely appears somewhere in
 * the arm — a join column of another table, an alias, even a keyword — which
 * is the exact FALSE-GREEN direction of the law this gate enforces.
 */
const SQL_NON_ALIAS = new Set([
  'ON',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'UNION',
  'GROUP',
  'ORDER',
  'AND',
  'OR',
  'AS',
  'USING',
  'SELECT',
  'INSERT',
]);

function coveredColumns(): Set<string> {
  const sql = readFileSync(ANCHORS, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
  const covered = new Set<string>();
  // Split on UNION *and* on each CREATE TEMP TABLE, so the head arm of a
  // block is not swallowed by the tail of the previous block (which would
  // pair it with the WRONG table and silently mark it covered).
  for (const arm of sql.split(/\bUNION\b|CREATE\s+TEMP\s+TABLE/i)) {
    // Map every table alias in this arm to its real table; a bare table maps
    // to itself. `AS`-less aliases are the common case here.
    const aliases = new Map<string, string>();
    const tables = new Set<string>();
    const src =
      /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?/gi;
    for (const m of arm.matchAll(src)) {
      const table = m[1];
      tables.add(table);
      aliases.set(table, table);
      const alias = m[2];
      if (alias && !SQL_NON_ALIAS.has(alias.toUpperCase())) {
        aliases.set(alias, table);
      }
    }
    if (tables.size === 0) continue;
    // Qualified `<alias>.<column>` — resolve the alias to its table.
    for (const m of arm.matchAll(
      /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g,
    )) {
      const table = aliases.get(m[1]);
      if (table) covered.add(`${table}.${m[2]}`);
    }
    // Bare tokens count only when a single real table is in scope.
    if (tables.size === 1) {
      const only = [...tables][0];
      for (const m of arm.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
        covered.add(`${only}.${m[1]}`);
      }
    }
  }
  return covered;
}

/**
 * Columns that hold a reference but need NO anchor, each with the reason.
 * "derived from X" means: the rows are a projection of X, X IS anchored, and
 * the projection is rebuilt after a wipe — so preserving the projection's ids
 * would preserve nothing the anchor does not already hold.
 */
const EXEMPT: Record<string, string> = {
  'core_entities.entity_id':
    'the identity itself, not a reference to one — this is the table the law protects',
  'entity_redirects.from_entity_id':
    'the redirect graph — handled structurally by the transitive closure block at the foot of preserved-anchors.sql, not by an arm',
  'entity_redirects.to_entity_id':
    'the redirect graph — handled structurally by the transitive closure block at the foot of preserved-anchors.sql, not by an arm',

  // ---- derived layer: rebuilt by the re-extract runner's ingest ----
  'entity_satisfies.from_entity_id':
    "derived vocabulary edge — it carries a promptVersion, is re-decided by re-extraction, and CASCADEs with its entity. Preserving an entity because a derived edge points at it would make the LLM's opinion an anchor.",
  'entity_satisfies.to_entity_id':
    'same: derived, prompt-versioned, cascaded. Not user evidence.',
  'core_restaurant_events.restaurant_id':
    'derived evidence ledger — the wipe deletes it BY DESIGN and ingest rebuilds it',
  'core_restaurant_entity_events.restaurant_id':
    'derived evidence ledger — the wipe deletes it BY DESIGN and ingest rebuilds it',
  'core_restaurant_entity_events.entity_id':
    'derived evidence ledger — the wipe deletes it BY DESIGN and ingest rebuilds it',
  'core_restaurant_entity_signals.restaurant_id':
    'derived from the event ledger — rebuilt by ingest',
  'core_restaurant_entity_signals.entity_id':
    'derived from the event ledger — rebuilt by ingest',
  'core_restaurant_attribute_evidence.restaurant_id':
    'derived from the event ledger — rebuilt by ingest',
  'core_restaurant_item_mentions.connection_id':
    'derived from the event ledger — rebuilt by ingest',
  'knowledge_pass_runs.subject_id':
    'vocabulary-maintenance watermark keyed by an entity — a dangling subject just re-queues the pass',
  'derived_entity_sibling_edges.anchor_entity_id':
    'derived projection — rebuilt by ingest',
  'derived_entity_sibling_edges.sibling_entity_id':
    'derived projection — rebuilt by ingest',
  'derived_food_category_edges.food_id':
    'derived projection — rebuilt by ingest',
  'derived_entity_word_deletes.entity_id':
    'derived projection — rebuilt by ingest',
  'demand_scoring_candidates.entity_id':
    'derived scoring worklist — recomputed, holds no user link',
  'core_public_entity_scores.subject_id':
    'derived score projection — recomputed by the rescore coordinator',
  'poll_leaderboard_entries.subject_id':
    'derived from poll_endorsements, which IS anchored',
  'signal_demand_daily.subject_id':
    'derived rollup of signals, which IS anchored',
  'user_taste_profile.subject_id':
    'derived projection of signals, which IS anchored (F1250 near-miss: unenumerated but safe BY DERIVATION)',
  'metro_location_probes.restaurant_id':
    'operational probe telemetry — a measurement sample, not a user link',
  'entity_surface.entity_id':
    'OWNED per-entity vocabulary — display AND recall forms since the surface merge (ON DELETE CASCADE), not a reference to someone else’s entity — the rows live and die with the entity the anchor already protects, and hold no user link',
};

describe('preserved-anchors.sql covers every entity reference in the schema', () => {
  it('no reference-shaped column is unclassified', () => {
    const covered = coveredColumns();
    const unclassified = referenceColumns()
      .map((c) => `${c.table}.${c.column}`)
      .filter((key) => !covered.has(key) && EXEMPT[key] === undefined)
      .sort();

    // If this fails, a column that stores an entity id is neither preserved by
    // the wipe nor explained. Decide which it is: add an arm to
    // preserved-anchors.sql (a user surface), or add an EXEMPT entry naming
    // the anchored surface it derives from.
    expect([...new Set(unclassified)]).toEqual([]);
  });

  it('the census actually sees the schema (no empty-loop green)', () => {
    // An always-green guard is the disease, not the cure. The floor is the
    // RECORDED census size, not an underived magic constant: a schema only
    // grows, so the census must never drop below what it last measured.
    // A parser regression that collapsed the census (e.g. 45 -> 3) would red
    // here instead of silently shrinking the set of columns audited above.
    // Bump this when the schema legitimately adds reference columns.
    const RECORDED_CENSUS = 45;
    expect(referenceColumns().length).toBeGreaterThanOrEqual(RECORDED_CENSUS);
  });

  it('the messages share anchor is present (F1250, the column that proved it)', () => {
    // The specific regression, asserted by name: this is the column whose
    // absence was proven RED on the mirror.
    expect(coveredColumns().has('messages.shared_entity_id')).toBe(true);
  });

  it('every EXEMPT entry still names a real column (no stale exemptions)', () => {
    const real = new Set(
      referenceColumns().map((c) => `${c.table}.${c.column}`),
    );
    const stale = Object.keys(EXEMPT)
      .filter((k) => !real.has(k))
      .sort();
    expect(stale).toEqual([]);
  });
});
