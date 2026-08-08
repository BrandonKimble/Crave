/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERSON_DATA_RULES } from './person-data/person-data-class';
import { AccountDeletionService } from './account-deletion.service';
import { reservedUsernameHash } from './reserved-username-hash';

// The burn is keyed by the codebase's one HMAC key. Set before any test so
// the writer and the assertions derive the same digest — an unset key is a
// LOUD throw by design (an unkeyed hash of a handle is enumerable), not a
// quiet fallback, so it has to be present here as it is in every environment.
process.env.SIGNAL_AUDIT_HMAC_KEY ??= 'test-reserved-username-key';

/**
 * Contract tests for account deletion (Apple 5.1.1(v)).
 *
 * THE CONTRACT IS THE TWO-PHASE SPLIT. `deleteAccount` is the REQUEST and must
 * destroy nothing — the disclosed 30-day window is only real if the identity
 * survives it, because signing in IS the restore. `purgeAccount` is the
 * DEADLINE and is the only thing allowed to be irreversible.
 *
 * These assertions used to be the other way round, and they passed: the code
 * destroyed everything inside the request while the privacy policy promised a
 * recoverable window. A green spec proved only that the code did what the
 * spec's author believed, not what the product promised — which is why
 * account-deletion-promise.spec.ts now checks the code against the published
 * documents.
 */
function makeService(overrides?: {
  clerkDelete?: jest.Mock;
  cancelSubscription?: jest.Mock;
  userUpdate?: jest.Mock;
  /** null = no signal actor exists for this user (idempotent re-run). */
  signalActor?: { actorId: string } | null;
}) {
  const prisma = {
    user: {
      update: overrides?.userUpdate ?? jest.fn().mockResolvedValue({}),
    },
    // Hard-PII tables deletion now purges (no FK to users, so nothing cascades).
    notificationDevice: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    usernameHistory: {
      findMany: jest.fn().mockResolvedValue([{ username: 'oldhandle' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reservedUsername: { upsert: jest.fn().mockResolvedValue({}) },
    // D40: signals severance + the two user-data tables that die outright.
    signalActor: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides?.signalActor === undefined
            ? { actorId: 'actor-del-1' }
            : overrides.signalActor,
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    userTasteProfile: {
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    userOnboardingResponse: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const clerkAuth = {
    deleteClerkUser:
      overrides?.clerkDelete ?? jest.fn().mockResolvedValue(undefined),
    // The REQUEST revokes sessions; only the PURGE deletes the user.
    revokeAllSessions: jest.fn().mockResolvedValue({ revoked: 2 }),
  };
  const entitlements = {
    revokeAllForUser: jest.fn().mockResolvedValue(2),
  };
  const billing = {
    deleteRevenueCatSubscriber: jest.fn().mockResolvedValue(true),
    cancelSubscription:
      overrides?.cancelSubscription ??
      jest.fn().mockRejectedValue(new BadRequestException('none')),
  };
  const cloudinaryService = {
    isConfigured: true,
    avatarPublicIdFor: (id: string) => `crave/test/avatars/${id}`,
    destroyAsset: jest.fn().mockResolvedValue(undefined),
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  // The eraser is proven for real against a live database by
  // person-data-erasure.integration.spec.ts. Here it only needs to be callable
  // and assertable — a mock cannot prove erasure, and pretending otherwise is
  // what let the old transcript-style specs stay green while data leaked.
  const eraser = {
    erase: jest
      .fn()
      .mockResolvedValue({ userId: 'u-del-1', applied: {}, skipped: [] }),
    assertShellIsAnonymous: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountDeletionService(
    prisma as never,
    clerkAuth as never,
    entitlements as never,
    billing as never,
    cloudinaryService as never,
    eraser as never,
    { get: jest.fn().mockReturnValue('test-signing-secret') } as never,
    logger as never,
  );
  return {
    service,
    eraser,
    prisma,
    clerkAuth,
    entitlements,
    billing,
    cloudinaryService,
    logger,
  };
}

const user = {
  userId: 'u-del-1',
  email: 'Person@Example.com',
  authProviderUserId: 'clerk-del-1',
  // A full visible identity — the thing D148's stash-and-null has to move.
  username: 'oldhandle',
  displayName: 'Alice Realname',
  avatarUrl: 'https://example.invalid/alice.jpg',
} as never;

describe('AccountDeletionService', () => {
  it('the REQUEST cancels billing, signs out everywhere, and destroys NOTHING', async () => {
    const cancelSubscription = jest
      .fn()
      .mockResolvedValue({ cancelAtPeriodEnd: true });
    const {
      service,
      prisma,
      clerkAuth,
      entitlements,
      cloudinaryService,
      eraser,
    } = makeService({ cancelSubscription });
    const result = await service.deleteAccount(user);
    expect(result).toEqual({ deleted: true });
    expect(cancelSubscription).toHaveBeenCalled();
    // Signed out — but the identity SURVIVES, which is the whole grace period.
    expect(clerkAuth.revokeAllSessions).toHaveBeenCalledWith('clerk-del-1');
    expect(clerkAuth.deleteClerkUser).not.toHaveBeenCalled();
    expect(eraser.erase).not.toHaveBeenCalled();
    expect(cloudinaryService.destroyAsset).not.toHaveBeenCalled();
    expect(prisma.reservedUsername.upsert).not.toHaveBeenCalled();
    // ENTITLEMENTS SURVIVE THE WINDOW. Revoking here destroyed the very thing
    // the window protects: a paying person who mis-tapped and restored on day
    // 2 came back with their grants gone and no way to get them back. Access
    // is already denied — the guard refuses a deleted account everywhere — so
    // revoking now bought nothing.
    expect(entitlements.revokeAllForUser).not.toHaveBeenCalled();
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.data.deletedAt).toBeInstanceOf(Date);
    // The deadline is set, and it is the ONLY authority the purge reads.
    expect(update.data.purgeDueAt).toBeInstanceOf(Date);
    expect(update.data.purgeDueAt.getTime()).toBeGreaterThan(Date.now());
    // NOTHING IS DESTROYED — but the identity MOVES (D148). The visible name
    // columns go null in this same statement and the originals are stashed for
    // restore, so the grace window is recoverable AND anonymous at once. What
    // must still be untouched is everything the way BACK IN depends on: the
    // email and the Clerk pointer.
    expect(update.data.email).toBeUndefined();
    expect(update.data.authProviderUserId).toBeUndefined();
    expect(update.data.username).toBeNull();
    expect(update.data.displayName).toBeNull();
    expect(update.data.avatarUrl).toBeNull();
    expect(update.data.deletedIdentity).toEqual({
      username: 'oldhandle',
      displayName: 'Alice Realname',
      avatarUrl: 'https://example.invalid/alice.jpg',
    });
    // ...and it is ONE statement: a crash between a stash and a null would
    // leave either a visible name on a dead account or an unrestorable one.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('the PURGE is where the account actually dies', async () => {
    const {
      service,
      prisma,
      clerkAuth,
      cloudinaryService,
      eraser,
      entitlements,
    } = makeService();
    await service.purgeAccount(user);
    expect(clerkAuth.deleteClerkUser).toHaveBeenCalledWith('clerk-del-1');
    expect(cloudinaryService.destroyAsset).toHaveBeenCalledWith(
      'crave/test/avatars/u-del-1',
    );
    expect(eraser.erase).toHaveBeenCalledWith('u-del-1');
    // Grants die with the account, at the deadline.
    expect(entitlements.revokeAllForUser).toHaveBeenCalledWith(
      'u-del-1',
      'account_deleted',
    );
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.data.email).toContain('anonymized.invalid');
    expect(update.data.authProviderUserId).toBeNull();
    expect(update.data.username).toBeNull();
  });

  it('billing failure (non-BadRequest) does NOT block a deletion request', async () => {
    const { service, clerkAuth } = makeService({
      cancelSubscription: jest.fn().mockRejectedValue(new Error('stripe down')),
    });
    await expect(service.deleteAccount(user)).resolves.toEqual({
      deleted: true,
    });
    expect(clerkAuth.revokeAllSessions).toHaveBeenCalled();
  });

  it('a Clerk outage still marks the account — the request cannot be refused', async () => {
    // The request destroys nothing, so there is no half-deleted state to fear
    // and no reason to fail a legally-required action on a vendor's outage.
    // A session we could not revoke reaches nothing a signed-out visitor
    // could not: the required guard refuses a deleted account outright, and
    // the optional guard treats one as anonymous (F9964 — that second half
    // was missing, and this comment asserted it anyway).
    const { service, prisma } = makeService();
    service['clerkAuth'].revokeAllSessions = jest
      .fn()
      .mockRejectedValue(new Error('clerk 500'));
    await expect(service.deleteAccount(user)).resolves.toEqual({
      deleted: true,
    });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('a re-run purge does NOT re-hash an already-hashed email', async () => {
    // The retry path is real: a purge that fails partway leaves purgeDueAt set
    // and runs again tomorrow against a freshly-read row. Hashing the hash
    // yields a different digest and silently destroys the ban-evasion signal
    // the first pass recorded — the one thing here that can be lost quietly
    // rather than loudly re-done.
    const { service, prisma, clerkAuth, eraser } = makeService();
    await service.purgeAccount({
      userId: 'u-del-1',
      email: 'deleted:abc123@anonymized.invalid',
      authProviderUserId: null,
    } as never);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(clerkAuth.deleteClerkUser).not.toHaveBeenCalled();
    // It still sweeps rows that arrived during the window.
    expect(eraser.erase).toHaveBeenCalledWith('u-del-1');
  });

  it('restore clears BOTH the tombstone and the deadline, and gives the name back', async () => {
    const { service, prisma } = makeService();
    await service.restoreAccount({
      userId: 'u-del-1',
      deletedAt: new Date(),
      deletedIdentity: {
        username: 'oldhandle',
        displayName: 'Alice Realname',
        avatarUrl: 'https://example.invalid/alice.jpg',
      },
    } as never);
    const data = prisma.user.update.mock.calls[0][0].data;
    // purgeDueAt is what the cron reads; clearing deletedAt alone would leave
    // a restored account scheduled for destruction at its original deadline.
    // D148: the identity comes back with it — restoring the account to a blank
    // profile is not an undo — and the stash is emptied, because a stash on a
    // live row is what the database CHECK forbids.
    expect(data).toEqual({
      deletedAt: null,
      purgeDueAt: null,
      deletedIdentity: Prisma.DbNull,
      username: 'oldhandle',
      displayName: 'Alice Realname',
      avatarUrl: 'https://example.invalid/alice.jpg',
    });
  });

  it('a restore whose stash is missing or malformed still restores the account', async () => {
    // JSONB is an open shape; a row from an older build has no stash at all.
    // Refusing the ONE route a panicking person reaches, over a column that
    // only exists to be a convenience, would be the wrong trade.
    const { service, prisma } = makeService();
    await service.restoreAccount({
      userId: 'u-del-1',
      deletedAt: new Date(),
      deletedIdentity: 'not an object',
    } as never);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.deletedAt).toBeNull();
    expect(data.username).toBeNull();
  });

  it('a stashed handle that is somehow taken is a clean 409, never a 500', async () => {
    // Belt only: username_history already blocks squatting while the window is
    // open. But "your handle is taken" is an answer; a 500 is not.
    const userUpdate = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5',
      }),
    );
    const { service } = makeService({ userUpdate });
    await expect(
      service.restoreAccount({
        userId: 'u-del-1',
        deletedAt: new Date(),
        deletedIdentity: { username: 'oldhandle' },
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('restoring a live account is a no-op, not an error', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.restoreAccount({ userId: 'u-del-1', deletedAt: null } as never),
    ).resolves.toEqual({ restored: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a purge that fails rethrows so the deadline is left set for retry', async () => {
    const { service } = makeService({
      userUpdate: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.purgeAccount(user)).rejects.toThrow('db down');
  });

  // D40 owner rulings #1 + #2 (2026-08-03): anonymity, not destruction.
  //
  // These used to assert `prisma.signalActor.update` etc. — a transcript of an
  // implementation that has since moved into the eraser. Transcript specs are
  // exactly what let this file stay green while private lists and raw search
  // text leaked, so they are not re-pointed at the new mock. The rulings are
  // now DATA (PERSON_DATA_RULES), so the contract test is against the data,
  // and the behaviour is proven for real by
  // person-data-erasure.integration.spec.ts against a live database.
  describe('behavioral data (D40) — the rulings are declared, not narrated', () => {
    const ruleFor = (table: string, column: string) =>
      PERSON_DATA_RULES.find((r) => r.table === table && r.column === column);

    it('SEVERS signal_actors.user_id — the actor survives as anonymous demand evidence', () => {
      expect(ruleFor('signal_actors', 'user_id')?.disposition).toBe('sever');
      // The device fingerprint goes with it, or the next sign-in on that
      // device re-adopts the actor.
      expect(ruleFor('signal_actors', 'device_key')?.disposition).toBe(
        'null_column',
      );
      // The ledger itself is never row-deleted.
      expect(ruleFor('signals', 'actor_id')?.disposition).toBe('retain');
    });

    it('DELETES the data that is ABOUT the person (own answers, inferred profile)', () => {
      expect(ruleFor('user_onboarding_responses', 'user_id')?.disposition).toBe(
        'delete_row',
      );
      expect(ruleFor('user_taste_profile', 'actor_id')?.disposition).toBe(
        'delete_row',
      );
    });

    it("keeps the RECIPIENT's copy of a DM — one row, two parties", () => {
      expect(ruleFor('messages', 'sender_user_id')?.disposition).toBe(
        'anonymized_by_shell',
      );
    });

    it('runs erasure exactly once per PURGE — and never in the request', async () => {
      const { service, eraser } = makeService();
      await service.deleteAccount(user);
      expect(eraser.erase).not.toHaveBeenCalled();
      await service.purgeAccount(user);
      expect(eraser.erase).toHaveBeenCalledTimes(1);
      expect(eraser.erase).toHaveBeenCalledWith('u-del-1');
    });
  });

  it('handles users without a Clerk id (skips auth deletion, still scrubs)', async () => {
    const { service, clerkAuth, prisma } = makeService();
    await service.purgeAccount({
      userId: 'u-del-2',
      authProviderUserId: null,
    } as never);
    expect(clerkAuth.deleteClerkUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it('BURNS every handle the person ever held, then drops the person link (RED-proof for the 2026-08-02 defect: deleting username_history alone made the handle reclaimable)', async () => {
    const { service, prisma, eraser } = makeService();
    await service.purgeAccount(user);
    // Every held handle is reserved — reserved_usernames has NO person
    // column, so the name is burned while nothing about who held it remains.
    // AS A HASH (owner ruling 2026-08-07): the burn must still happen, and
    // the stored value must NOT be the handle. See the mutation proof below
    // for the half that matters — that hashing did not break the collision.
    const burned = prisma.reservedUsername.upsert.mock.calls.map(
      (c: { create: { username: string } }[]) => c[0].create.username,
    );
    expect(burned).toEqual(
      expect.arrayContaining([reservedUsernameHash('oldhandle')]),
    );
    expect(burned).not.toContain('oldhandle');
    expect(prisma.reservedUsername.upsert.mock.calls[0][0].create.reason).toBe(
      'account_deleted',
    );
    // ...and only THEN is the person<->handle mapping removed.
    // Dropping the person<->handle mapping is now the ERASER's job
    // (username_history carries a `delete_row` rule), so what this asserts is
    // the ORDER that matters: handles are reserved BEFORE erasure runs. That
    // the rule actually removes the rows is proven against a live database by
    // person-data-erasure.integration.spec.ts, not by a mock.
    expect(eraser.erase).toHaveBeenCalledWith('u-del-1');
    const reserveOrder =
      prisma.reservedUsername.upsert.mock.invocationCallOrder[0];
    const eraseOrder = eraser.erase.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(eraseOrder);
  });

  it('PROPAGATES to RevenueCat — nulling our pointer locally is not deletion', () => {
    // The defect this guards (2026-08-03): deletion nulled
    // `revenueCatAppUserId` and stopped, severing OUR pointer while the
    // subscriber record stayed live at the processor — the link deleted from
    // the side that was not holding the data. GDPR 17(2)/CCPA 1798.105(c)
    // extend the duty to processors.
    const { service, billing } = makeService();
    return service
      .purgeAccount({
        userId: 'u-del-1',
        email: 'Person@Example.com',
        username: 'handle',
        authProviderUserId: 'clerk-del-1',
        revenueCatAppUserId: 'rc-app-user-1',
      } as never)
      .then(() => {
        expect(billing.deleteRevenueCatSubscriber).toHaveBeenCalledWith(
          'rc-app-user-1',
        );
      });
  });
});
