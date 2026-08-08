import { PrismaClient } from '@prisma/client';
import { PERSON_DATA_RULES } from './person-data-class';
import { PersonDataExportService } from './person-data-export.service';
import { subjectRows } from './person-data-scope';

/**
 * THE EXPORT MUST NOT HAND OVER THE COLUMNS IT SAYS IT WITHHELD (F9502).
 *
 * THE DEFECT. Exclusions were computed per COLUMN and the query was `SELECT *`
 * per TABLE. So a subject-access archive shipped `user_reports.reported_user_id`
 * — the identity of the person they reported — and `user_blocks.blocked_user_id`
 * — the account they blocked — inside a payload whose own `excluded` section
 * said both had been withheld. GDPR Art. 15(4): a subject-access response must
 * not adversely affect the rights of others. The runbook made it worse by
 * instructing the operator to hand-redact records the machine had already sent.
 *
 * WHY A DATABASE. `excluded` is a list of strings and the projection is a list
 * of strings; comparing those two proves the service agrees with itself. The
 * claim that matters is about the FILE a real person receives, so this seeds
 * real rows, runs the real service against a real Postgres, and reads the keys
 * that actually came back.
 *
 * WHY THE MUTATION PROOF SHARES `manifestViolations`. The RED case rebuilds the
 * OLD `SELECT *` payload and hands it to the SAME judgement the green case
 * uses. A proof that re-implements its own comparison proves its copy, not the
 * guard (F9501).
 *
 * Everything runs in a transaction that always rolls back.
 */

const ROLL = Symbol('rollback');

const rollback = <T>(payload: T) =>
  Object.assign(new Error('rollback'), { [ROLL]: payload });

const unwrap = <T>(promise: Promise<unknown>): Promise<T> =>
  promise.then(
    () => {
      throw new Error('transaction resolved; it must always roll back');
    },
    (error: { [ROLL]?: T }) => {
      if (error[ROLL]) return error[ROLL];
      throw error;
    },
  );

const silentLogger = {
  setContext: () => ({
    info() {},
    warn() {},
    error() {},
    debug() {},
  }),
} as never;

type Payload = Awaited<ReturnType<PersonDataExportService['export']>>;

/**
 * THE JUDGEMENT: every column the payload CLAIMS to withhold, that the payload
 * nevertheless contains. Empty means the manifest is a fact.
 */
const manifestViolations = (payload: Payload): string[] => {
  const out: string[] = [];
  for (const { table, column } of payload.excluded) {
    for (const row of payload.tables[table] ?? []) {
      if (Object.hasOwn(row as object, column)) {
        out.push(`${table}.${column}`);
        break;
      }
    }
  }
  return out;
};

describe('subject-access export withholds other people (F9502)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const makeUser = async (tx: PrismaClient, tag: string): Promise<string> => {
    const [row] = await tx.$queryRawUnsafe<Array<{ user_id: string }>>(
      `INSERT INTO users (email, updated_at) VALUES ($1, now()) RETURNING user_id`,
      `export-${tag}-${Math.random().toString(36).slice(2)}@example.invalid`,
    );
    return row.user_id;
  };

  /** The subject reports someone and blocks someone else, then exports. */
  const seedAndExport = async () =>
    unwrap<{
      subject: string;
      other: string;
      payload: Payload;
      /** The same tables read the OLD way — `SELECT *`, no projection. */
      selectStar: Record<string, unknown[]>;
    }>(
      prisma.$transaction(
        async (tx) => {
          const client = tx as unknown as PrismaClient;

          const subject = await makeUser(client, 'subject');
          const other = await makeUser(client, 'other');

          await client.$executeRawUnsafe(
            `INSERT INTO user_reports (reporter_user_id, reported_user_id, reason)
             VALUES ($1::uuid, $2::uuid, 'spam')`,
            subject,
            other,
          );
          await client.$executeRawUnsafe(
            `INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
             VALUES ($1::uuid, $2::uuid)`,
            subject,
            other,
          );

          const payload = await new PersonDataExportService(
            client as never,
            silentLogger,
          ).export(subject);

          // THE MUTATION, run as data rather than as an edit: the exact query
          // the service used to issue, over the same tables and the same
          // scope. Restoring `SELECT *` in the service reproduces this
          // payload, so whatever this makes the judgement say is what the
          // regression would say.
          const selectStar: Record<string, unknown[]> = {};
          for (const table of ['user_reports', 'user_blocks']) {
            const where = subjectRows(table, { includeRetained: false });
            selectStar[table] = await client.$queryRawUnsafe<unknown[]>(
              `SELECT * FROM "${table}" WHERE ${where}`,
              subject,
            );
          }

          throw rollback({ subject, other, payload, selectStar });
        },
        { timeout: 30_000 },
      ),
    );

  it('never ships a column its own manifest calls withheld', async () => {
    const { payload, other } = await seedAndExport();

    // The rows are really there — otherwise "no violations" would just mean
    // "no data", the failure this file's service header warns about.
    expect(payload.tables.user_reports).toHaveLength(1);
    expect(payload.tables.user_blocks).toHaveLength(1);

    // THE HEADLINE. Nothing named in `excluded` appears in `tables`.
    expect(manifestViolations(payload)).toEqual([]);

    // Named explicitly, so a future refactor that empties `excluded` cannot
    // make the assertion above pass vacuously.
    const excluded = payload.excluded.map((e) => `${e.table}.${e.column}`);
    expect(excluded).toContain('user_reports.reported_user_id');
    expect(excluded).toContain('user_blocks.blocked_user_id');

    // The other person's identity is nowhere in the archive, by any route.
    expect(JSON.stringify(payload.tables)).not.toContain(other);

    // NO OVER-REDACTION. The subject's own report is genuinely exported: their
    // authorship, their stated reason, the record's identity and its date.
    const [report] = payload.tables.user_reports as Array<
      Record<string, unknown>
    >;
    expect(Object.keys(report).sort()).toEqual([
      'created_at',
      'reason',
      'report_id',
      'reporter_user_id',
    ]);
    expect(report.reason).toBe('spam');

    // ...and every column of the table that is NOT withheld is present, so
    // "no violations" cannot be bought by exporting less than we owe.
    const withheldBlocks = new Set(
      payload.excluded
        .filter((e) => e.table === 'user_blocks')
        .map((e) => e.column),
    );
    const [block] = payload.tables.user_blocks as Array<
      Record<string, unknown>
    >;
    expect(Object.keys(block).sort()).toEqual(
      ['blocker_user_id', 'blocked_user_id', 'created_at']
        .filter((c) => !withheldBlocks.has(c))
        .sort(),
    );
  }, 60_000);

  it('RED under the old SELECT * — the same judgement names both leaks', async () => {
    const { payload, selectStar } = await seedAndExport();

    const regressed: Payload = { ...payload, tables: selectStar };
    expect(manifestViolations(regressed).sort()).toEqual([
      'user_blocks.blocked_user_id',
      'user_reports.reported_user_id',
    ]);
  }, 60_000);

  it('fails loud if the declaration names a column the database lacks', async () => {
    const rule = PERSON_DATA_RULES.find(
      (r) => r.table === 'user_reports' && r.column === 'reported_user_id',
    );
    if (!rule) throw new Error('the rule under test no longer exists');

    const original = rule.column;
    // A RENAME, which is how this returns quietly: the manifest keeps naming
    // the old column while the real one sits on the include side.
    (rule as { column: string }).column = 'reported_user_id_renamed';
    try {
      await expect(
        new PersonDataExportService(prisma as never, silentLogger).export(
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow(/does not have/);
    } finally {
      (rule as { column: string }).column = original;
    }
  }, 60_000);
});
