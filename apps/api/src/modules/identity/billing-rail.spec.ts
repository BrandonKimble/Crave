import {
  SubscriptionPlatform,
  SubscriptionProvider,
  SubscriptionStatus,
} from '@prisma/client';
import { deriveBillingRail } from './billing-rail';

/**
 * THE RAIL IS A FACT ABOUT WHO TAKES THE MONEY, and the settings row that
 * dispatches on it can strand a paying customer in a dead end when it is
 * wrong. Each case below is a customer who taps "Manage subscription".
 */
describe('deriveBillingRail', () => {
  it('a live Stripe subscription is the WEB rail (the Stripe portal, not Apple)', () => {
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.stripe,
        status: SubscriptionStatus.active,
        platform: SubscriptionPlatform.web,
      }),
    ).toBe('web');
  });

  it('a live RevenueCat subscription is the APP STORE rail', () => {
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.revenuecat,
        status: SubscriptionStatus.active,
        platform: SubscriptionPlatform.ios,
      }),
    ).toBe('app_store');
  });

  it('trialing counts as live on both rails — a trial is cancellable', () => {
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.stripe,
        status: SubscriptionStatus.trialing,
      }),
    ).toBe('web');
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.revenuecat,
        status: SubscriptionStatus.trialing,
      }),
    ).toBe('app_store');
  });

  it('no subscription at all -> null (nothing to manage)', () => {
    expect(deriveBillingRail(null)).toBeNull();
    expect(deriveBillingRail(undefined)).toBeNull();
  });

  it('a cancelled or expired subscription is NOT a rail', () => {
    for (const status of [
      SubscriptionStatus.cancelled,
      SubscriptionStatus.expired,
    ]) {
      expect(
        deriveBillingRail({ provider: SubscriptionProvider.stripe, status }),
      ).toBeNull();
      expect(
        deriveBillingRail({
          provider: SubscriptionProvider.revenuecat,
          status,
        }),
      ).toBeNull();
    }
  });

  it('a manual comp has no self-serve rail unless its platform names one', () => {
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.manual,
        status: SubscriptionStatus.active,
        platform: null,
      }),
    ).toBeNull();
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.manual,
        status: SubscriptionStatus.active,
        platform: SubscriptionPlatform.ios,
      }),
    ).toBe('app_store');
    expect(
      deriveBillingRail({
        provider: SubscriptionProvider.manual,
        status: SubscriptionStatus.active,
        platform: SubscriptionPlatform.web,
      }),
    ).toBe('web');
  });
});
