/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import type { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';
import { revenueCatEventIdentity } from './webhook-event-identity';

/**
 * Webhook-hardening contract tests (mocked providers — these pin the
 * SEMANTICS the audit found missing: fail-closed auth, entitlement mapping,
 * failed-event recording, refund revocation, replay idempotency).
 */
function makeService(overrides?: {
  webhookSecret?: string | null;
  entitlementMap?: string;
  user?: { userId: string } | null;
}) {
  const config = new Map<string, unknown>([
    ['stripe.secretKey', 'sk_test_x'],
    [
      'revenueCat.webhookSecret',
      overrides && 'webhookSecret' in overrides
        ? overrides.webhookSecret
        : 'rc-secret',
    ],
    ['revenueCat.entitlementMap', overrides?.entitlementMap ?? ''],
    ['billing.defaultEntitlement', 'premium'],
  ]);
  const prisma = {
    billingEventLog: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    subscription: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(overrides?.user ?? null),
      findUnique: jest.fn().mockResolvedValue(overrides?.user ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const userService = {
    lookupUserByAuthIdentifier: jest
      .fn()
      .mockResolvedValue(overrides?.user ?? null),
  };
  const entitlements = {
    syncSubscriptionGrant: jest.fn().mockResolvedValue(undefined),
    revokeBySource: jest.fn().mockResolvedValue(1),
  };
  const service = new BillingService(
    { get: (key: string) => config.get(key) } as never,
    prisma as never,
    logger as never,
    userService as never,
    entitlements as never,
  );
  return { service, prisma, logger, userService, entitlements };
}

const rcEvent = (over: Record<string, unknown> = {}): RevenueCatWebhookDto =>
  ({
    event: {
      id: 'evt-1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'clerk-user-1',
      entitlement_id: 'premium_monthly',
      product_id: 'prod_1',
      transaction_id: 'txn-1',
      expiration_at_ms: Date.now() + 30 * 864e5,
      ...over,
    },
  }) as never;

describe('RevenueCat webhook hardening', () => {
  it('fails CLOSED when no webhook secret is configured', async () => {
    const { service } = makeService({ webhookSecret: null });
    await expect(
      service.handleRevenueCatWebhook(rcEvent(), 'Bearer anything'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects a wrong bearer token', async () => {
    const { service } = makeService();
    await expect(
      service.handleRevenueCatWebhook(rcEvent(), 'Bearer wrong'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('applies the entitlement map (rc id -> our code)', async () => {
    const { service, entitlements } = makeService({
      entitlementMap: 'premium:premium_monthly',
      user: { userId: 'u1' },
    });
    await service.handleRevenueCatWebhook(rcEvent(), 'Bearer rc-secret');
    const call = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(call.entitlementCode).toBe('premium');
    expect(call.active).toBe(true);
    expect(call.sourceRef).toContain('revenuecat:');
  });

  it('records a FAILED event (not silence) when no user matches', async () => {
    const { service, prisma, entitlements } = makeService({ user: null });
    await service.handleRevenueCatWebhook(rcEvent(), 'Bearer rc-secret');
    const upserts = (prisma.billingEventLog.upsert as jest.Mock).mock.calls;
    const failed = upserts.find(([args]) => args.create?.status === 'failed');
    expect(failed).toBeDefined();
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('TEST events are logged but never write a subscription or grant', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    await service.handleRevenueCatWebhook(
      rcEvent({ type: 'TEST', transaction_id: undefined }),
      'Bearer rc-secret',
    );
    expect(
      (prisma.billingEventLog.upsert as jest.Mock).mock.calls,
    ).toHaveLength(1);
    expect((prisma.subscription.upsert as jest.Mock).mock.calls).toHaveLength(
      0,
    );
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('prefers entitlement_ids[] over legacy entitlement_id and sets both period bounds', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    const purchasedAt = Date.now() - 1000;
    await service.handleRevenueCatWebhook(
      rcEvent({
        entitlement_id: undefined,
        entitlement_ids: ['premium'],
        purchased_at_ms: purchasedAt,
      }),
      'Bearer rc-secret',
    );
    const grant = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(grant.entitlementCode).toBe('premium');
    const sub = (prisma.subscription.upsert as jest.Mock).mock.calls[0][0];
    // billing_subscriptions check constraint: start+end together or neither
    expect(sub.create.currentPeriodStart).toEqual(new Date(purchasedAt));
    expect(sub.create.currentPeriodEnd).not.toBeNull();
  });

  it('marks the event row failed and rethrows when processing throws (RC retries on 5xx)', async () => {
    const { service, prisma } = makeService({ user: { userId: 'u1' } });
    (prisma.subscription.upsert as jest.Mock).mockRejectedValueOnce(
      new Error('constraint violation'),
    );
    await expect(
      service.handleRevenueCatWebhook(rcEvent(), 'Bearer rc-secret'),
    ).rejects.toThrow('constraint violation');
    const upserts = (prisma.billingEventLog.upsert as jest.Mock).mock.calls;
    const failed = upserts.find(([args]) => args.create?.status === 'failed');
    expect(failed).toBeDefined();
  });

  it('CANCELLATION with time left KEEPS access until expiry (auto-renew off ≠ revoke)', async () => {
    const { service, entitlements } = makeService({ user: { userId: 'u1' } });
    await service.handleRevenueCatWebhook(
      rcEvent({ type: 'CANCELLATION' }),
      'Bearer rc-secret',
    );
    const call = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(call.active).toBe(true); // grant rides to expiration_at_ms
  });

  it('UNCANCELLATION re-activates (never string-matches "cancel")', async () => {
    const { service, entitlements } = makeService({ user: { userId: 'u1' } });
    await service.handleRevenueCatWebhook(
      rcEvent({ type: 'UNCANCELLATION' }),
      'Bearer rc-secret',
    );
    const call = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(call.active).toBe(true);
  });

  it('EXPIRATION ends access even with a residual future expiry field', async () => {
    const { service, entitlements } = makeService({ user: { userId: 'u1' } });
    await service.handleRevenueCatWebhook(
      rcEvent({ type: 'EXPIRATION' }),
      'Bearer rc-secret',
    );
    const call = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(call.active).toBe(false);
  });

  it('trial purchases carry trialing status and still grant access', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    await service.handleRevenueCatWebhook(
      rcEvent({ period_type: 'TRIAL' }),
      'Bearer rc-secret',
    );
    const sub = (prisma.subscription.upsert as jest.Mock).mock.calls[0][0];
    expect(sub.create.status).toBe('trialing');
    const grant = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(grant.active).toBe(true);
  });

  it('unknown event types never touch grants (logged and skipped)', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    await service.handleRevenueCatWebhook(
      rcEvent({ type: 'INVOICE_ISSUANCE' }),
      'Bearer rc-secret',
    );
    expect((prisma.subscription.upsert as jest.Mock).mock.calls).toHaveLength(
      0,
    );
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
    expect(
      (prisma.billingEventLog.upsert as jest.Mock).mock.calls,
    ).toHaveLength(1);
  });

  it('a stale retry (older event_timestamp_ms than applied) is skipped', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      metadata: { event: { event_timestamp_ms: 2_000_000 } },
    });
    await service.handleRevenueCatWebhook(
      rcEvent({ event_timestamp_ms: 1_000_000 }),
      'Bearer rc-secret',
    );
    expect((prisma.subscription.upsert as jest.Mock).mock.calls).toHaveLength(
      0,
    );
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('an already-processed event id is an ack, not a reapply', async () => {
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    (prisma.billingEventLog.findUnique as jest.Mock).mockResolvedValue({
      status: 'processed',
    });
    await service.handleRevenueCatWebhook(rcEvent(), 'Bearer rc-secret');
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('TRANSFER revokes the losing account (scoped to revenuecat refs)', async () => {
    const { service, entitlements } = makeService({ user: { userId: 'uOld' } });
    await service.handleRevenueCatWebhook(
      rcEvent({
        type: 'TRANSFER',
        transferred_from: ['clerk-old'],
        transferred_to: [],
        app_user_id: undefined,
        expiration_at_ms: undefined,
      }),
      'Bearer rc-secret',
    );
    const call = (entitlements.revokeBySource as jest.Mock).mock.calls[0][0];
    expect(call.userId).toBe('uOld');
    expect(call.sourceRefPrefix).toBe('revenuecat:');
    // and no grant is minted from the transfer payload itself
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(0);
  });

  it('expired events deactivate the grant', async () => {
    const { service, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    await service.handleRevenueCatWebhook(
      rcEvent({ expiration_at_ms: Date.now() - 1000 }),
      'Bearer rc-secret',
    );
    const call = (entitlements.syncSubscriptionGrant as jest.Mock).mock
      .calls[0][0];
    expect(call.active).toBe(false);
  });

  it('an id-less event REPLAYED is applied exactly once (content-hash identity)', async () => {
    // THE DEFECT: externalId used to end `|| `${Date.now()}``, so an event
    // carrying no vendor id got a FRESH key on every delivery, the replay
    // lookup could never match, and RC's retries re-applied it.
    const { service, prisma, entitlements } = makeService({
      user: { userId: 'u1' },
    });
    // Stateful event log: what the real unique index does.
    const seen = new Map<string, { status: string }>();
    (prisma.billingEventLog.findUnique as jest.Mock).mockImplementation(
      ({ where }: any) =>
        Promise.resolve(
          seen.get(where.source_externalEventId.externalEventId) ?? null,
        ),
    );
    (prisma.billingEventLog.upsert as jest.Mock).mockImplementation(
      ({ create }: any) => {
        seen.set(create.externalEventId, { status: create.status });
        return Promise.resolve({});
      },
    );

    const idless = rcEvent({
      id: undefined,
      transaction_id: undefined,
      original_transaction_id: undefined,
      expiration_at_ms: 1900000000000,
    });
    await service.handleRevenueCatWebhook(idless, 'Bearer rc-secret');
    // The redelivery arrives LATER — the one fact the old synthetic key made
    // load-bearing. Identity must not depend on it.
    const realNow = Date.now;
    Date.now = () => realNow() + 5_000;
    try {
      await service.handleRevenueCatWebhook(idless, 'Bearer rc-secret');
    } finally {
      Date.now = realNow;
    }

    expect(seen.size).toBe(1);
    expect([...seen.keys()][0]).toMatch(/^content:[0-9a-f]{64}$/);
    expect(
      (entitlements.syncSubscriptionGrant as jest.Mock).mock.calls,
    ).toHaveLength(1);
  });

  it('MUTATION — the deleted Date.now() branch would have applied the dup twice', () => {
    // The shadow of the old code. Two deliveries of the SAME id-less payload,
    // milliseconds apart, produce two different keys — so the exactly-once
    // lookup provably cannot match and the grant lands twice.
    const idless = rcEvent({
      id: undefined,
      transaction_id: undefined,
      original_transaction_id: undefined,
    }) as unknown as { event: Record<string, string | undefined> };
    const oldKey = (e: { event: Record<string, string | undefined> }): string =>
      e.event.id ||
      e.event.original_transaction_id ||
      e.event.transaction_id ||
      `${Date.now()}`;
    const a = oldKey(idless);
    // Advance the clock by a single millisecond — that is all a redelivery
    // needs to look brand new.
    const realNow = Date.now;
    Date.now = () => realNow() + 1;
    const b = oldKey(idless);
    Date.now = realNow;
    expect(a).not.toBe(b); // <- the duplicate would land

    // The rederived identity is stable across the same clock move.
    Date.now = () => realNow() + 1;
    const stable = revenueCatEventIdentity(idless.event);
    Date.now = realNow;
    expect(stable).toBe(revenueCatEventIdentity(idless.event));
  });
});

describe('revenueCatEventIdentity', () => {
  it('prefers the vendor event id', () => {
    expect(revenueCatEventIdentity({ id: 'evt-9', transaction_id: 't' })).toBe(
      'evt-9',
    );
  });

  it('falls back to transaction ids before hashing', () => {
    expect(revenueCatEventIdentity({ original_transaction_id: 'otxn-3' })).toBe(
      'otxn-3',
    );
    expect(revenueCatEventIdentity({ transaction_id: 'txn-3' })).toBe('txn-3');
  });

  it('key order in the payload does not change the hash', () => {
    const a = revenueCatEventIdentity({
      type: 'RENEWAL',
      app_user_id: 'u1',
      product_id: 'p1',
    });
    const b = revenueCatEventIdentity({
      product_id: 'p1',
      app_user_id: 'u1',
      type: 'RENEWAL',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^content:/);
  });

  it('genuinely different events do not collide', () => {
    expect(
      revenueCatEventIdentity({ type: 'RENEWAL', app_user_id: 'u1' }),
    ).not.toBe(revenueCatEventIdentity({ type: 'RENEWAL', app_user_id: 'u2' }));
  });
});

describe('Stripe hardening', () => {
  it('PARTIAL refunds and non-invoice charges never touch access', async () => {
    const { service, entitlements } = makeService({ user: { userId: 'u9' } });
    const svc = service as unknown as {
      handleStripeRefund(charge: unknown): Promise<void>;
    };
    await svc.handleStripeRefund({
      id: 'ch_partial',
      customer: 'cus_9',
      refunded: false, // partial
      invoice: { id: 'in_1', subscription: 'sub_9' },
    });
    await svc.handleStripeRefund({
      id: 'ch_oneoff',
      customer: 'cus_9',
      refunded: true,
      invoice: null, // not a subscription invoice
    });
    expect((entitlements.revokeBySource as jest.Mock).mock.calls).toHaveLength(
      0,
    );
  });

  it('charge.refunded revokes subscription grants for the customer', async () => {
    const { service, entitlements } = makeService({
      user: { userId: 'u9' },
    });
    await (
      service as unknown as {
        handleStripeRefund(charge: unknown): Promise<void>;
      }
    ).handleStripeRefund({
      id: 'ch_1',
      customer: 'cus_9',
      refunded: true,
      invoice: { id: 'in_1', subscription: 'sub_9' },
    });
    expect(
      (entitlements.revokeBySource as jest.Mock).mock.calls[0][0].sourceRef,
    ).toBe('stripe:sub_9');
    const call = (entitlements.revokeBySource as jest.Mock).mock.calls[0][0];
    expect(call.userId).toBe('u9');
    expect(call.source).toBe('subscription');
  });
});
