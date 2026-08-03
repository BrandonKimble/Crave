import { ServiceUnavailableException } from '@nestjs/common';
import { BillingService } from './billing.service';
import type { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';
import {
  MalformedEntitlementMapError,
  RevenueCatEntitlementMap,
} from './revenuecat-entitlement-map';

/**
 * F101 / D1 — an unmapped RevenueCat entitlement id can no longer mint a grant.
 *
 * The RED case is the first webhook spec: under `get(raw) ?? raw`, an RC id
 * absent from REVENUECAT_ENTITLEMENT_MAP became our entitlement code and
 * syncSubscriptionGrant wrote a live, PAID grant under vendor vocabulary that
 * accessVerdict() never asks about. The customer paid and then got a 403.
 */

function makeService(entitlementMap: string | undefined) {
  const config = new Map<string, unknown>([
    ['stripe.secretKey', 'sk_test_x'],
    ['revenueCat.webhookSecret', 'rc-secret'],
    ['revenueCat.entitlementMap', entitlementMap],
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
      findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }),
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }),
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
  const entitlements = {
    syncSubscriptionGrant: jest.fn().mockResolvedValue(undefined),
    revokeBySource: jest.fn().mockResolvedValue(1),
  };
  const service = new BillingService(
    { get: (key: string) => config.get(key) } as never,
    prisma as never,
    logger as never,
    {
      lookupUserByAuthIdentifier: jest.fn().mockResolvedValue({ userId: 'u1' }),
    } as never,
    entitlements as never,
  );
  return { service, prisma, entitlements };
}

/** First argument of a jest mock, as an opaque value (the mocks here live in
 *  untyped fixture literals). */
const firstCall = (mock: unknown): unknown => {
  const calls = (mock as jest.Mock).mock.calls as unknown[][];
  return calls[0][0];
};

const rcEvent = (entitlementId: string): RevenueCatWebhookDto =>
  ({
    event: {
      id: 'evt-unmapped-1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'clerk-user-1',
      entitlement_id: entitlementId,
      product_id: 'prod_1',
      transaction_id: 'txn-1',
      expiration_at_ms: Date.now() + 30 * 864e5,
    },
  }) as never;

describe('an unmapped RevenueCat entitlement id cannot mint a grant', () => {
  it('RED — an unmapped id records the event FAILED and RETHROWS (RC redelivers)', async () => {
    const { service, prisma, entitlements } = makeService(
      'premium:premium_monthly',
    );

    await expect(
      service.handleRevenueCatWebhook(
        rcEvent('premium_annual_v2'),
        'Bearer rc-secret',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // THE assertion: no grant, under ANY code.
    expect(entitlements.syncSubscriptionGrant).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();

    // Findable and replayable: the event row is FAILED, naming the vendor id.
    const logged = firstCall(prisma.billingEventLog.upsert);
    expect(JSON.stringify(logged)).toContain(
      'unmapped_entitlement:premium_annual_v2',
    );
  });

  it('an UNSET map translates nothing — every RC id is unknown, none is guessed', async () => {
    const { service, entitlements } = makeService(undefined);
    await expect(
      service.handleRevenueCatWebhook(
        rcEvent('premium_monthly'),
        'Bearer rc-secret',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(entitlements.syncSubscriptionGrant).not.toHaveBeenCalled();
  });

  it('a MAPPED id still grants, under OUR code', async () => {
    const { service, entitlements } = makeService('premium:premium_monthly');
    await service.handleRevenueCatWebhook(
      rcEvent('premium_monthly'),
      'Bearer rc-secret',
    );
    const call = firstCall(entitlements.syncSubscriptionGrant) as {
      entitlementCode: string;
    };
    expect(call.entitlementCode).toBe('premium');
  });
});

describe('RevenueCatEntitlementMap parses strictly', () => {
  it('unset / empty is legal and maps nothing', () => {
    for (const raw of [undefined, '', '  ', ',,']) {
      const map = RevenueCatEntitlementMap.parse(raw, 'premium');
      expect(map.translate('anything')).toEqual({
        kind: 'unknown',
        vendorEntitlementId: 'anything',
      });
      expect([...map.entitlementCodes]).toEqual(['premium']);
    }
  });

  it('a malformed entry REFUSES (boot), naming the entry', () => {
    for (const raw of [
      'premium',
      'premium:',
      ':rc_id',
      'a:b:c',
      'premium:  ',
    ]) {
      expect(() => RevenueCatEntitlementMap.parse(raw, 'premium')).toThrow(
        MalformedEntitlementMapError,
      );
    }
  });

  it('one vendor id mapping to two of our codes REFUSES', () => {
    expect(() =>
      RevenueCatEntitlementMap.parse('premium:rc1,plus:rc1', 'premium'),
    ).toThrow(MalformedEntitlementMapError);
  });
});

/**
 * D1-residual, owner-ruled 2026-08-03: premium is the only product, ever.
 * accessVerdict() consults ONLY the default code, so a map entry under any
 * other code mints a paid grant that grants nothing. Boot refuses it.
 *
 * RED PROOF: before this refusal, `parse('premium:rc_month, plus:rc_plus')`
 * succeeded and `entitlementCodes` was `['plus','premium']` — the first case
 * below is exactly that input, and it now throws.
 */
describe('boot refuses an entitlement code no access check consults', () => {
  it('REFUSES a non-default code, naming the code and the single-product law', () => {
    expect(() =>
      RevenueCatEntitlementMap.parse(
        'premium:rc_month, plus:rc_plus',
        'premium',
      ),
    ).toThrow(MalformedEntitlementMapError);

    let message = '';
    try {
      RevenueCatEntitlementMap.parse('plus:rc_plus', 'premium');
    } catch (error) {
      message = (error as Error).message;
    }
    // The message must name the offending code, the code that IS consulted,
    // and why an unconsulted code is not a runnable state.
    expect(message).toContain('"plus"');
    expect(message).toContain('"premium"');
    expect(message).toContain('accessVerdict()');
    expect(message).toContain('Premium is the only product');
  });

  it('HAPPY PATH — a map declaring only the default code parses, and the closed vocabulary is that one code', () => {
    const map = RevenueCatEntitlementMap.parse(
      'premium:rc_month, premium:rc_year',
      'premium',
    );
    expect([...map.entitlementCodes]).toEqual(['premium']);
    expect(map.isKnownCode('premium')).toBe(true);
    expect(map.isKnownCode('rc_month')).toBe(false);
    expect(map.translate('rc_year')).toEqual({
      kind: 'mapped',
      entitlementCode: 'premium',
    });
  });

  it('the default code is whatever config says — the refusal is relative to it, not to the literal "premium"', () => {
    const map = RevenueCatEntitlementMap.parse('pro:rc_pro', 'pro');
    expect(map.isKnownCode('pro')).toBe(true);
    expect(() =>
      RevenueCatEntitlementMap.parse('premium:rc_month', 'pro'),
    ).toThrow(MalformedEntitlementMapError);
  });

  it('a mapped id yields OUR code; anything else is `unknown` — there is no third answer', () => {
    const map = RevenueCatEntitlementMap.parse('premium:rc_month', 'premium');
    expect(map.translate('rc_month')).toEqual({
      kind: 'mapped',
      entitlementCode: 'premium',
    });
    expect(map.translate('rc_year')).toEqual({
      kind: 'unknown',
      vendorEntitlementId: 'rc_year',
    });
  });
});
