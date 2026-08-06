import { PERSON_DATA_RULES, type PersonDataRule } from './person-data-class';

/**
 * THE COMPILER: declaration → SQL predicate. One home for "where are this
 * person's rows".
 *
 * WHY THIS EXISTS AT ALL — the class of bug it ends.
 *
 * `PERSON_DATA_RULES` is a good primitive: it states, per column, what happens
 * to a person's data. But it states WHAT, not HOW, and three consumers each
 * re-derived the HOW independently — the eraser (three branches, one per
 * disposition), the exporter, and the scope test. Every single defect found in
 * this area lived in one of those re-derivations, not in the declaration:
 *
 *   - the eraser scoped `delete_row` by the rule's OWN column, which silently
 *     assumes the column holds a user id. `user_taste_profile.actor_id` holds
 *     the signals PSEUDONYM, so the delete matched nothing and the inferred
 *     taste profile survived deletion, permanently.
 *   - `personScopeSql` existed for exactly that case and was honoured by
 *     `null_column` ONLY, so a rule could declare its scope and be ignored.
 *   - the exporter scoped by `rules[0].column` — authoring order — so
 *     `user_follows` would have exported the follows a person MADE and omitted
 *     the ones they RECEIVED.
 *   - `delete_row` is a ROW verb declared per COLUMN, so a table with several
 *     person columns emitted several DELETEs, each scoping by its own column;
 *     only one was ever a key, and the rest matched nothing.
 *
 * Four bugs, one shape: a re-derivation drifting from the declaration with
 * nothing comparing them. Fixing them one at a time leaves the shape intact
 * and the next consumer free to re-derive again. So the derivation happens
 * ONCE, here, and the consumers ask instead of deciding.
 *
 * TWO SCOPES, BECAUSE THERE ARE GENUINELY TWO QUESTIONS. Collapsing them would
 * be a different kind of wrong:
 *
 *   ruleScope(rule)  — "which rows does THIS rule act on?"  (erasure)
 *   subjectRows(table) — "which rows NAME this person?"     (access/export)
 *
 * `user_blocks` shows why they differ: erasure deletes rows where the person is
 * the BLOCKER and retains rows where they are the BLOCKED (a block protects
 * whoever placed it and must outlive the blocked account). But BOTH kinds of
 * row are about them, so a subject-access request covers both. One function
 * answering both questions would have to be wrong about one of them.
 */

/** Dispositions that act on rows, and therefore need a scope. */
const SCOPING = new Set(['delete_row', 'sever']);

/**
 * `::text` ON BOTH SIDES, always.
 *
 * The person key is not one physical type across this schema:
 * `poll_creation_attempts.user_id` is `text`, `notification_devices.user_id`
 * is `varchar(255)`, everything else is `uuid`. A bare comparison raises
 * "operator does not exist: uuid = text" on exactly the two tables holding a
 * device fingerprint and a raw attempt log. Both the eraser and the exporter
 * learned this separately, at different times, from live failures — which is
 * itself the argument for one compiler.
 */
const eq = (column: string, alias?: string) =>
  `${alias ? `${alias}.` : ''}"${column}"::text = $1::text`;

/**
 * WHERE DOES THIS RULE ACT?
 *
 * Precedence, and each step is a declaration rather than a guess:
 *  1. `personScopeSql` — the rule states how to reach the person. Always wins,
 *     for every disposition. (Honouring it for only one disposition is what
 *     let the taste-profile rule declare a scope and be ignored.)
 *  2. `personKey` — this column identifies the person in this table.
 *  3. The rule is the table's ONLY scoping rule, so its column is the key by
 *     elimination — not by name-guessing.
 *
 * Returns null when the rule does not act on rows (`retain`, `not_person`,
 * `anonymized_by_shell`) or when it is a classify-only column on a table whose
 * key is declared elsewhere — the caller must treat null as "nothing to do",
 * never as "no filter".
 */
export function ruleScope(rule: PersonDataRule): string | null {
  if (!SCOPING.has(rule.disposition)) return null;

  if (rule.personScopeSql) {
    return rule.personScopeSql;
  }
  if (rule.personKey) {
    return eq(rule.column);
  }

  const siblings = PERSON_DATA_RULES.filter(
    (r) =>
      r.table === rule.table &&
      r.disposition === rule.disposition &&
      r.column !== rule.column,
  );
  // A table whose key is declared elsewhere: this column classifies, it does
  // not scope. Acting on it would emit a predicate over a non-key column
  // ("delete rows whose residue_text equals this uuid") that matches nothing.
  if (siblings.some((r) => r.personKey || r.personScopeSql)) return null;
  // Sole scoping rule of its disposition on this table — its column is the key
  // by elimination.
  if (siblings.length === 0) {
    return eq(rule.column);
  }
  // Ambiguous: several columns, none declared. Refuse rather than pick one —
  // picking by authoring order is exactly the exporter's old bug.
  throw new Error(
    `person-data: ${rule.table}.${rule.column} (${rule.disposition}) has ` +
      `sibling scoping columns and no declared key. Mark the person key with ` +
      `personKey: true, or declare personScopeSql.`,
  );
}

/** The rule's full WHERE, including its row predicate. */
export function ruleWhere(rule: PersonDataRule): string | null {
  const scope = ruleScope(rule);
  if (!scope) return null;
  return rule.rowPredicate ? `(${scope}) AND (${rule.rowPredicate})` : scope;
}

/**
 * WHICH ROWS OF THIS TABLE NAME THIS PERSON?
 *
 * The OR of every person-bearing column, because a person can appear in one
 * table in several roles: both sides of a follow, both sides of a collaborator
 * invite, both sides of a block. Their data is every row naming them.
 *
 * `includeRetained` is the access-vs-erasure distinction made explicit. A
 * subject-access request covers retained rows too (they are still personal
 * data); an erasure sweep must not touch them.
 */
export function subjectRows(
  table: string,
  options: {
    includeRetained: boolean;
    /**
     * Qualify the columns with this table alias.
     *
     * Without it the predicate names bare columns, which is only unambiguous
     * in a single-table statement. The retention sweep JOINs the table to
     * `users` — and both have a `user_id`, so Postgres refused the query
     * outright ("column reference user_id is ambiguous"). A predicate that
     * cannot survive a join is not a reusable primitive; it is a
     * single-caller helper wearing one's clothes.
     */
    alias?: string;
  },
): string | null {
  const rules = PERSON_DATA_RULES.filter((r) => r.table === table);

  // A DECLARED SCOPE WINS — but only if the table declares ONE.
  //
  // This used to `find` the first rule carrying a scope, which is the same
  // unguarded assumption as the exporter's old `rules[0].column`: it silently
  // picks by authoring order and is right only while nobody disagrees. Two
  // rules on one table declaring DIFFERENT scopes is a contradiction in the
  // declaration, and the honest response is to refuse rather than to resolve
  // it by whichever was typed first.
  const declared = [
    ...new Set(
      rules.map((r) => r.personScopeSql).filter((sql): sql is string => !!sql),
    ),
  ];
  if (declared.length > 1) {
    throw new Error(
      `person-data: ${table} declares ${declared.length} different person ` +
        `scopes. A table has one answer to "which rows are this person's"; ` +
        `reconcile them rather than letting authoring order decide.`,
    );
  }
  if (declared.length === 1) return declared[0];

  const naming = rules.filter((r) => {
    if (r.personKey) return true;
    if (SCOPING.has(r.disposition)) return true;
    // `anonymized_by_shell` NAMES the person — the column keeps pointing at
    // their (anonymized) users row, which is exactly how authorship survives.
    // Omitting it silently dropped `photos` from the subject-access export:
    // the person's own uploaded photos, the most obviously-theirs data in the
    // system. Caught by diffing an export against the previous run, not by
    // reading this list.
    if (r.disposition === 'anonymized_by_shell') return true;
    if (options.includeRetained && r.disposition === 'retain') return true;
    return false;
  });
  if (naming.length === 0) return null;

  const columns = [...new Set(naming.map((r) => r.column))];
  const or = columns.map((c) => eq(c, options.alias)).join(' OR ');

  // ROW PREDICATES NARROW WHAT IS THEIRS, so they belong here rather than in
  // each caller. `curated_lists` is the case: a list is the person's only when
  // `scope = 'personal'` — the global editorial lists share the table and are
  // nobody's. Dropping the predicate here would have made the exporter and the
  // eraser disagree about the same table, which is the whole failure mode this
  // file exists to prevent.
  const predicate = rules.find((r) => r.rowPredicate)?.rowPredicate;
  return predicate ? `(${or}) AND (${predicate})` : or;
}

/** Every table the declaration governs. */
export function declaredTables(): string[] {
  return [...new Set(PERSON_DATA_RULES.map((r) => r.table))];
}
