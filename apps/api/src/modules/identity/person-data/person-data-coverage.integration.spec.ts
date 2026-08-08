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
 * question is answerable vacuously. It is: **for each rule, does the compiled
 * predicate really run against the live schema, and which rules does the
 * corpus in front of us actually exercise?** The first is the verdict; the
 * second is the census the reader gets to see.
 *
 * UNPROVEN IS NOT CLEAN — AND "PROVEN" MOVED (F9981). This ledger used to
 * ASSERT that every rule is exercised by real rows unless a human had excused
 * it by name. That assertion is a statement about the database, not about the
 * code: the same rules were exercised on a laptop with a corpus, dark on CI's
 * freshly migrated database, and the excuse list ("no collaborators in the dev
 * corpus", "672 lists, all editorial") was a snapshot of one machine that went
 * stale the moment anyone else ran it. A verdict must not change with the
 * environment that computes it.
 *
 * The proof it was standing in for now lives where it belongs: the
 * seed-and-erase proof MINTS a row for every acting rule and shows the rule
 * acts on it, on any database, with nothing pinned. So what remains here is
 * the part that is genuinely about the code — every rule's predicate is REAL
 * SQL that the live schema accepts and executes — plus a corpus CENSUS that is
 * reported for the reader rather than asserted against.
 */

describe('person-data coverage — every rule can be shown to act', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * EVERY RULE'S PREDICATE RUNS. The assertion is that the compiled scope is
   * SQL the live schema accepts — a renamed column, a dropped table, a join
   * the compiler builds wrong all fail here, on any database. The count of
   * rules the CORPUS exercises is reported alongside, because it is worth
   * knowing (a rule dark in production is either dead code or a feature nobody
   * uses) but it is an observation about the data, so it is never the verdict.
   */
  it('every rule compiles to a predicate the database will execute', async () => {
    const acting = PERSON_DATA_RULES.filter((r) => ruleWhere(r) !== null);
    expect(acting.length).toBeGreaterThan(10);

    const dark: string[] = [];
    let executed = 0;
    let exercised = 0;

    for (const rule of acting) {
      const key = `${rule.table}.${rule.column}`;
      const where = ruleWhere(rule)!;
      // "Does ANY user select rows here?" — asked as one query rather than
      // per-user, so the corpus answers as a whole. The query RUNNING is the
      // claim; what it returns is the census.
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
      executed += 1;
      if (row.n > 0) exercised += 1;
      else dark.push(key);
    }

    // The census is the point of the ledger; printing it keeps the reader
    // informed without letting the corpus decide whether the suite passes.
    console.log(
      `[person-data coverage] ${exercised}/${acting.length} rules exercised by this corpus; dark: ${dark.join(', ') || 'none'}`,
    );
    expect({ executed }).toEqual({ executed: acting.length });
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
