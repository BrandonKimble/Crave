import {
  assertNoOverbroadDeleteScope,
  deleteScopeContradictions,
} from './person-data-scope';

/**
 * THE LOUD-FAIL GUARD FOR F7500 (D118).
 *
 * `subjectRows` ORs every person-bearing column of a table — correct for
 * access/export, WRONG when the OR is handed to a DELETE, because a DELETE
 * destroys the whole row. Two consumers do exactly that (the eraser's
 * `delete_row` branch and the retention sweep's horizon DELETE), so a column
 * the declaration says SURVIVES is silently deleted whenever it shares a table
 * with a delete verb.
 *
 * The correct fix — scoping each DELETE by the columns whose disposition IS the
 * verb — CHANGES what an erasure does to real user data on a legal-compliance
 * surface, so it is the owner's ruling (escalated). Approved NOW as engineering
 * is this guard: it makes the silent over-deletion a fact anything can assert
 * on. It goes RED on the live declaration today, naming both live instances.
 *
 * This is the NON-PRODUCTION assertion path. Whether the LIVE erase/sweep path
 * should additionally throw (fail-closed) or log-and-continue (fail-open) is
 * the compliance decision left to the owner; nothing here wires it into the
 * running sweep.
 */
describe('person-data: DELETE scope must not erase surviving columns (F7500)', () => {
  it('DETECTS both live over-deletions, named, and nothing else', () => {
    const contradictions = deleteScopeContradictions();

    // The erasure delete_row scope on user_list_collaborators ORs
    // invited_by_user_id, whose ruling is: "the invite survives on someone
    // else's list; who sent it does not."
    expect(contradictions).toContainEqual({
      scope: 'erasure',
      table: 'user_list_collaborators',
      onBehalfOf: 'user_list_collaborators.user_id',
      offendingColumn: 'invited_by_user_id',
      offendingDisposition: 'sever',
    });

    // The 2555-day horizon sweep for user_reports.reported_user_id ORs
    // reporter_user_id (anonymized_by_shell), deleting the safety record about
    // a still-live third party at a horizon that was never its own.
    expect(contradictions).toContainEqual({
      scope: 'retention-horizon',
      table: 'user_reports',
      onBehalfOf: 'user_reports.reported_user_id',
      offendingColumn: 'reporter_user_id',
      offendingDisposition: 'anonymized_by_shell',
    });

    // Exactly those two — a wider net would mean the detector is flagging
    // correct scopes (e.g. user_blocks, which is correct today because the
    // erasure path passes includeRetained:false).
    expect(contradictions).toHaveLength(2);
  });

  it('THROWS on the live declaration, naming both offending columns', () => {
    // The guard is fail-closed WHERE it runs (this proof, and any dev/startup
    // check that calls it). It throws until the semantics land.
    expect(() => assertNoOverbroadDeleteScope()).toThrow(
      /user_list_collaborators\.invited_by_user_id/,
    );
    expect(() => assertNoOverbroadDeleteScope()).toThrow(
      /user_reports\.reporter_user_id/,
    );
  });
});
