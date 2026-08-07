/**
 * THE ACCESS PAYLOAD CARRIES THE RAIL (GET /users/me -> .access.billingRail).
 *
 * The client cannot derive this: the ledger's grant `source` says WHY access
 * exists, never who bills for it. Before this field the settings "Manage
 * subscription" row sent every subscriber to Apple's subscriptions page — a
 * dead end for a Stripe-web subscriber, who has no App Store record at all.
 *
 * Derived here from the SAME subscription row the profile already loads:
 * one source of truth, no second store.
 */
import { UserService } from './user.service';

const USER = '0feefee6-ef68-4df7-a817-71abe42abfc2';

type SubRow = {
  provider: string;
  status: string;
  platform?: string | null;
  planName?: string | null;
  priceId?: string | null;
  productId?: string | null;
  currentPeriodEnd?: Date | null;
};

const makeService = (subscription: SubRow | null) => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(0) }]),
    user: {
      findUnique: jest.fn(({ where }: { where: { userId?: string } }) =>
        Promise.resolve(
          where.userId === USER
            ? {
                userId: USER,
                email: 'them@example.com',
                username: 'them',
                displayName: 'Them',
                avatarUrl: null,
                usernameStatus: null,
                lastSignInAt: null,
                stats: {},
                subscriptions: subscription ? [subscription] : [],
              }
            : null,
        ),
      ),
    },
    poll: { count: jest.fn().mockResolvedValue(0) },
    userFollow: { count: jest.fn().mockResolvedValue(0) },
    userList: { count: jest.fn().mockResolvedValue(0) },
    userListItem: { count: jest.fn().mockResolvedValue(0) },
  };
  const entitlements = {
    summarize: jest.fn().mockResolvedValue({
      entitlementCode: 'premium',
      active: true,
      expiresAt: null,
      paidUntil: null,
      coverageUntil: null,
      source: 'subscription',
    }),
  };
  const service = new UserService(
    prisma as never,
    {
      get: jest.fn((key: string) =>
        key === 'billing.defaultEntitlement' ? 'premium' : undefined,
      ),
    } as never,
    {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    } as never,
    { ensure: jest.fn() } as never,
    {} as never,
    entitlements as never,
    {} as never,
    { liveCities: jest.fn(), resolvePlaceIdByName: jest.fn() } as never,
  );
  return service;
};

describe('GET /users/me .access.billingRail', () => {
  it('a Stripe subscriber is on the WEB rail', async () => {
    const service = makeService({
      provider: 'stripe',
      status: 'active',
      platform: 'web',
    });
    const profile = await service.getProfile(USER);
    expect(profile.access.billingRail).toBe('web');
  });

  it('a RevenueCat subscriber is on the APP STORE rail', async () => {
    const service = makeService({
      provider: 'revenuecat',
      status: 'active',
      platform: 'ios',
    });
    const profile = await service.getProfile(USER);
    expect(profile.access.billingRail).toBe('app_store');
  });

  it('no subscription -> null, even though ledger access is ACTIVE (a trial/comp has no rail)', async () => {
    const service = makeService(null);
    const profile = await service.getProfile(USER);
    expect(profile.access.active).toBe(true);
    expect(profile.access.billingRail).toBeNull();
  });
});
