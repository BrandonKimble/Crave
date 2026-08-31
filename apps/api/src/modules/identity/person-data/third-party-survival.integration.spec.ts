import { PrismaClient } from '@prisma/client';
import { PersonDataEraserService } from './person-data-eraser.service';
import { RetentionHorizonService } from './retention-horizon.service';

/**
 * ERASING ONE PERSON MUST NOT ERASE ANOTHER (F7500 / D118, fixed by D146).
 *
 * THE DEFECT, AND WHY IT NEEDED A DATABASE TO PROVE. Both DELETE constructions
 * — the eraser's `delete_row` and the retention sweep's horizon — were built
 * from `subjectRows`, the OR of every person-bearing column of a table. For an
 * EXPORT that OR is exactly right ("every row that names me"). Handed to a
 * DELETE it destroys the whole row, including the parts belonging to somebody
 * who never asked to leave:
 *
 *   DELETE FROM user_list_collaborators
 *    WHERE user_id = A OR invited_by_user_id = A
 *
 * A invited B onto C's list. Erasing A deleted B's membership of C's list.
 * `invited_by_user_id` is declared `sever` — "the invite survives on someone
 * else's list; who sent it does not" — so the declaration and the statement
 * said opposite things and the statement won.
 *
 * WHY NOT A UNIT TEST OF THE PREDICATE. `delete-scope-guard.spec.ts` already
 * proves the SQL no longer names the offending column; that is a statement
 * about a string. This is the statement about the DATA: three real people, a
 * real list, the real service, and an assertion that the third party is still
 * there afterwards. The declaration is a promise to a person, so the proof
 * should be about people.
 *
 * Everything runs in a transaction that always rolls back.
 */

const ROLL = Symbol('rollback');

const rollback = <T>(payload: T) =>
  Object.assign(new Error('rollback'), { [ROLL]: payload });

/**
 * The transaction ALWAYS throws (that is how it rolls back), so the only value
 * that ever comes back is the payload smuggled out on the error. Typed as
 * "never resolves" rather than cast at each call site.
 */
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

describe('erasure must not destroy third parties (F7500/D146)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const makeUser = async (tx: PrismaClient, tag: string): Promise<string> => {
    const [row] = await tx.$queryRawUnsafe<Array<{ user_id: string }>>(
      `INSERT INTO users (email, updated_at) VALUES ($1, now()) RETURNING user_id`,
      `third-party-${tag}-${Math.random().toString(36).slice(2)}@example.invalid`,
    );
    return row.user_id;
  };

  it("erasing the INVITER keeps the invited person's membership, minus who invited them", async () => {
    const outcome = await unwrap<{
      memberB: string;
      thirdPartyRow: {
        user_id: string;
        invited_by_user_id: string | null;
      } | null;
      ownRowsLeft: number;
    }>(
      prisma.$transaction(
        async (tx) => {
          const client = tx as unknown as PrismaClient;

          // THREE PEOPLE, because the defect is invisible with fewer. A owns
          // nothing here; they merely INVITED B onto C's list.
          const inviterA = await makeUser(client, 'inviter');
          const memberB = await makeUser(client, 'member');
          const ownerC = await makeUser(client, 'owner');

          const [list] = await client.$queryRawUnsafe<
            Array<{ list_id: string }>
          >(
            `INSERT INTO user_lists (owner_user_id, name, list_type, updated_at)
             VALUES ($1::uuid, 'C''s list', 'restaurant', now()) RETURNING list_id`,
            ownerC,
          );

          // The third party's row: B's membership, invited by A.
          await client.$executeRawUnsafe(
            `INSERT INTO user_list_collaborators (list_id, user_id, invited_by_user_id)
             VALUES ($1::uuid, $2::uuid, $3::uuid)`,
            list.list_id,
            memberB,
            inviterA,
          );
          // A's OWN membership of the same list, so this cannot pass by the
          // eraser simply doing nothing: the delete_row rule must still fire.
          await client.$executeRawUnsafe(
            `INSERT INTO user_list_collaborators (list_id, user_id, invited_by_user_id)
             VALUES ($1::uuid, $2::uuid, $3::uuid)`,
            list.list_id,
            inviterA,
            ownerC,
          );

          // ── THE REAL SERVICE ──────────────────────────────────────────────
          await new PersonDataEraserService(
            client as never,
            silentLogger,
          ).erase(inviterA);

          const [thirdParty] = await client.$queryRawUnsafe<
            Array<{ user_id: string; invited_by_user_id: string | null }>
          >(
            `SELECT user_id::text, invited_by_user_id::text
               FROM user_list_collaborators
              WHERE list_id = $1::uuid AND user_id = $2::uuid`,
            list.list_id,
            memberB,
          );
          const [own] = await client.$queryRawUnsafe<Array<{ n: number }>>(
            `SELECT count(*)::int AS n FROM user_list_collaborators
              WHERE user_id = $1::uuid`,
            inviterA,
          );

          throw rollback({
            memberB,
            thirdPartyRow: thirdParty ?? null,
            ownRowsLeft: own.n,
          });
        },
        { timeout: 30_000 },
      ),
    );

    // THE HEADLINE. B's membership of C's list SURVIVES — B is still the
    // member, and the only thing destroyed is the fact that A invited them.
    // Under the OR scope this row was gone entirely and `thirdPartyRow` was
    // null, which is the RED this test exists to be able to show.
    expect(outcome.thirdPartyRow).toEqual({
      user_id: outcome.memberB,
      invited_by_user_id: null,
    });

    // ...and A's own membership is genuinely deleted, so the green above is
    // not the eraser failing to run.
    expect(outcome.ownRowsLeft).toBe(0);
  }, 60_000);

  it('the horizon sweep for a departed REPORTER keeps their reports about live people', async () => {
    const outcome = await unwrap<{
      aboutThirdParty: number;
      aboutDepartedPerson: number;
    }>(
      prisma.$transaction(
        async (tx) => {
          const client = tx as unknown as PrismaClient;

          // The departed person, long past the 2555-day horizon and already
          // purged (purge_due_at IS NULL is what the sweep requires).
          const departed = await makeUser(client, 'departed');
          await client.$executeRawUnsafe(
            `UPDATE users
                SET deleted_at = now() - INTERVAL '3000 days', purge_due_at = NULL
              WHERE user_id = $1::uuid`,
            departed,
          );
          const liveOther = await makeUser(client, 'live-other');
          const liveReporter = await makeUser(client, 'live-reporter');

          // (1) The departed person REPORTED a still-live third party. The
          //     2555-day horizon is declared on `reported_user_id`, and this
          //     row's reported_user_id is the LIVE person — the horizon is not
          //     this row's to enforce. Under the OR scope it was deleted anyway.
          await client.$executeRawUnsafe(
            `INSERT INTO user_reports (reporter_user_id, reported_user_id, reason)
             VALUES ($1::uuid, $2::uuid, 'spam')`,
            departed,
            liveOther,
          );
          // (2) A report ABOUT the departed person, whose horizon HAS passed.
          //     This one must go, or the sweep is passing by doing nothing.
          await client.$executeRawUnsafe(
            `INSERT INTO user_reports (reporter_user_id, reported_user_id, reason)
             VALUES ($1::uuid, $2::uuid, 'spam')`,
            liveReporter,
            departed,
          );

          await new RetentionHorizonService(
            client as never,
            { emit: () => {} } as never,
            silentLogger,
          ).sweep();

          const [about] = await client.$queryRawUnsafe<Array<{ n: number }>>(
            `SELECT count(*)::int AS n FROM user_reports
              WHERE reporter_user_id = $1::uuid AND reported_user_id = $2::uuid`,
            departed,
            liveOther,
          );
          const [ofThem] = await client.$queryRawUnsafe<Array<{ n: number }>>(
            `SELECT count(*)::int AS n FROM user_reports
              WHERE reported_user_id = $1::uuid`,
            departed,
          );

          throw rollback({
            aboutThirdParty: about.n,
            aboutDepartedPerson: ofThem.n,
          });
        },
        { timeout: 30_000 },
      ),
    );

    // The safety record ABOUT a still-live person survives its reporter's
    // departure. The reporter is de-identified by `anonymized_by_shell`, not by
    // destroying somebody else's moderation history.
    expect(outcome.aboutThirdParty).toBe(1);
    // And the horizon it IS about is enforced.
    expect(outcome.aboutDepartedPerson).toBe(0);
  }, 60_000);
});
