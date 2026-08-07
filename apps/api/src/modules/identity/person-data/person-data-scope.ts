import {
  PERSON_DATA_RULES,
  type PersonDataDisposition,
  type PersonDataRule,
} from './person-data-class';

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
 *   ruleWhere(rule)    — "where does THIS rule act?"       (erasure)
 *   subjectRows(table) — "which rows NAME this person?"    (access/export)
 *
 * `ruleWhere` is now a thin reading of `subjectRows` rather than a second
 * resolution path — see its doc for why having two was the same disease this
 * file exists to cure, reproduced inside the file.
 *
 * `user_blocks` shows why they differ: erasure deletes rows where the person is
 * the BLOCKER and retains rows where they are the BLOCKED (a block protects
 * whoever placed it and must outlive the blocked account). But BOTH kinds of
 * row are about them, so a subject-access request covers both. One function
 * answering both questions would have to be wrong about one of them.
 */

/** Every disposition that performs a statement — the three the eraser runs. */
const ACTING = new Set(['delete_row', 'sever', 'null_column']);

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
 * WHERE DOES A RULE ACT? The same place every other rule on that table acts.
 *
 * `ruleScope` used to be a SECOND resolution path, with its own precedence
 * (declared -> personKey -> sole-by-elimination), its own classify-only skip,
 * and its own ambiguity throw — while `null_column` went through
 * `subjectRows`. Two answers to one question, which is the exact shape this
 * file was written to end, reproduced inside the file itself.
 *
 * There is one question: which rows of this table are this person's. A rule's
 * own `personScopeSql` overrides it (the taste profile reaches its person
 * through signal_actors); otherwise the table's scope IS the answer. The
 * elimination heuristic is gone — every locating column is declared with
 * `personKey`, so nothing is inferred from how many siblings a rule happens to
 * have.
 *
 * Returns null for rules that do not act on rows, and for a classify-only
 * column whose table locates the person elsewhere. Null means "nothing to do",
 * never "no filter".
 */
export function ruleWhere(rule: PersonDataRule): string | null {
  if (!ACTING.has(rule.disposition)) return null;

  const scope =
    rule.personScopeSql ?? subjectRows(rule.table, { includeRetained: false });
  if (!scope) return null;

  // A classify-only column (it names person data but does not locate a person)
  // defers to its table's key. Acting on it separately would emit a duplicate
  // statement, and scoping BY it would emit a predicate over a non-key column.
  // ONLY `delete_row` defers. A non-key `sever`/`null_column` column is not
  // classify-only: it names a value that must be DESTROYED, located by the
  // table's key — `user_list_collaborators.invited_by_user_id` is exactly
  // that (the invite survives, who sent it does not). Skipping them made a
  // real sever a silent no-op. `delete_row` defers because the row is already
  // removed by the key's own statement; a second DELETE would be a duplicate.
  if (
    rule.disposition === 'delete_row' &&
    !rule.personScopeSql &&
    !rule.personKey
  ) {
    return null;
  }

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
  if (declared.length === 1) {
    // A DECLARED SCOPE AND A PERSON KEY ARE TWO ANSWERS TO ONE QUESTION.
    //
    // If the table reaches its person through a join, no column on it locates
    // them directly — saying both is a contradiction, and the declared scope
    // would silently mask the key. That masking is not hypothetical: it made
    // re-introducing the original taste-profile bug (scope actor_id by user
    // id) pass every test, because the sibling rule still carried the correct
    // join and answered for the whole table. A guard the defect can hide
    // behind is not a guard.
    const alsoKeyed = rules.filter((r) => r.personKey);
    if (alsoKeyed.length > 0) {
      throw new Error(
        `person-data: ${table} declares a personScopeSql AND marks ` +
          `${alsoKeyed.map((r) => r.column).join(', ')} as a person key. The ` +
          `table is reached one way; pick it.`,
      );
    }
    return declared[0];
  }

  const naming = personNamingRules(table, options);
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

/**
 * THE RULES WHOSE COLUMNS `subjectRows` ORs TOGETHER for this table+options.
 *
 * This is the exact set the OR is built from — the columns a scope built here
 * will locate. Exposed as its own function so a guard can inspect what a scope
 * would REACH without re-deriving the filter (the re-derivation-drift this file
 * exists to end). Returns `[]` when the table reaches its person through a
 * DECLARED scope (a join): there is no per-column OR then, so nothing to widen.
 */
export function personNamingRules(
  table: string,
  options: { includeRetained: boolean },
): PersonDataRule[] {
  const rules = PERSON_DATA_RULES.filter((r) => r.table === table);
  // A declared scope replaces the OR entirely (see subjectRows) — no columns
  // are ORed, so this set is empty.
  if (rules.some((r) => r.personScopeSql)) return [];
  return rules.filter((r) => {
    // ONLY COLUMNS THAT LOCATE A PERSON. `residue_text`/`device_key` name
    // person data but do not identify a person; comparing one to a user id
    // matches nothing, so they are never ORed in.
    if (r.personKey) return true;
    // `anonymized_by_shell` NAMES the person — the column keeps pointing at
    // their (anonymized) users row, which is how authorship survives, and how
    // photos stay in the subject-access export.
    if (r.disposition === 'anonymized_by_shell') return true;
    if (options.includeRetained && r.disposition === 'retain') return true;
    return false;
  });
}

/**
 * A COLUMN OR'd INTO A ROW-DELETE SCOPE WHOSE DISPOSITION SAYS THE ROW SURVIVES.
 *
 * `subjectRows` ORs every person-bearing column of a table — correct for
 * access/export, where every naming role is the person's. But two consumers
 * hand that OR to a DELETE:
 *
 *   - the eraser's `delete_row` branch  (subjectRows, includeRetained:false)
 *   - the retention sweep's horizon DELETE (subjectRows, includeRetained:true)
 *
 * and a DELETE destroys the WHOLE row. So when the OR includes a column whose
 * disposition is not the verb that warrants the deletion — a `sever`/
 * `anonymized_by_shell` column on a `delete_row` scope, or any non-`retain`
 * column on a horizon scope — the delete removes rows the declaration said
 * survive. Both live instances are of exactly this shape:
 *
 *   - user_list_collaborators.invited_by_user_id is `sever` ("the invite
 *     survives on someone else's list; who sent it does not") yet is ORed into
 *     the delete_row scope, so erasing the inviter deletes THIRD PARTIES'
 *     memberships on other people's lists.
 *   - user_reports.reporter_user_id is `anonymized_by_shell` yet is ORed into
 *     the 2555-day horizon scope enforcing reported_user_id, so a reporter's
 *     purge deletes the safety record ABOUT a still-live third party.
 *
 * This computes those contradictions from the declaration, so the silent
 * over-deletion is a fact anything can assert on rather than a surprise a
 * regulator finds. It does NOT change what any scope emits — the per-column
 * re-scoping that ends the over-deletion is a change to real user data on a
 * legal-compliance surface, and is the OWNER's ruling to make (see D118 / the
 * escalation on F7500).
 */
export interface DeleteScopeContradiction {
  /** Which DELETE construction over-reaches. */
  scope: 'erasure' | 'retention-horizon';
  table: string;
  /** The `table.column` rule whose scope this DELETE is (the verb it serves). */
  onBehalfOf: string;
  /** The column wrongly ORed into that DELETE. */
  offendingColumn: string;
  /** Why that column's row was supposed to survive. */
  offendingDisposition: PersonDataDisposition;
}

export function deleteScopeContradictions(): DeleteScopeContradiction[] {
  const out: DeleteScopeContradiction[] = [];

  // 1. ERASURE. A `delete_row` rule hands subjectRows(includeRetained:false) to
  //    DELETE. Any ORed column that is not itself `delete_row` names a row the
  //    declaration keeps.
  const deleteRowTables = [
    ...new Set(
      PERSON_DATA_RULES.filter(
        (r) => r.disposition === 'delete_row' && !r.personScopeSql,
      ).map((r) => r.table),
    ),
  ];
  for (const table of deleteRowTables) {
    const key =
      PERSON_DATA_RULES.find(
        (r) =>
          r.table === table && r.disposition === 'delete_row' && r.personKey,
      )?.column ?? '(no declared key)';
    for (const r of personNamingRules(table, { includeRetained: false })) {
      if (r.disposition !== 'delete_row') {
        out.push({
          scope: 'erasure',
          table,
          onBehalfOf: `${table}.${key}`,
          offendingColumn: r.column,
          offendingDisposition: r.disposition,
        });
      }
    }
  }

  // 2. RETENTION HORIZON. A `retain` rule with a numeric horizon hands
  //    subjectRows(includeRetained:true) to a DELETE. Any ORed column that is
  //    not `retain` names a row governed by a different fate, deleted at this
  //    horizon.
  for (const rule of PERSON_DATA_RULES) {
    if (rule.disposition !== 'retain' || typeof rule.horizon !== 'number') {
      continue;
    }
    if (rule.personScopeSql) continue;
    for (const r of personNamingRules(rule.table, { includeRetained: true })) {
      if (r.disposition !== 'retain') {
        out.push({
          scope: 'retention-horizon',
          table: rule.table,
          onBehalfOf: `${rule.table}.${rule.column}`,
          offendingColumn: r.column,
          offendingDisposition: r.disposition,
        });
      }
    }
  }

  return out;
}

/**
 * THE LOUD-FAIL GUARD (D118, F7500). Throws if any DELETE scope would OR in a
 * surviving-data column, naming every offending (table, column). Approved as
 * engineering — it makes the current silent over-deletion impossible to run
 * unnoticed — while the erasure SEMANTICS (per-column re-scoping) stay the
 * owner's ruling. Fail-open vs fail-closed on the LIVE erase/sweep path is a
 * compliance decision escalated to the owner and is NOT wired here; this
 * assertion is the non-production proof (specs + a dev/startup check may call
 * it) that the defect is real and named.
 */
export function assertNoOverbroadDeleteScope(): void {
  const contradictions = deleteScopeContradictions();
  if (contradictions.length === 0) return;
  const lines = contradictions.map(
    (c) =>
      `  [${c.scope}] ${c.onBehalfOf}: DELETE scope ORs ` +
      `${c.table}.${c.offendingColumn} (${c.offendingDisposition}) — that row ` +
      `was declared to SURVIVE, and the delete destroys it.`,
  );
  throw new Error(
    'person-data: a row-DELETE scope would erase columns the declaration keeps ' +
      `(${contradictions.length}). Scope by disposition, not by every person ` +
      `column:\n${lines.join('\n')}`,
  );
}

/** Every table the declaration governs. */
export function declaredTables(): string[] {
  return [...new Set(PERSON_DATA_RULES.map((r) => r.table))];
}
