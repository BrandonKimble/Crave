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
 * be a different kind of wrong — and collapsing them is exactly what caused the
 * defect this file's second rederivation (D146) repairs:
 *
 *   ruleWhere(rule)      — "where does THIS rule act?"       (erasure)
 *   retentionWhere(rule) — "where does THIS horizon act?"    (retention sweep)
 *   subjectRows(table)   — "which rows NAME this person?"    (access/export)
 *
 * `ruleWhere` USED TO BE a thin reading of `subjectRows`, on the argument that
 * one question deserves one answer. That argument was right about the question
 * and wrong about which question each caller was asking. `subjectRows` ORs
 * EVERY person-bearing column of a table, because for an EXPORT every naming
 * role is the person's ("every row that names me" is precisely a subject-access
 * response). Handed to a DELETE, that same OR destroys rows the declaration
 * said survive:
 *
 *   - erasing person A ran `DELETE FROM user_list_collaborators
 *     WHERE user_id = A OR invited_by_user_id = A`, wiping THIRD PARTIES'
 *     memberships from other people's lists — while `invited_by_user_id` is
 *     declared `sever` ("the invite survives; who sent it does not").
 *   - the 2555-day horizon sweep for `user_reports.reported_user_id` ORed
 *     `reporter_user_id`, deleting a departed reporter's safety records ABOUT
 *     still-live third parties, at a horizon that was never theirs.
 *
 * SO ERASURE AND RETENTION ARE PER-COLUMN NOW. A `delete_row` rule on column C
 * deletes only `WHERE C = subject`; a retained horizon on column C deletes only
 * `WHERE C = subject AND horizon passed`. A column where the person is merely
 * REFERENCED follows its own declared disposition — `sever` nulls that column,
 * `retain` leaves it, `anonymized_by_shell` does nothing row-level. The
 * declaration already said all of this per column; the compiler now obeys it
 * instead of flattening it into an OR.
 *
 * `user_blocks` shows why the questions differ even without the defect: erasure
 * deletes rows where the person is the BLOCKER and retains rows where they are
 * the BLOCKED (a block protects whoever placed it and must outlive the blocked
 * account). But BOTH kinds of row are about them, so a subject-access request
 * covers both. One function answering both questions would have to be wrong
 * about one of them.
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
 * THE TABLE'S DECLARED JOIN, if it has one — with the two contradictions that
 * would let authoring order decide, refused rather than resolved.
 *
 * Shared by every scope builder, so a table that reaches its person through a
 * join answers the same way to erasure, retention and export. It used to live
 * inside `subjectRows`, which meant the erasure path only saw these guards by
 * going THROUGH the export scope — the coupling that produced the over-deletion.
 */
function declaredScope(table: string): string | null {
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
  if (declared.length === 0) return null;

  // A DECLARED SCOPE AND A PERSON KEY ARE TWO ANSWERS TO ONE QUESTION.
  //
  // If the table reaches its person through a join, no column on it locates
  // them directly — saying both is a contradiction, and the declared scope
  // would silently mask the key. That masking is not hypothetical: it made
  // re-introducing the original taste-profile bug (scope actor_id by user id)
  // pass every test, because the sibling rule still carried the correct join
  // and answered for the whole table. A guard the defect can hide behind is
  // not a guard.
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

/** Columns declared to IDENTIFY the person in this table. */
function personKeyColumns(table: string): string[] {
  return [
    ...new Set(
      PERSON_DATA_RULES.filter((r) => r.table === table && r.personKey).map(
        (r) => r.column,
      ),
    ),
  ];
}

/** The disposition declared for one (table, column), if any. */
function dispositionOf(
  table: string,
  column: string,
): PersonDataDisposition | undefined {
  return PERSON_DATA_RULES.find((r) => r.table === table && r.column === column)
    ?.disposition;
}

/**
 * WHICH COLUMNS DOES THIS RULE'S STATEMENT SCOPE BY? The one derivation both
 * the SQL builder and the over-reach guard read.
 *
 * They must read the SAME list, or the guard becomes a second opinion about
 * what the statement does — the re-derivation drift this file exists to end,
 * committed by the guard itself. Building the predicate FROM this list means a
 * change that widens the scope (say, back to `subjectRows`' OR-of-everything)
 * widens the guard's view in the same edit, and the guard goes RED.
 *
 * Returns null when the rule reaches its person through a DECLARED join (no
 * per-column OR exists then) or acts on nothing at all.
 */
export function eraseScopeColumns(rule: PersonDataRule): string[] | null {
  if (!ACTING.has(rule.disposition)) return null;
  if (rule.personScopeSql || declaredScope(rule.table)) return null;

  // PER COLUMN. A column declared to IDENTIFY the person in this table is the
  // column its own rule acts through — `delete_row` deletes the rows where IT
  // holds the subject, `sever` nulls IT where it holds the subject. Nothing
  // else on the table is ORed in, because the other columns carry their own
  // dispositions and those dispositions are what governs them.
  if (rule.personKey) return [rule.column];

  // A NON-KEY COLUMN DOES NOT LOCATE ANYBODY, so it cannot scope by itself.
  //  - `delete_row`: the row is already removed by the key's own statement; a
  //    second DELETE would be a duplicate, and scoping BY this column would
  //    compare a user id to `residue_text`. Nothing to do.
  //  - `null_column`: it names a VALUE to destroy on the person's own rows
  //    (`users.auth_provider_user_id`, `signal_actors.device_key`), so the
  //    table's person key locates them.
  //  - `sever` is only ever declared on a locating column (severing a
  //    non-locating one would be a `null_column`), so it never lands here.
  if (rule.disposition === 'delete_row') return null;
  const keys = personKeyColumns(rule.table);
  return keys.length > 0 ? keys : null;
}

/**
 * WHERE DOES A RULE ACT?
 *
 * On the rows THIS column makes the person's — not on every row of the table
 * that happens to name them. See the file header: reading the export scope here
 * is what made erasing an inviter destroy other people's list memberships.
 *
 * A rule's own `personScopeSql` (or its table's declared join) still wins: the
 * taste profile reaches its person through `signal_actors`, and there is no
 * column on it to scope by.
 *
 * Returns null for rules that do not act on rows, and for a classify-only
 * column whose table locates the person elsewhere. Null means "nothing to do",
 * never "no filter".
 */
export function ruleWhere(rule: PersonDataRule): string | null {
  if (!ACTING.has(rule.disposition)) return null;

  const joined = rule.personScopeSql ?? declaredScope(rule.table);
  const scope =
    joined ??
    eraseScopeColumns(rule)
      ?.map((c) => eq(c))
      .join(' OR ');
  if (!scope) return null;

  return rule.rowPredicate ? `(${scope}) AND (${rule.rowPredicate})` : scope;
}

/**
 * WHICH COLUMNS DOES THIS HORIZON'S DELETE SCOPE BY? Same contract as
 * `eraseScopeColumns`, for the retention sweep.
 *
 * A retained column IS the column whose retention is being enforced: the
 * 2555-day promise on `user_reports.reported_user_id` is a promise about the
 * rows that REPORT that person, and nothing else. Scoping the sweep by the
 * table's whole person-OR is what let a departed reporter's purge delete
 * safety records about live third parties.
 */
export function retentionScopeColumns(rule: PersonDataRule): string[] | null {
  if (rule.disposition !== 'retain' || typeof rule.horizon !== 'number') {
    return null;
  }
  if (rule.personScopeSql || declaredScope(rule.table)) return null;

  // A COLUMN-UNIT HORIZON DOES NOT LOCATE ANYBODY — exactly the case
  // `eraseScopeColumns` already handles for `null_column`. The promise is
  // about a VALUE (`users.stripe_customer_id`), so the value cannot also be
  // the address: `WHERE stripe_customer_id = <a user id>` compares a Stripe
  // handle to a uuid and matches nothing. The table's declared person key is
  // what finds the row; the UPDATE then nulls this column on it.
  if (rule.horizonUnit === 'column') {
    const keys = personKeyColumns(rule.table);
    return keys.length > 0 ? keys : null;
  }
  return [rule.column];
}

/**
 * WHAT A BOUNDED HORIZON DOES WHEN IT EXPIRES — the one derivation the sweep
 * and its guard both read.
 *
 * Returns null for rules with no bounded horizon (nothing expires) and for a
 * `'column'` rule on a table that declares no person key (nothing to scope by
 * — "nothing to do", never "no filter").
 */
export function retentionAction(
  rule: PersonDataRule,
): 'delete_row' | 'null_column' | null {
  if (rule.disposition !== 'retain' || typeof rule.horizon !== 'number') {
    return null;
  }
  if (retentionWhere(rule) === null) return null;
  return rule.horizonUnit === 'column' ? 'null_column' : 'delete_row';
}

/**
 * The horizon sweep's predicate for one retained rule.
 *
 * `alias` is not decoration: the sweep JOINs the table to `users`, and both
 * carry a `user_id`, so an unqualified predicate makes Postgres refuse the
 * query outright ("column reference user_id is ambiguous").
 */
export function retentionWhere(
  rule: PersonDataRule,
  alias?: string,
): string | null {
  if (rule.disposition !== 'retain' || typeof rule.horizon !== 'number') {
    return null;
  }
  const joined = rule.personScopeSql ?? declaredScope(rule.table);
  const scope =
    joined ??
    retentionScopeColumns(rule)
      ?.map((c) => eq(c, alias))
      .join(' OR ');
  if (!scope) return null;
  // A `retain` rule cannot carry a rowPredicate — the union forbids it, which
  // is why this reads through a widened view rather than the narrowed one.
  // Keeping the clause means a future retention that DOES want to narrow gets
  // it by declaring the field, not by editing this function.
  const predicate = (rule as { rowPredicate?: string }).rowPredicate;
  return predicate ? `(${scope}) AND (${predicate})` : scope;
}

/**
 * WHICH ROWS OF THIS TABLE NAME THIS PERSON? — THE EXPORT SCOPE, AND ONLY THAT.
 *
 * The OR of every person-bearing column, because a person can appear in one
 * table in several roles: both sides of a follow, both sides of a collaborator
 * invite, both sides of a block. Their data is every row naming them, and a
 * subject-access response that omitted the rows where they are the RECIPIENT
 * would be a false statement about what we hold.
 *
 * NEVER HAND THIS TO A DELETE. That is the F7500/D118 defect: a DELETE destroys
 * the whole row, so an OR that is exactly right for "show me everything about
 * me" removes rows the declaration keeps for somebody else. Erasure uses
 * `ruleWhere`, retention uses `retentionWhere`, and both are per-column;
 * `assertNoOverbroadDeleteScope` fails the sweep if that ever regresses.
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

  const declared = declaredScope(table);
  if (declared) return declared;

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
 * Private, deliberately. It was exported so the over-reach guard could inspect
 * what an erasure DELETE would reach — back when erasure WAS the export scope.
 * Now that the DELETE scopes are per-column, a guard reading this would be
 * reading the wrong function: it must read `eraseScopeColumns` /
 * `retentionScopeColumns`, the exact lists the statements are built from.
 * Returns `[]` when the table reaches its person through a DECLARED scope (a
 * join): there is no per-column OR then, so nothing to widen.
 */
function personNamingRules(
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
 * A COLUMN SCOPED INTO A ROW-DELETE WHOSE DISPOSITION SAYS THE ROW SURVIVES.
 *
 * THE DEFECT THIS WATCHES FOR (F7500 / D118, fixed by D146). Erasure and
 * retention used to build their DELETEs from `subjectRows` — the OR of every
 * person-bearing column, which is right for an export and catastrophic for a
 * DELETE, because a DELETE destroys the WHOLE row:
 *
 *   - user_list_collaborators.invited_by_user_id is `sever` ("the invite
 *     survives on someone else's list; who sent it does not") yet was ORed into
 *     the delete_row scope, so erasing the inviter deleted THIRD PARTIES'
 *     memberships on other people's lists.
 *   - user_reports.reporter_user_id is `anonymized_by_shell` yet was ORed into
 *     the 2555-day horizon scope enforcing reported_user_id, so a reporter's
 *     purge deleted the safety record ABOUT a still-live third party.
 *
 * Both are gone: the scopes are per-column now. This is what keeps them gone.
 * It reads `eraseScopeColumns` / `retentionScopeColumns` — the EXACT lists the
 * statements are built from, not a second opinion about them — and reports any
 * scoped column that is not the rule's OWN, or whose declared disposition is
 * not the verb that warrants the deletion. Widening a scope therefore widens
 * this in the same edit, which is what makes it able to show RED: restore the
 * OR and both instances come back by name — and so does any OTHER column the
 * OR drags in, even one that happens to share the warranting verb (F9500: the
 * disposition test alone could not fail on the erasure arm at all).
 *
 * It is wired FAIL-CLOSED into the live `erase()` and the live retention
 * `sweep()` (see `assertNoOverbroadDeleteScope`).
 */
export interface DeleteScopeContradiction {
  /** Which DELETE construction over-reaches. */
  scope: 'erasure' | 'retention-horizon';
  table: string;
  /** The `table.column` rule whose scope this DELETE is (the verb it serves). */
  onBehalfOf: string;
  /** The column wrongly scoped into that DELETE. */
  offendingColumn: string;
  /** Why that column's row was supposed to survive. */
  offendingDisposition: PersonDataDisposition;
  /**
   * WHICH of the two laws the column breaks.
   *
   * `foreign-column` — the DELETE is scoped by a column that is not the rule's
   *   own. This is the per-column law itself (D146), and it is the one that
   *   catches a re-widening EVEN WHEN the extra column happens to share the
   *   warranting disposition — the case the disposition test alone reads as
   *   fine while the statement deletes rows on somebody else's key.
   * `surviving-disposition` — the column IS declared, but under a verb that
   *   keeps the row the DELETE destroys (the two F7500 instances).
   */
  why: 'foreign-column' | 'surviving-disposition';
}

/**
 * THE JUDGEMENT, EXPOSED — one function, no second opinion.
 *
 * `deleteScopeContradictions()` builds the live list by handing this the REAL
 * scope columns; the guard's spec proves it can go red by handing it the OLD
 * (export-OR) columns. Both therefore ask the same function the same question,
 * which is the point: a mutation proof that re-implements the judgement is
 * proving its own copy, not the guard (F9501).
 *
 * TWO LAWS, and a column breaking either is reported:
 *
 *   1. PER-COLUMN. A rule's statement scopes by the rule's OWN column and
 *      nothing else. Any other column in the scope means the statement acts on
 *      rows located by somebody else's key.
 *   2. WARRANTED VERB. That column must itself be declared under the verb that
 *      warrants the deletion (`delete_row` for erasure, `retain` for a bounded
 *      horizon). An UNDECLARED column is the worse case, not a pass: nobody has
 *      said what happens to it and the DELETE is already acting.
 *
 * Law 1 is what makes this arm able to fail at all. Checking only law 2 on the
 * ERASURE arm was a tautology (F9500): `eraseScopeColumns` returns the rule's
 * own column, and that arm only runs when the rule is already `delete_row`, so
 * the disposition compared was the rule's own by construction — a guard that
 * could not go red no matter how the compiler drifted.
 */
export function scopeContradictionsFor(
  scope: 'erasure' | 'retention-horizon',
  rule: PersonDataRule,
  columns: string[] | null,
): DeleteScopeContradiction[] {
  const warranted: PersonDataDisposition =
    scope === 'erasure' ? 'delete_row' : 'retain';
  const out: DeleteScopeContradiction[] = [];
  for (const column of columns ?? []) {
    const disposition = dispositionOf(rule.table, column);
    const why =
      column !== rule.column
        ? ('foreign-column' as const)
        : disposition !== warranted
          ? ('surviving-disposition' as const)
          : null;
    if (!why) continue;
    out.push({
      scope,
      table: rule.table,
      onBehalfOf: `${rule.table}.${rule.column}`,
      offendingColumn: column,
      offendingDisposition: disposition ?? ('undeclared' as never),
      why,
    });
  }
  return out;
}

export function deleteScopeContradictions(): DeleteScopeContradiction[] {
  const out: DeleteScopeContradiction[] = [];

  const check = (
    scope: 'erasure' | 'retention-horizon',
    rule: PersonDataRule,
    columns: string[] | null,
  ) => {
    out.push(...scopeContradictionsFor(scope, rule, columns));
  };

  for (const rule of PERSON_DATA_RULES) {
    // 1. ERASURE — a `delete_row` rule's DELETE may only be scoped by the
    //    rule's OWN column, which must itself be `delete_row`.
    if (rule.disposition === 'delete_row') {
      check('erasure', rule, eraseScopeColumns(rule));
    }
    // 2. RETENTION HORIZON — a bounded `retain` rule's DELETE may only be
    //    scoped by columns that are themselves `retain`. Any other column names
    //    a row governed by a different fate, deleted at a horizon never its own.
    //
    //    ONLY FOR `horizonUnit: 'row'`. This guard is about a DELETE destroying
    //    the whole row; a `'column'` horizon issues an UPDATE that nulls one
    //    declared column and destroys no row at all, so running this check on
    //    it would be asking a question the statement does not raise — and
    //    would red on `users.user_id` (the scope key, correctly `retain`) for
    //    a statement that deletes nothing.
    if (
      rule.disposition === 'retain' &&
      typeof rule.horizon === 'number' &&
      rule.horizonUnit !== 'column'
    ) {
      check('retention-horizon', rule, retentionScopeColumns(rule));
    }
  }

  return out;
}

/**
 * THE LOUD-FAIL GUARD (F7500 / D118 / D146). Throws if any DELETE scope would
 * reach a surviving-data column, naming every offending (table, column).
 *
 * FAIL-CLOSED, ON THE LIVE PATH. `erase()` and the retention `sweep()` both
 * call it before their first statement, so the over-deletion cannot run at all
 * — the alternative (log and continue) would mean noticing third-party data
 * loss in a log after destroying it, on the one surface where the damage is
 * irreversible and reportable. It is a pure function of the declaration, so it
 * cannot fail intermittently: it is red for everybody or nobody, at the first
 * erasure after the bad edit, with the offending columns named.
 */
export function assertNoOverbroadDeleteScope(): void {
  const contradictions = deleteScopeContradictions();
  if (contradictions.length === 0) return;
  const lines = contradictions.map(
    (c) =>
      `  [${c.scope}] ${c.onBehalfOf}: DELETE scope reaches ` +
      `${c.table}.${c.offendingColumn} (${c.offendingDisposition}) — ` +
      (c.why === 'foreign-column'
        ? 'that is not this rule’s own column, so the statement acts on rows ' +
          'located by somebody else’s key.'
        : 'that row was declared to SURVIVE, and the delete destroys it.'),
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
