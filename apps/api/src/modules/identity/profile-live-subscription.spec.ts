/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- getProfile is exercised through the prototype with a minimal `this`, so the prisma double reads its own untyped args (same pattern as places-origin-rule.spec.ts) */
import 'reflect-metadata';
import { SubscriptionProvider, SubscriptionStatus } from '@prisma/client';
import { UserService } from './user.service';

/**
 * A DEAD ROW MUST NOT SHADOW A LIVE ONE (F9800).
 *
 * Alice subscribes on the web (Stripe, active). Later a store receipt of hers
 * lapses and lands a NEWER `cancelled` row. `getProfile` loaded her
 * subscriptions `orderBy createdAt desc take 1` with NO status filter, so it
 * handed the dead row to `deriveBillingRail`, which correctly answered null —
 * and the client routes null to the paywall. Alice, who is paying us today,
 * taps "Manage subscription" and gets asked to buy Premium.
 *
 * The fixture below is exactly that two-row case, and the fake `findUnique`
 * honours `where`/`orderBy`/`take` so the assertion is about the QUERY, not
 * about which row a mock happened to return first.
 */
describe('UserService.getProfile — the rail comes from the LIVE subscription', () => {
  type Proto = {
    getProfile: (this: unknown, userId: string) => Promise<any>;
  };
  const proto = UserService.prototype as unknown as Proto;

  const USER_ID = 'user-1';

  const rows = [
    {
      // OLDER, and the one that actually bills her.
      createdAt: new Date('2026-01-01'),
      provider: SubscriptionProvider.stripe,
      status: SubscriptionStatus.active,
      planName: 'Premium',
      priceId: null,
      productId: null,
      currentPeriodEnd: null,
    },
    {
      // NEWER, and dead.
      createdAt: new Date('2026-06-01'),
      provider: SubscriptionProvider.revenuecat,
      status: SubscriptionStatus.cancelled,
      planName: null,
      priceId: null,
      productId: null,
      currentPeriodEnd: null,
    },
  ];

  const host = () => ({
    prisma: {
      user: {
        findUnique: (args: any) => {
          const spec = args.include.subscriptions;
          let subs = [...rows];
          const allowed = spec?.where?.status?.in as
            | SubscriptionStatus[]
            | undefined;
          if (allowed) {
            subs = subs.filter((row) => allowed.includes(row.status));
          }
          subs.sort(
            (a, b) =>
              (spec?.orderBy?.createdAt === 'desc' ? -1 : 1) *
              (a.createdAt.getTime() - b.createdAt.getTime()),
          );
          if (typeof spec?.take === 'number') {
            subs = subs.slice(0, spec.take);
          }
          return Promise.resolve({
            userId: USER_ID,
            email: 'alice@example.com',
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: null,
            usernameStatus: 'set',
            lastSignInAt: null,
            subscriptions: subs,
            stats: {},
          });
        },
      },
    },
    userStats: { ensure: jest.fn() },
    entitlements: { summarize: () => Promise.resolve({ active: true }) },
    getOnboardingProfileRow: () => Promise.resolve({}),
    buildOnboardingProfile: () => ({}),
    buildProfileStats: () => Promise.resolve({}),
  });

  it('a NEWER dead row does not hide the live one — the rail is the live rail', async () => {
    // MUTATION: drop the `where: { status: { in: … } }` from the include in
    // user.service.ts and this reds with billingRail null + the cancelled
    // RevenueCat row surfacing as `activeSubscription` — the live defect.
    const profile = await proto.getProfile.call(host(), USER_ID);
    expect(profile.access.billingRail).toBe('web');
    expect(profile.activeSubscription).toEqual(
      expect.objectContaining({
        provider: SubscriptionProvider.stripe,
        status: SubscriptionStatus.active,
      }),
    );
  });
});
