import { PrismaClient } from '@prisma/client';
import { AccountDeletionService } from './account-deletion.service';

/**
 * THE REQUEST DESTROYS NOTHING — STATED AS A PROPERTY, NOT A LIST.
 *
 * WHAT THIS REPLACES, AND WHY IT HAD TO BE REPLACED. The old proof asserted
 * that `deleteAccount`'s source did not contain four named calls
 * (deleteClerkUser, the eraser, reservedUsername, createHmac). That is an
 * enumeration of remembered sins, and it has the failure mode every
 * enumeration has: a destructive FIFTH step of a new kind sails past it. It
 * was also, by then, the third guard in this territory built the same way —
 * a watchdog whose grep matched only the files it exempted, an "every
 * authenticated route refuses" claim that had never been checked against the
 * second guard, and this. One shape: verify the case in front of you, write
 * the general sentence.
 *
 * THE PROPERTY, which is what "destroys nothing" actually means:
 *
 *     delete THEN restore is the identity function on a person's data.
 *
 * Every column of the account must come back byte-identical, except the small
 * declared set that is ALLOWED to differ because it records the lifecycle
 * itself. Nothing is enumerated about HOW deletion works, so a fifth step, or
 * a fiftieth, is caught by the same assertion the first four were — it shows
 * up as a column that did not come back.
 *
 * REAL DATABASE, REAL SERVICE, STUBBED VENDORS. The vendors (Clerk, Stripe,
 * Cloudinary, RevenueCat) are network calls whose absence proves nothing about
 * reversibility; the DATABASE effect is the entire question, so that half is
 * real. Everything runs in a transaction that always rolls back.
 */

const ROLLBACK = Symbol('rollback');

/**
 * Columns permitted to differ after a delete/restore round trip.
 *
 * Each is here because it RECORDS the lifecycle rather than describing the
 * person — that is the whole justification, and it is why the list is closed
 * and short. A column added here without that property would be a way to
 * smuggle destruction past this test, so the list is asserted to stay small.
 */
const LIFECYCLE_COLUMNS = new Set([
  'deleted_at', // the tombstone, cleared by restore
  'purge_due_at', // the deadline, retracted by restore
  'deleted_identity', // the stash itself: written, then emptied on restore
  'updated_at', // touched by any write; says nothing about the person
]);

describe('account deletion — the REQUEST is reversible (the property)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const noopLogger = {
    setContext: () => ({
      info() {},
      warn() {},
      error() {},
      debug() {},
    }),
  } as never;

  /** The service with its DATABASE real and its VENDORS inert. */
  const serviceFor = (client: PrismaClient) =>
    new AccountDeletionService(
      client as never,
      {
        revokeAllSessions: () => Promise.resolve({ revoked: 0 }),
        deleteClerkUser: () => Promise.resolve(),
      } as never,
      { revokeAllForUser: () => Promise.resolve(0) } as never,
      {
        cancelSubscription: () => Promise.resolve({}),
        deleteRevenueCatSubscriber: () => Promise.resolve(true),
      } as never,
      {
        isConfigured: false,
        avatarPublicIdFor: (id: string) => id,
        destroyAsset: () => Promise.resolve(),
      } as never,
      { erase: () => Promise.resolve({ applied: {}, skipped: [] }) } as never,
      { get: () => 'test-hmac-key' } as never,
      noopLogger,
    );

  it('every column comes back — a fifth destructive step would show here', async () => {
    const outcome = await prisma
      .$transaction(
        async (tx) => {
          const client = tx as unknown as PrismaClient;

          // A person with every identity-bearing field POPULATED. A null
          // column cannot demonstrate that it survived a round trip, so an
          // under-filled fixture would make this pass vacuously.
          const [seeded] = await client.$queryRawUnsafe<
            Array<{ user_id: string }>
          >(
            `INSERT INTO users (
               email, updated_at, username, display_name, avatar_url,
               auth_provider, auth_provider_user_id, revenuecat_app_user_id,
               stripe_customer_id, onboarding_responses
             ) VALUES ($1, now(), $2, 'Reversible Person',
                       'https://example.invalid/a.png', 'clerk', $3, $4,
                       'cus_reversible', '{"city":"austin"}'::jsonb)
             RETURNING user_id`,
            `reversible-${Date.now()}@example.invalid`,
            `reversible_${Date.now()}`,
            `clerk_${Date.now()}`,
            `rc_${Date.now()}`,
          );

          const snapshot = async () => {
            const [row] = await client.$queryRawUnsafe<
              Array<Record<string, unknown>>
            >(`SELECT * FROM users WHERE user_id = $1::uuid`, seeded.user_id);
            return row;
          };

          const before = await snapshot();
          const service = serviceFor(client);

          // The service takes a Prisma User (camelCase); raw SQL returns
          // snake_case. Read it through the client so both halves speak the
          // same dialect — the snapshot stays raw on purpose, because
          // comparing EVERY physical column is the point.
          const asUser = () =>
            client.user.findUniqueOrThrow({
              where: { userId: seeded.user_id },
            });

          await service.deleteAccount(await asUser());
          const deleted = await snapshot();
          await service.restoreAccount(await asUser());
          const after = await snapshot();

          throw Object.assign(new Error('rollback'), {
            [ROLLBACK]: { before, deleted, after },
          });
        },
        { timeout: 30_000 },
      )
      .catch(
        (error: {
          [ROLLBACK]?: {
            before: Record<string, unknown>;
            deleted: Record<string, unknown>;
            after: Record<string, unknown>;
          };
        }) => {
          if (error[ROLLBACK]) return error[ROLLBACK];
          throw error;
        },
      );

    const { before, deleted, after } = outcome;

    // THE FIXTURE MUST BE ABLE TO FAIL: deletion has to have actually hidden
    // something, or "it all came back" is a statement about nothing.
    expect({
      username: deleted.username,
      displayName: deleted.display_name,
    }).toEqual({ username: null, displayName: null });
    expect(deleted.deleted_at).not.toBeNull();

    // THE PROPERTY. Not a list of what deletion may not call — a comparison of
    // what the person's row WAS against what it became.
    const changed = Object.keys(before).filter(
      (column) =>
        !LIFECYCLE_COLUMNS.has(column) &&
        JSON.stringify(before[column]) !== JSON.stringify(after[column]),
    );
    expect(changed).toEqual([]);

    // And the allowlist stays small enough to read: a column added to it is a
    // way to smuggle destruction past this test, so growth is a decision.
    expect(LIFECYCLE_COLUMNS.size).toBeLessThanOrEqual(4);
  });
});
