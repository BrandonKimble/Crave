import { PrismaClient, type User } from '@prisma/client';
import { AccountDeletionService } from './account-deletion.service';

process.env.SIGNAL_AUDIT_HMAC_KEY ??= 'test-reserved-username-key';

/**
 * D148 — A DELETED PERSON HAS NO NAME IN THE DATABASE.
 *
 * THE GUARD THIS REPLACES COULD NOT FAIL. `scripts/check-author-identity.ts`
 * grepped src/ for `username: true` and skipped every file it had exempted —
 * and the two sets were IDENTICAL, so its loop body never ran once (F9481).
 * It was the only standing proof that a departed person stays nameless, and it
 * was proving nothing, in a shape no amount of care could have noticed from
 * reading it.
 *
 * WHAT IS ASSERTED INSTEAD IS THE DATA, and it is asserted against a real
 * database rather than a mock transcript. Deletion is not a promise that every
 * reader will remember a resolver; it is one UPDATE, and after it the name is
 * simply not there for anyone to leak:
 *
 *   REQUEST  -> username / display_name / avatar_url are NULL *during* grace,
 *               and the originals are in deleted_identity.
 *   RESTORE  -> the originals come back and the stash is gone.
 *   PURGE    -> the stash is gone for good.
 *
 * The reader-side pieces (publicAuthorIdentity, DELETED_AUTHOR_LABEL) are now
 * PRESENTATION: forgetting them renders a blank byline instead of the polite
 * "Deleted user", which is cosmetic. It is no longer a disclosure, because
 * there is nothing left in the row to disclose.
 *
 * MUTATION (registry: identity.a-deleted-person-has-no-name-in-the-database):
 * revert the stash-and-null in `deleteAccount` and the grace-window assertions
 * below go red.
 *
 * Everything runs inside a transaction that ALWAYS rolls back.
 */

/** Thrown to unwind the transaction; never a real failure. */
class Rollback extends Error {}

function makeService(prisma: unknown) {
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return new AccountDeletionService(
    prisma as never,
    {
      revokeAllSessions: jest.fn().mockResolvedValue({ revoked: 0 }),
      deleteClerkUser: jest.fn().mockResolvedValue(undefined),
    } as never,
    { revokeAllForUser: jest.fn().mockResolvedValue(0) } as never,
    {
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
      deleteRevenueCatSubscriber: jest.fn().mockResolvedValue(true),
    } as never,
    {
      isConfigured: false,
      avatarPublicIdFor: (id: string) => `crave/test/avatars/${id}`,
      destroyAsset: jest.fn().mockResolvedValue(undefined),
    } as never,
    // The eraser is proven for real by person-data-erasure*.integration.spec.ts.
    // Here it must only be callable: this file is about the identity stash, and
    // a mock that "erased" would prove nothing about erasure anyway.
    {
      erase: jest.fn().mockResolvedValue({ userId: '', applied: {} }),
      assertShellIsAnonymous: jest.fn().mockResolvedValue(undefined),
    } as never,
    { get: jest.fn().mockReturnValue('test-signing-secret') } as never,
    logger as never,
  );
}

/** A fresh person with a full visible identity — the thing that must vanish. */
async function seedPerson(tx: PrismaClient): Promise<User> {
  const stamp = Date.now();
  return tx.user.create({
    data: {
      email: `d148-${stamp}@example.invalid`,
      username: `d148user${stamp}`,
      displayName: 'Alice Realname',
      avatarUrl: 'https://example.invalid/alice.jpg',
    },
  });
}

describe('D148 — the deletion-time identity stash, against a live database', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('nulls the identity AT THE REQUEST and stashes the originals', async () => {
    await prisma
      .$transaction(async (tx) => {
        const person = await seedPerson(tx as unknown as PrismaClient);
        await makeService(tx).deleteAccount(person);

        const shell = await tx.user.findUniqueOrThrow({
          where: { userId: person.userId },
        });

        // DURING GRACE — not after the purge 30 days later. This is the whole
        // change: the window is recoverable AND anonymous at the same time.
        expect(shell.deletedAt).not.toBeNull();
        expect(shell.purgeDueAt).not.toBeNull();
        expect({
          username: shell.username,
          displayName: shell.displayName,
          avatarUrl: shell.avatarUrl,
        }).toEqual({ username: null, displayName: null, avatarUrl: null });

        // ...and nothing was destroyed: the identity moved, it did not die.
        expect(shell.deletedIdentity).toEqual({
          username: person.username,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
        });

        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });

  it('restore brings the identity back and empties the stash', async () => {
    await prisma
      .$transaction(async (tx) => {
        const person = await seedPerson(tx as unknown as PrismaClient);
        const service = makeService(tx);
        await service.deleteAccount(person);

        const deleted = await tx.user.findUniqueOrThrow({
          where: { userId: person.userId },
        });
        await service.restoreAccount(deleted);

        const restored = await tx.user.findUniqueOrThrow({
          where: { userId: person.userId },
        });
        expect(restored.deletedAt).toBeNull();
        expect(restored.purgeDueAt).toBeNull();
        expect({
          username: restored.username,
          displayName: restored.displayName,
          avatarUrl: restored.avatarUrl,
        }).toEqual({
          username: person.username,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
        });
        // A live account carrying a stash is exactly what the CHECK forbids.
        expect(restored.deletedIdentity).toBeNull();

        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });

  it('the purge destroys the stash — past the deadline there is nothing to restore', async () => {
    await prisma
      .$transaction(async (tx) => {
        const person = await seedPerson(tx as unknown as PrismaClient);
        const service = makeService(tx);
        await service.deleteAccount(person);

        const deleted = await tx.user.findUniqueOrThrow({
          where: { userId: person.userId },
        });
        expect(deleted.deletedIdentity).not.toBeNull(); // else the purge is vacuous
        await service.purgeAccount(deleted);

        const purged = await tx.user.findUniqueOrThrow({
          where: { userId: person.userId },
        });
        expect(purged.deletedIdentity).toBeNull();
        expect(purged.username).toBeNull();
        expect(purged.displayName).toBeNull();
        expect(purged.avatarUrl).toBeNull();
        expect(purged.email.startsWith('deleted:')).toBe(true);

        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });

  it('the database refuses a stash on a LIVE account (the CHECK is really there)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const person = await seedPerson(tx as unknown as PrismaClient);
        await expect(
          tx.user.update({
            where: { userId: person.userId },
            data: { deletedIdentity: { username: 'ghost' } },
          }),
        ).rejects.toThrow();
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
