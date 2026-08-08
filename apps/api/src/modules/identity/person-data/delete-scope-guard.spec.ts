import { PERSON_DATA_RULES } from './person-data-class';
import {
  assertNoOverbroadDeleteScope,
  deleteScopeContradictions,
  eraseScopeColumns,
  retentionScopeColumns,
  ruleWhere,
  scopeContradictionsFor,
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

  it('MUTATION (F9500): a foreign scope column reds even when it shares the verb', () => {
    // THE ARM THAT COULD NOT FAIL. The erasure check used to ask ONLY "is this
    // scoped column declared `delete_row`?" — of a list that is the rule's own
    // column, produced by a branch that only runs when the rule is already
    // `delete_row`. A tautology: no drift in the compiler could make it red.
    //
    // `user_follows` is the proof. BOTH its person columns are `delete_row`,
    // so widening the erasure scope back to the table's OR was invisible to the
    // disposition test — while the statement for the FOLLOWER rule would then
    // also delete rows located by `following_user_id`, other people's follows
    // toward this person, on a key that is not this rule's. The per-column law
    // names it.
    const follower = PERSON_DATA_RULES.find(
      (r) => r.table === 'user_follows' && r.column === 'follower_user_id',
    )!;
    // Live scope: the rule's own column, and clean.
    expect(eraseScopeColumns(follower)).toEqual(['follower_user_id']);
    expect(
      scopeContradictionsFor('erasure', follower, ['follower_user_id']),
    ).toEqual([]);
    // Widened scope (the OR): red, by name, with the reason.
    const widened = scopeContradictionsFor('erasure', follower, [
      'follower_user_id',
      'following_user_id',
    ]);
    expect(widened.map((c) => [c.offendingColumn, c.why])).toEqual([
      ['following_user_id', 'foreign-column'],
    ]);
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
    // WHY THIS IS THE MUTATION AND NOT A RE-DERIVATION (F9501). The columns
    // below are read out of the REAL `subjectRows` SQL — the very string the
    // two DELETEs used to be built from — and handed to `scopeContradictionsFor`,
    // THE FUNCTION `deleteScopeContradictions()` ITSELF CALLS. This spec used to
    // re-implement that judgement inline, which proved its own copy rather than
    // the guard: the copy would have stayed green through any drift in the real
    // one. Now the only difference between green and red is which scope columns
    // go in, which is exactly the variable under test.
    const scopeColumns = (sql: string) => [
      ...new Set(
        [...sql.matchAll(/"([a-z_]+)"::text = \$1/g)].map((m) => m[1]),
      ),
    ];
    const ruleFor = (table: string, column: string) =>
      PERSON_DATA_RULES.find((r) => r.table === table && r.column === column)!;

    // The erasure instance: the OR reaches `invited_by_user_id` (sever), whose
    // row the declaration KEEPS — that is the third party's membership.
    const collaboratorOr = subjectRows('user_list_collaborators', {
      includeRetained: false,
    })!;
    expect(
      scopeContradictionsFor(
        'erasure',
        ruleFor('user_list_collaborators', 'user_id'),
        scopeColumns(collaboratorOr),
      ).map((c) => c.offendingColumn),
    ).toEqual(['invited_by_user_id']);

    // The retention instance: the OR reaches `reporter_user_id`
    // (anonymized_by_shell) at a horizon that was never its own.
    const reportsOr = subjectRows('user_reports', {
      includeRetained: true,
      alias: 't',
    })!;
    expect(
      scopeContradictionsFor(
        'retention-horizon',
        ruleFor('user_reports', 'reported_user_id'),
        scopeColumns(reportsOr),
      ).map((c) => c.offendingColumn),
    ).toEqual(['reporter_user_id']);

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
