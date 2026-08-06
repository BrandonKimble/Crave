/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

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
type BillingModule = typeof import('./billing.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const billingModule: BillingModule = require('./billing.service');
const { BillingService, ANNUAL_TRIAL_PERIOD_DAYS } = billingModule;

const MONTHLY = 'price_premium_monthly';
const ANNUAL = 'price_premium_annual';

// The service takes a full `User` row; only these four fields are read on
// this path, so the fixture states them and is cast rather than padded with
// fifteen irrelevant columns.
const USER = {
  userId: '11111111-1111-4111-8111-111111111111',
  authProviderUserId: 'user_clerk_1',
  email: 'a@example.com',
  stripeCustomerId: null as string | null,
} as unknown as import('@prisma/client').User;

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
      'stripe.prices.monthly': MONTHLY,
      'stripe.prices.annual': ANNUAL,
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

    const result = await service.createCheckoutSession(USER, {
      plan: 'monthly',
    });

    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(result.sessionId).toBe('cs_test_1');

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    expect(args.line_items).toEqual([{ price: MONTHLY, quantity: 1 }]);
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
    await service.createCheckoutSession(USER, { plan: 'monthly' });
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
    await s2.createCheckoutSession(
      { ...USER, stripeCustomerId: 'cus_1' },
      { plan: 'monthly' },
    );
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
  });

  // THE TWO OFFERS. The owner ruled (2026-08-03) that both paywalls — web and
  // in-app — show the same structure: $7.99/mo with no trial, $39.99/yr with
  // a ~1-week trial. These two tests are that structure, stated as facts.
  it('monthly buys the monthly price with NO trial', async () => {
    const { service } = makeService();
    await service.createCheckoutSession(USER, { plan: 'monthly' });

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items).toEqual([{ price: MONTHLY, quantity: 1 }]);
    // RED IF the trial ever leaks onto monthly: a free week on the $7.99
    // plan is revenue given away that neither paywall promised.
    expect(args.subscription_data.trial_period_days).toBeUndefined();
    expect('trial_period_days' in args.subscription_data).toBe(false);
  });

  it('annual buys the annual price WITH the 7-day trial', async () => {
    const { service } = makeService();
    await service.createCheckoutSession(USER, { plan: 'annual' });

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items).toEqual([{ price: ANNUAL, quantity: 1 }]);
    // RED IF DROPPED: the page promises a free week; a session without the
    // trial charges $39.99 today, to someone who was told otherwise.
    expect(args.subscription_data.trial_period_days).toBe(
      ANNUAL_TRIAL_PERIOD_DAYS,
    );
    // The trial changes the PRICE, never the product: the grant metadata is
    // identical on both plans, so both resolve to the same entitlement.
    expect(args.subscription_data.metadata.entitlement_code).toBe('premium');
  });

  it('refuses (503) rather than guessing an unconfigured price or redirect', async () => {
    const { service } = makeService({
      config: { 'stripe.prices.monthly': undefined },
    });
    await expect(
      service.createCheckoutSession(USER, { plan: 'annual' }),
    ).rejects.toThrow(/STRIPE_MONTHLY_PRICE_ID/);
  });

  it('refuses (503) when the ANNUAL price is unconfigured, even for a monthly buy', async () => {
    // A half-configured rail must fail on the FIRST request, not on the
    // unlucky user who picks the other button.
    const { service } = makeService({
      config: { 'stripe.prices.annual': undefined },
    });
    await expect(
      service.createCheckoutSession(USER, { plan: 'monthly' }),
    ).rejects.toThrow(/STRIPE_ANNUAL_PRICE_ID/);
  });
});

/**
 * THE CLOSED PLAN VOCABULARY (single-product law, 2026-08-03 shape).
 *
 * The old rail enforced "premium is the only product" by comparing a
 * client-supplied price id against the configured one. The vocabulary does it
 * structurally: the caller cannot NAME a Stripe price, so a price outside the
 * configured pair is unrepresentable rather than merely refused. These tests
 * run the real class-validator pipeline, because that is what turns an
 * unknown word into the 400.
 */
describe('CreateCheckoutSessionDto — the plan vocabulary is closed', () => {
  async function validatePlan(body: unknown) {
    return validate(plainToInstance(CreateCheckoutSessionDto, body));
  }

  it.each(['monthly', 'annual'])('accepts %s', async (plan) => {
    expect(await validatePlan({ plan })).toHaveLength(0);
  });

  it.each([
    ['an unknown word', { plan: 'lifetime' }],
    ['a raw Stripe price id', { plan: 'price_premium_monthly' }],
    ['nothing at all', {}],
    ['a non-string', { plan: 7 }],
  ])('refuses %s (400)', async (_label, body) => {
    const errors = await validatePlan(body);
    expect(errors).toHaveLength(1);
    // The refusal NAMES the legal values — a 400 that does not say what is
    // allowed makes the caller guess, and guessing is how the wrong plan
    // gets charged.
    expect(JSON.stringify(errors[0].constraints)).toMatch(/monthly, annual/);
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
    items: { data: [{ price: { id: MONTHLY, product: 'prod_1' } }] },
  };

  beforeEach(() => {
    // THE ARGUMENTS ARE THE THING UNDER TEST (F2183). Doubles that answered
    // any argument left 53/53 billing specs green while the service verified
    // the signature against the WRONG SECRET and retrieved the WRONG
    // SUBSCRIPTION (the session id) — a grant written from someone else's
    // subscription. These fakes key on their input, exactly as Stripe does.
    stripeMock.webhooks.constructEvent.mockImplementation(
      (_payload: unknown, _sig: unknown, secret: string) => {
        if (secret !== 'whsec_x') {
          throw new Error(
            'No signatures found matching the expected signature',
          );
        }
        return completedEvent;
      },
    );
    stripeMock.subscriptions.retrieve.mockImplementation((id: string) => {
      if (id !== 'sub_web_1') {
        return Promise.reject(new Error(`No such subscription: ${id}`));
      }
      return Promise.resolve(subscription);
    });
  });

  it('verifies the signature against the CONFIGURED webhook secret', async () => {
    const { service } = makeService();
    await service.handleStripeWebhook('sig', Buffer.from('{}'));
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
      expect.anything(),
      'sig',
      'whsec_x',
    );
  });

  it("retrieves THE SESSION'S subscription, not some other object id", async () => {
    const { service } = makeService();
    await service.handleStripeWebhook('sig', Buffer.from('{}'));
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_web_1');
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
