/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
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
}) {
  const prisma = {
    user: {
      update: overrides?.userUpdate ?? jest.fn().mockResolvedValue({}),
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
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new AccountDeletionService(
    prisma as never,
    clerkAuth as never,
    entitlements as never,
    billing as never,
    logger as never,
  );
  return { service, prisma, clerkAuth, entitlements, billing, logger };
}

const user = {
  userId: 'u-del-1',
  authProviderUserId: 'clerk-del-1',
} as never;

describe('AccountDeletionService', () => {
  it('happy path: cancels billing, deletes Clerk, revokes grants, anonymizes', async () => {
    const cancelSubscription = jest
      .fn()
      .mockResolvedValue({ cancelAtPeriodEnd: true });
    const { service, prisma, clerkAuth, entitlements } = makeService({
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

  it('handles users without a Clerk id (skips auth deletion, still scrubs)', async () => {
    const { service, clerkAuth, prisma } = makeService();
    await service.deleteAccount({
      userId: 'u-del-2',
      authProviderUserId: null,
    } as never);
    expect(clerkAuth.deleteClerkUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
