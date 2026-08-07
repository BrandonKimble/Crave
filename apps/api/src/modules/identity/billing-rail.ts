import { SubscriptionProvider, SubscriptionStatus } from '@prisma/client';
import type { SubscriptionPlatform } from '@prisma/client';

/**
 * WHICH RAIL THIS SUBSCRIBER PAYS ON — the one fact the client cannot
 * derive for itself.
 *
 * The access ledger says WHETHER someone has access and WHY (grant source);
 * it says nothing about who takes the money, and the two are deliberately
 * independent (a comp grant has no rail; a Stripe subscriber and an App
 * Store subscriber carry identical ledger rows). "Manage subscription" is a
 * rail question: an App Store subscriber must land on Apple's sheet, a web
 * subscriber on the Stripe portal, and sending either to the other is a dead
 * end.
 *
 * DERIVED, never stored: the truth is the `billing_subscriptions` row's
 * provider/platform pair, read at request time. There is no second source.
 */
export type BillingRail = 'app_store' | 'web';

/** The statuses that still have something to manage. A cancelled/expired
 *  subscription is not a live rail — there is no portal session to open and
 *  no Apple sheet worth showing; that user is a prospect, not a subscriber. */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.active,
  SubscriptionStatus.trialing,
]);

export interface BillingRailInput {
  provider: SubscriptionProvider;
  status: SubscriptionStatus;
  platform?: SubscriptionPlatform | null;
}

/**
 * `null` means "no self-serve rail" — no live subscription at all, or one
 * (a `manual` comp) that no store and no portal can manage. Null is an
 * answer, not a gap: the client routes it to the paywall rather than
 * guessing Apple.
 */
export function deriveBillingRail(
  subscription: BillingRailInput | null | undefined,
): BillingRail | null {
  if (!subscription) return null;
  if (!LIVE_STATUSES.has(subscription.status)) return null;

  switch (subscription.provider) {
    case SubscriptionProvider.stripe:
      return 'web';
    case SubscriptionProvider.revenuecat:
      // RevenueCat is the receipt validator for the STORE rails only; a web
      // purchase never lands here. Platform is advisory, not required.
      return 'app_store';
    case SubscriptionProvider.manual:
      // A manually-created row is whatever it says it is, and says nothing
      // by default — a comp has no billing relationship to manage.
      if (subscription.platform === 'web') return 'web';
      if (
        subscription.platform === 'ios' ||
        subscription.platform === 'android'
      ) {
        return 'app_store';
      }
      return null;
    default:
      return null;
  }
}
