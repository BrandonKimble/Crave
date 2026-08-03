/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * THE WEB CHECKOUT RAIL (restored 2026-08-03, owner ruling — see
 * business/business-model.md "Margin lever").
 *
 * NO LIVE VENDOR CALLS. The `stripe` module is mocked wholesale: these tests
 * pin OUR semantics (single-product refusal, ledger unification, replay
 * idempotency), not Stripe's.
 */
const stripeMock = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { retrieve: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => stripeMock),
}));

// require() after jest.mock so the stripe mock is in place before the
// service module loads (import hoisting would defeat the mock).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BillingService } = require('./billing.service') as {
  BillingService: typeof import('./billing.service').BillingService;
};

const PRICE = 'price_premium_monthly';

const USER = {
  userId: '11111111-1111-4111-8111-111111111111',
  authProviderUserId: 'user_clerk_1',
  email: 'a@example.com',
  stripeCustomerId: null as string | null,
};

function makeService(
  overrides: {
    config?: Record<string, unknown>;
    user?: Record<string, unknown> | null;
    priorEventStatus?: string | null;
  } = {},
) {
  const config = new Map<string, unknown>(
    Object.entries({
      'stripe.secretKey': 'sk_test_x',
      'stripe.webhookSecret': 'whsec_x',
      'stripe.premiumPriceId': PRICE,
      'stripe.checkoutSuccessUrl': 'https://crave.app/billing/success',
      'stripe.checkoutCancelUrl': 'https://crave.app/billing/cancel',
      'stripe.portalReturnUrl': 'https://crave.app/account',
      'billing.defaultEntitlement': 'premium',
      'revenueCat.entitlementMap': 'premium:premium_monthly',
      ...(overrides.config ?? {}),
    }),
  );
  const prisma = {
    checkoutSession: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    billingEventLog: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.priorEventStatus
            ? { status: overrides.priorEventStatus }
            : null,
        ),
    },
    subscription: { upsert: jest.fn().mockResolvedValue({}) },
    user: {
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides.user === undefined ? USER : overrides.user,
        ),
    },
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const entitlements = {
    syncSubscriptionGrant: jest.fn().mockResolvedValue(undefined),
    revokeBySource: jest.fn().mockResolvedValue(0),
  };
  const service = new BillingService(
    { get: (key: string) => config.get(key) } as never,
    prisma as never,
    logger as never,
    {} as never,
    entitlements as never,
  );
  return { service, prisma, logger, entitlements };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeMock.customers.create.mockResolvedValue({ id: 'cus_1' });
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    expires_at: 1800000000,
  });
  stripeMock.billingPortal.sessions.create.mockResolvedValue({
    url: 'https://billing.stripe.com/p/session/bps_1',
  });
});

describe('createCheckoutSession', () => {
  it('returns the hosted Stripe Checkout URL and logs the attempt', async () => {
    const { service, prisma } = makeService();

    const result = await service.createCheckoutSession(USER, {});

    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(result.sessionId).toBe('cs_test_1');

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.line_items).toEqual([{ price: PRICE, quantity: 1 }]);
    // Redirects come from CONFIG, never the caller (open redirect).
    expect(args.success_url).toBe('https://crave.app/billing/success');
    expect(args.cancel_url).toBe('https://crave.app/billing/cancel');
    // RED IF DROPPED: without subscription_data.metadata, the subscription
    // webhook cannot resolve the user and no grant is ever written.
    expect(args.subscription_data.metadata.user_id).toBe('user_clerk_1');
    expect(args.metadata.entitlement_code).toBe('premium');

    const row = prisma.checkoutSession.create.mock.calls[0][0].data;
    expect(row.userId).toBe(USER.userId);
    expect(row.status).toBe('pending');
    expect(row.externalSessionId).toBe('cs_test_1');
  });

  it('creates the Stripe customer once and remembers it', async () => {
    const { service, prisma } = makeService();
    await service.createCheckoutSession(USER, {});
    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.update.mock.calls[0][0].data.stripeCustomerId).toBe(
      'cus_1',
    );

    jest.clearAllMocks();
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_2',
      url: 'https://checkout.stripe.com/c/pay/cs_2',
    });
    const { service: s2 } = makeService();
    await s2.createCheckoutSession({ ...USER, stripeCustomerId: 'cus_1' }, {});
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
  });

  it('REFUSES a second product — premium is the only thing sold', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.createCheckoutSession(USER, { priceId: 'price_pro_annual' }),
    ).rejects.toThrow(BadRequestException);

    // Refusal is total: nothing was charged and nothing was recorded.
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(prisma.checkoutSession.create).not.toHaveBeenCalled();
  });

  it('accepts the configured price stated explicitly', async () => {
    const { service } = makeService();
    await expect(
      service.createCheckoutSession(USER, { priceId: PRICE }),
    ).resolves.toMatchObject({ sessionId: 'cs_test_1' });
  });

  it('refuses (503) rather than guessing an unconfigured price or redirect', async () => {
    const { service } = makeService({
      config: { 'stripe.premiumPriceId': undefined },
    });
    await expect(service.createCheckoutSession(USER, {})).rejects.toThrow(
      /STRIPE_PREMIUM_PRICE_ID/,
    );
  });
});

describe('createPortalSession', () => {
  it('returns the portal URL with the CONFIGURED return url', async () => {
    const { service } = makeService();
    const result = await service.createPortalSession({
      ...USER,
      stripeCustomerId: 'cus_1',
    });
    expect(result.url).toBe('https://billing.stripe.com/p/session/bps_1');
    expect(
      stripeMock.billingPortal.sessions.create.mock.calls[0][0].return_url,
    ).toBe('https://crave.app/account');
  });

  it('tells an App Store subscriber where to go instead of inventing a customer', async () => {
    const { service } = makeService();
    await expect(service.createPortalSession(USER)).rejects.toThrow(
      BadRequestException,
    );
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('refuses (503) when the return url is unconfigured', async () => {
    const { service } = makeService({
      config: { 'stripe.portalReturnUrl': undefined },
    });
    await expect(
      service.createPortalSession({ ...USER, stripeCustomerId: 'cus_1' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('checkout.session.completed -> the access-grant ledger', () => {
  const completedEvent = {
    id: 'evt_checkout_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        subscription: 'sub_web_1',
        client_reference_id: 'user_clerk_1',
        metadata: { user_id: 'user_clerk_1', entitlement_code: 'premium' },
      },
    },
  };

  const subscription = {
    id: 'sub_web_1',
    status: 'active',
    customer: 'cus_1',
    current_period_start: 1750000000,
    current_period_end: 1752600000,
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { user_id: 'user_clerk_1', entitlement_code: 'premium' },
    items: { data: [{ price: { id: PRICE, product: 'prod_1' } }] },
  };

  beforeEach(() => {
    stripeMock.webhooks.constructEvent.mockReturnValue(completedEvent);
    stripeMock.subscriptions.retrieve.mockResolvedValue(subscription);
  });

  it('grants premium through the ledger and settles the attempt row', async () => {
    const { service, prisma, entitlements } = makeService();

    await service.handleStripeWebhook('sig', Buffer.from('{}'));

    expect(entitlements.syncSubscriptionGrant).toHaveBeenCalledTimes(1);
    const grant = entitlements.syncSubscriptionGrant.mock.calls[0][0];
    expect(grant).toMatchObject({
      userId: USER.userId,
      sourceRef: 'stripe:sub_web_1',
      entitlementCode: 'premium',
      active: true,
    });

    const settle = prisma.checkoutSession.updateMany.mock.calls[0][0];
    expect(settle.where.externalSessionId).toBe('cs_test_1');
    // Replays must not re-stamp a row that is already completed.
    expect(settle.where.status).toEqual({ not: 'completed' });
    expect(settle.data.status).toBe('completed');
  });

  it('is idempotent on REPLAY of the same event id — zero extra grants', async () => {
    // MUTATION PROOF: this is the SAME event id the test above processed.
    // With the exactly-once check removed, syncSubscriptionGrant is called
    // again here and this expectation goes RED.
    const { service, prisma, entitlements } = makeService({
      priorEventStatus: 'processed',
    });

    await service.handleStripeWebhook('sig', Buffer.from('{}'));

    expect(entitlements.syncSubscriptionGrant).not.toHaveBeenCalled();
    expect(prisma.checkoutSession.updateMany).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('grants nothing when a completed session carries no subscription', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      ...completedEvent,
      data: { object: { id: 'cs_test_1', subscription: null, metadata: {} } },
    });
    const { service, entitlements } = makeService();

    await service.handleStripeWebhook('sig', Buffer.from('{}'));

    expect(entitlements.syncSubscriptionGrant).not.toHaveBeenCalled();
  });

  it('REFUSES a subscription naming an entitlement code nothing consults', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      ...subscription,
      metadata: { user_id: 'user_clerk_1', entitlement_code: 'pro' },
    });
    const { service, prisma, entitlements } = makeService();

    await expect(
      service.handleStripeWebhook('sig', Buffer.from('{}')),
    ).rejects.toThrow(/no access check/);

    expect(entitlements.syncSubscriptionGrant).not.toHaveBeenCalled();
    // Recorded as FAILED, so it is findable and Stripe redelivers.
    const logged = prisma.billingEventLog.upsert.mock.calls[0][0];
    expect(JSON.stringify(logged)).toContain('failed');
  });
});
