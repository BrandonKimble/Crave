import { PERSON_DATA_RULES } from './person-data-class';
import {
  assertNoOverbroadDeleteScope,
  deleteScopeContradictions,
  eraseScopeColumns,
  retentionScopeColumns,
  ruleWhere,
  retentionWhere,
  subjectRows,
} from './person-data-scope';

/**
 * THE GUARD FOR F7500 / D118, NOW GREEN BY CONSTRUCTION (D146).
 *
 * The defect: erasure and the retention sweep built their DELETEs from
 * `subjectRows` — the OR of every person-bearing column of a table. That OR is
 * exactly right for an EXPORT ("every row that names me") and catastrophic for
 * a DELETE, because a DELETE destroys the WHOLE row. Two live instances:
 * erasing an inviter deleted third parties' list memberships, and a departed
 * reporter's horizon sweep deleted safety records about still-live third
 * parties.
 *
 * Both scopes are PER-COLUMN now, so the contradiction list is empty. An empty
 * list is worth nothing unless it can be made non-empty, so the last test
 * MUTATES the compiler back to the OR and proves both instances return, by
 * name. That mutation is the reason to believe the green.
 */
describe('person-data: DELETE scope must not erase surviving columns (F7500/D146)', () => {
  it('has NO contradictions on the live declaration', () => {
    expect(deleteScopeContradictions()).toEqual([]);
    expect(() => assertNoOverbroadDeleteScope()).not.toThrow();
  });

  it('the two live over-deletions are gone, named', () => {
    // Erasing a person deletes the collaborator rows that are THEIRS, and only
    // those. `invited_by_user_id` is `sever` — the invite survives on someone
    // else's list, minus who made it — so it must not appear in the DELETE.
    const collaborator = PERSON_DATA_RULES.find(
      (r) => r.table === 'user_list_collaborators' && r.column === 'user_id',
    )!;
    expect(eraseScopeColumns(collaborator)).toEqual(['user_id']);
    expect(ruleWhere(collaborator)).not.toContain('invited_by_user_id');

    // The 2555-day horizon on `reported_user_id` is a promise about the rows
    // reporting THAT person. `reporter_user_id` is a different person under a
    // different disposition, at a horizon that was never its own.
    const reported = PERSON_DATA_RULES.find(
      (r) => r.table === 'user_reports' && r.column === 'reported_user_id',
    )!;
    expect(retentionScopeColumns(reported)).toEqual(['reported_user_id']);
    expect(retentionWhere(reported, 't')).not.toContain('reporter_user_id');
  });

  it('EXPORT keeps the OR — the question it answers is the other one', () => {
    // The split is the whole design: a subject-access response that omitted the
    // rows where the person is the INVITER (or the blocked, or the followed)
    // would be a false statement about what we hold. Same table, same person,
    // opposite correct answers — which is why one function cannot serve both.
    const or = subjectRows('user_list_collaborators', {
      includeRetained: false,
    })!;
    expect(or).toContain('user_id');
    expect(or).toContain('invited_by_user_id');
  });

  it('MUTATION: the export OR, handed to these DELETEs, is still both defects', () => {
    // WHY THIS IS THE MUTATION AND NOT A RE-DERIVATION. The columns below are
    // read out of the REAL `subjectRows` SQL — the very string the two DELETEs
    // used to be built from — and judged by the same rule the guard applies:
    // a scope column whose disposition is not the verb warranting the delete is
    // a contradiction. So this asks the guard's own question of the OLD scope
    // and gets the old, red answer, while the live scopes above answer green.
    // If someone reverts `ruleWhere`/`retentionWhere` to `subjectRows`, these
    // are exactly the two rows `deleteScopeContradictions()` reports again.
    const scopeColumns = (sql: string) => [
      ...new Set(
        [...sql.matchAll(/"([a-z_]+)"::text = \$1/g)].map((m) => m[1]),
      ),
    ];

    const offenders = (table: string, warranted: string, sql: string) =>
      scopeColumns(sql).filter(
        (column) =>
          PERSON_DATA_RULES.find(
            (r) => r.table === table && r.column === column,
          )?.disposition !== warranted,
      );

    // The erasure instance: the OR reaches `invited_by_user_id` (sever), whose
    // row the declaration KEEPS — that is the third party's membership.
    const collaboratorOr = subjectRows('user_list_collaborators', {
      includeRetained: false,
    })!;
    expect(
      offenders('user_list_collaborators', 'delete_row', collaboratorOr),
    ).toEqual(['invited_by_user_id']);

    // The retention instance: the OR reaches `reporter_user_id`
    // (anonymized_by_shell) at a horizon that was never its own.
    const reportsOr = subjectRows('user_reports', {
      includeRetained: true,
      alias: 't',
    })!;
    expect(offenders('user_reports', 'retain', reportsOr)).toEqual([
      'reporter_user_id',
    ]);

    // And the live scopes contain NEITHER — the delta this design is.
    expect(scopeColumns(collaboratorOr).length).toBeGreaterThan(1);
    expect(
      scopeColumns(
        ruleWhere(
          PERSON_DATA_RULES.find(
            (r) =>
              r.table === 'user_list_collaborators' && r.column === 'user_id',
          )!,
        )!,
      ),
    ).toEqual(['user_id']);
  });
});
