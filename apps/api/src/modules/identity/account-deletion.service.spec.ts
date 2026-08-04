/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import { PERSON_DATA_RULES } from './person-data/person-data-class';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Contract tests for account deletion (Apple 5.1.1(v)). The ORDERING is the
 * contract: Clerk deletion must gate local anonymization (a user whose auth
 * still works must never end up half-deleted), and billing failures must
 * never block a legally-required deletion.
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
  };
  const entitlements = {
    revokeAllForUser: jest.fn().mockResolvedValue(2),
  };
  const billing = {
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
} as never;

describe('AccountDeletionService', () => {
  it('happy path: cancels billing, deletes Clerk, revokes grants, anonymizes', async () => {
    const cancelSubscription = jest
      .fn()
      .mockResolvedValue({ cancelAtPeriodEnd: true });
    const { service, prisma, clerkAuth, entitlements, cloudinaryService } =
      makeService({
        cancelSubscription,
      });
    const result = await service.deleteAccount(user);
    expect(result).toEqual({ deleted: true });
    expect(cancelSubscription).toHaveBeenCalled();
    expect(clerkAuth.deleteClerkUser).toHaveBeenCalledWith('clerk-del-1');
    expect(entitlements.revokeAllForUser).toHaveBeenCalledWith(
      'u-del-1',
      'account_deleted',
    );
    // avatar asset (pure PII) destroyed with the account
    expect(cloudinaryService.destroyAsset).toHaveBeenCalledWith(
      'crave/test/avatars/u-del-1',
    );
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.data.deletedAt).toBeInstanceOf(Date);
    expect(update.data.email).toContain('anonymized.invalid');
    expect(update.data.authProviderUserId).toBeNull();
    expect(update.data.username).toBeNull();
  });

  it('billing failure (non-BadRequest) does NOT block deletion', async () => {
    const { service, clerkAuth } = makeService({
      cancelSubscription: jest.fn().mockRejectedValue(new Error('stripe down')),
    });
    await expect(service.deleteAccount(user)).resolves.toEqual({
      deleted: true,
    });
    expect(clerkAuth.deleteClerkUser).toHaveBeenCalled();
  });

  it('Clerk failure aborts BEFORE any local change (clean retry)', async () => {
    const { service, prisma, entitlements } = makeService({
      clerkDelete: jest.fn().mockRejectedValue(new Error('clerk 500')),
    });
    await expect(service.deleteAccount(user)).rejects.toThrow('clerk 500');
    expect(entitlements.revokeAllForUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('local failure after Clerk delete rethrows and logs CRITICAL for replay', async () => {
    const { service, logger } = makeService({
      userUpdate: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.deleteAccount(user)).rejects.toThrow('db down');
    const critical = logger.error.mock.calls.find(([message]) =>
      String(message).includes('CRITICAL'),
    );
    expect(critical).toBeDefined();
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

    it('keeps the RECIPIENT\'s copy of a DM — one row, two parties', () => {
      expect(ruleFor('messages', 'sender_user_id')?.disposition).toBe(
        'anonymized_by_shell',
      );
    });

    it('runs erasure exactly once per deletion', async () => {
      const { service, eraser } = makeService();
      await service.deleteAccount(user);
      expect(eraser.erase).toHaveBeenCalledTimes(1);
      expect(eraser.erase).toHaveBeenCalledWith('u-del-1');
    });
  });

  it('handles users without a Clerk id (skips auth deletion, still scrubs)', async () => {
    const { service, clerkAuth, prisma } = makeService();
    await service.deleteAccount({
      userId: 'u-del-2',
      authProviderUserId: null,
    } as never);
    expect(clerkAuth.deleteClerkUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it('BURNS every handle the person ever held, then drops the person link (RED-proof for the 2026-08-02 defect: deleting username_history alone made the handle reclaimable)', async () => {
    const { service, prisma, eraser } = makeService();
    await service.deleteAccount(user);
    // Every held handle is reserved — reserved_usernames has NO person
    // column, so the name is burned while nothing about who held it remains.
    const burned = prisma.reservedUsername.upsert.mock.calls.map(
      (c: { create: { username: string } }[]) => c[0].create.username,
    );
    expect(burned).toEqual(expect.arrayContaining(['oldhandle']));
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
    const reserveOrder = (
      prisma.reservedUsername.upsert as jest.Mock
    ).mock.invocationCallOrder[0];
    const eraseOrder = (eraser.erase as jest.Mock).mock
      .invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(eraseOrder);
  });
});
