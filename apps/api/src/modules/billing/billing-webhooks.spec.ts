/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import type { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';

/**
 * Webhook-hardening contract tests (mocked providers — these pin the
 * SEMANTICS the audit found missing: fail-closed auth, entitlement mapping,
 * failed-event recording, refund revocation, idempotent completion).
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
    billingEventLog: { upsert: jest.fn().mockResolvedValue({}) },
    subscription: {
      upsert: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    checkoutSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
});

describe('Stripe hardening', () => {
  it('charge.refunded revokes subscription grants for the customer', async () => {
    const { service, entitlements } = makeService({
      user: { userId: 'u9' },
    });
    await (
      service as unknown as {
        handleStripeRefund(charge: unknown): Promise<void>;
      }
    ).handleStripeRefund({ id: 'ch_1', customer: 'cus_9' });
    const call = (entitlements.revokeBySource as jest.Mock).mock.calls[0][0];
    expect(call.userId).toBe('u9');
    expect(call.source).toBe('subscription');
  });

  it('checkout completion only transitions non-completed sessions (replay-safe)', async () => {
    const { service, prisma } = makeService();
    await (
      service as unknown as {
        markCheckoutSessionCompleted(session: unknown): Promise<void>;
      }
    ).markCheckoutSessionCompleted({ id: 'cs_1' });
    const where = (prisma.checkoutSession.updateMany as jest.Mock).mock
      .calls[0][0].where;
    expect(where.status).toEqual({ not: 'completed' });
  });
});
