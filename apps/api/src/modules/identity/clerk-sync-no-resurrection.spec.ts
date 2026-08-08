/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access  */
import { UserService } from './user.service';

/**
 * D148's LOAD-BEARING THREE-LINER.
 *
 * `syncFromClerkClaims` runs on EVERY authenticated request, and it backfills
 * `displayName`/`avatarUrl` from the Clerk claims whenever the columns are
 * empty. After D148 those columns are DELIBERATELY empty the moment a person
 * asks to be deleted — so without a guard, the very next authed request would
 * read "gap" where the code meant "erased" and write the person's real name
 * and avatar straight back onto the tombstoned row.
 *
 * The undo did not need it, either: the originals live in `deletedIdentity`
 * and `restoreAccount` is the only thing allowed to put them back.
 *
 * MUTATION: delete `&& !isDeleted` from either branch in user.service.ts and
 * the first test here goes red.
 */
function makeService(user: Record<string, unknown>) {
  const update = jest.fn().mockImplementation(({ data }) => ({
    ...user,
    ...data,
  }));
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      }),
      upsert: jest.fn().mockResolvedValue(user),
      update,
    },
    accessGrant: { findFirst: jest.fn().mockResolvedValue({ grantId: 'g1' }) },
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new UserService(
    prisma as never,
    {
      get: jest.fn((key: string) =>
        key === 'billing.defaultEntitlement' ? 'crave_plus' : 0,
      ),
    } as never,
    logger as never,
    { ensure: jest.fn().mockResolvedValue(undefined) } as never,
    { fetchUserIdentity: jest.fn().mockResolvedValue(null) } as never,
    { grant: jest.fn().mockResolvedValue(undefined) } as never,
    { ensureDefaultLists: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
  );
  return { service, update, prisma };
}

// The claims a returning person's token still carries: Clerk knows their name
// and their picture, because deleting OUR row does not delete their Clerk user
// (it survives the grace window on purpose — signing in is how they get back).
const CLAIMS = {
  sub: 'user_clerk_d148',
  name: 'Alice Realname',
  picture: 'https://img.clerk.invalid/alice.jpg',
} as never;

describe('syncFromClerkClaims never resurrects a deleted identity', () => {
  it('does NOT backfill name or avatar while the account is deleted', async () => {
    const { service, update } = makeService({
      userId: 'u-1',
      email: 'alice@example.invalid',
      displayName: null,
      avatarUrl: null,
      deletedAt: new Date(),
    });

    await service.syncFromClerkClaims(CLAIMS);

    const backfills = update.mock.calls.filter(
      ([arg]) =>
        arg.data.displayName !== undefined || arg.data.avatarUrl !== undefined,
    );
    expect(backfills).toEqual([]);
  });

  it('still backfills a LIVE account whose columns are genuinely empty', async () => {
    // The guard must not disarm the backfill for everybody — an over-broad fix
    // would silently strand every pre-JWT-template account with no name.
    const { service, update } = makeService({
      userId: 'u-2',
      email: 'bob@example.invalid',
      displayName: null,
      avatarUrl: null,
      deletedAt: null,
    });

    await service.syncFromClerkClaims(CLAIMS);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          displayName: 'Alice Realname',
          avatarUrl: 'https://img.clerk.invalid/alice.jpg',
        },
      }),
    );
  });
});
