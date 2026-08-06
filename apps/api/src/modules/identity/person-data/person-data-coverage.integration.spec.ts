import { PrismaClient } from '@prisma/client';
import { PERSON_DATA_RULES } from './person-data-class';
import { ruleWhere, subjectRows, declaredTables } from './person-data-scope';

/**
 * THE COVERAGE LEDGER — a rule nobody can prove ever acts is not a rule.
 *
 * WHY THIS SHAPE, rather than more assertions about specific tables.
 *
 * Every erasure defect so far was invisible for the SAME reason: the thing
 * that should have caught it could not tell "correct" from "matched nothing".
 *
 *   - the live erasure proof sweeps every uuid column for the departing user's
 *     id. `user_taste_profile` does not contain that id — it holds the signals
 *     pseudonym — so the sweep passed while the profile survived forever.
 *   - a data check over that table reports clean because it is EMPTY in dev.
 *   - the eraser reports `applied: {}` for a rule that deleted nothing, which
 *     is indistinguishable from a person who simply had no rows.
 *
 * So the question this asks is not "did erasure work for user X" — that
 * question is answerable vacuously. It is: **for each rule, does a person
 * exist in this corpus for whom the rule's predicate selects rows?** A rule
 * that selects nothing for ANYBODY is either dead or broken, and both need a
 * human to say which.
 *
 * That catches the taste-profile class WITHOUT anyone knowing about
 * pseudonyms: the predicate simply never matches, so the rule is unproven and
 * the ledger says so.
 *
 * UNPROVEN IS NOT CLEAN. A rule with no live data must be declared below with
 * a reason. Silence is converted into a decision — the same doctrine as the
 * scope allowlist and the subject-text scanner.
 */

/**
 * Rules the corpus cannot exercise, each with why. These are the ones a human
 * has vouched for; everything else must prove itself against real rows.
 */
const UNEXERCISED: Record<string, string> = {
  // Every entry below is proven CORRECT by person-data-erasure-proof
  // (seed a row the person owns, erase, assert it is gone). What this ledger
  // adds is a different question: does REAL data exercise it? On a corpus with
  // users these will light up; a rule that stays dark in PRODUCTION is either
  // dead code or a feature nobody uses, and that is worth knowing separately
  // from whether the predicate is right.
  'user_list_collaborators.user_id': 'No collaborators in the dev corpus.',
  'user_list_collaborators.invited_by_user_id': 'No invites in the dev corpus.',
  'poll_creation_attempts.user_id': 'No user-created polls in the dev corpus.',
  'collection_on_demand_unsegmented_residue.user_id':
    'Rows exist but user_id is null on all of them (pre-dates the column).',
  'notification_devices.user_id': 'No push registrations in the dev corpus.',
  'poll_topics.created_by_user_id':
    '18k topics, all seeded — created_by is null on every one.',
  'curated_lists.owner_user_id':
    '672 lists, all global editorial — owner is null on every one.',
  'user_taste_profile.actor_id':
    'Table is empty in dev. THE rule that was broken; correctness is proven by the seed-and-erase proof, which is why that proof had to exist.',
  'user_taste_profile.subject_text': 'Same empty table.',
  'user_blocks.blocker_user_id': 'No blocks in the dev corpus.',
};

describe('person-data coverage — every rule can be shown to act', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * The ledger. Reported in full (not just failures) so the reader can see
   * what the corpus actually covers rather than trusting a green tick.
   */
  it('reports, per rule, whether any person in the corpus exercises it', async () => {
    const acting = PERSON_DATA_RULES.filter((r) => ruleWhere(r) !== null);
    expect(acting.length).toBeGreaterThan(10);

    const unexercised: string[] = [];
    let exercised = 0;

    for (const rule of acting) {
      const key = `${rule.table}.${rule.column}`;
      const where = ruleWhere(rule)!;
      // "Does ANY user select rows here?" — asked as one query rather than
      // per-user, so the corpus answers as a whole.
      const [row] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM (
           SELECT 1 FROM users u
           WHERE EXISTS (
             SELECT 1 FROM "${rule.table}"
             WHERE ${where.replace(/\$1/g, 'u.user_id::text')}
           )
           LIMIT 1
         ) probe`,
      );
      if (row.n > 0) exercised += 1;
      else if (!UNEXERCISED[key]) unexercised.push(key);
    }

    // The ledger must be doing real work — if nothing is exercised, this has
    // degenerated into reading the allowlist back to itself.
    expect(exercised).toBeGreaterThan(0);
    expect({ unexercised, exercised }).toEqual({
      unexercised: [],
      exercised,
    });
  });

  /**
   * THE INDEPENDENT NET. The erasure proof sweeps for the user's ID; this
   * sweeps by the DECLARATION's own reachability. They fail differently: the
   * id-sweep is blind to tables that never hold the id (the taste profile),
   * and this is blind to tables nobody classified (which the census catches).
   * Three nets, three blind spots, no shared one.
   */
  it('every declared table is reachable by the compiler', () => {
    const unreachable = declaredTables().filter((table) => {
      const hasActingRule = PERSON_DATA_RULES.some(
        (r) => r.table === table && ruleWhere(r) !== null,
      );
      const hasSubjectScope =
        subjectRows(table, { includeRetained: true }) !== null;
      return !hasActingRule && !hasSubjectScope;
    });
    // A table the compiler cannot scope is one erasure and access both skip,
    // silently, forever.
    expect(unreachable).toEqual([]);
  });

  /**
   * Erasure and access must agree about WHICH TABLE a person appears in.
   * They ask different questions (act-on vs name), so they may legitimately
   * differ on ROWS — but a table one can reach and the other cannot means one
   * of them has a hole.
   */
  it('the eraser and the exporter cover the same tables', () => {
    const eraserTables = new Set(
      PERSON_DATA_RULES.filter((r) => ruleWhere(r) !== null).map(
        (r) => r.table,
      ),
    );
    const missingFromAccess = [...eraserTables].filter(
      (t) => subjectRows(t, { includeRetained: false }) === null,
    );
    // If erasure destroys something there, access must be able to hand it over
    // first — otherwise we delete data we would have denied ever holding.
    expect(missingFromAccess).toEqual([]);
  });
});
