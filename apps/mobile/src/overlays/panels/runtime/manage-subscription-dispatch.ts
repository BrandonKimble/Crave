import { MANAGE_SUBSCRIPTIONS_URL } from '../../../constants/legalLinks';
import type { AccessSummary } from '../../../services/users';
import { logger } from '../../../utils';

/**
 * "MANAGE SUBSCRIPTION" IS A RAIL QUESTION, and the client cannot answer it.
 *
 * This row used to be one line — `Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)`
 * — which sends EVERY tapper to Apple's subscriptions page. For the ~97%-net
 * Stripe-web rail (dual-rail ruling 2026-08-03) that page is a dead end: the
 * customer has no App Store record, sees an unrelated list, and concludes
 * they cannot cancel. So the server names the rail (`access.billingRail`,
 * derived from the live subscription row) and this dispatches on it:
 *
 *   app_store -> Apple's own in-app manage sheet (StoreKit via RevenueCat),
 *                with the apps.apple.com URL as the out-of-app fallback when
 *                the SDK cannot present it.
 *   web       -> mint a single-use Stripe billing-portal session, open it.
 *   null      -> nothing to manage; show the plans (dismissible paywall).
 *
 * EVERY ARM ENDS IN SOMETHING THE USER SEES. A failed portal fetch announces
 * the failure; it never silently no-ops, which is indistinguishable from a
 * broken tap.
 */
export type BillingRail = NonNullable<AccessSummary['billingRail']>;

export interface ManageSubscriptionDeps {
  /** Apple's in-app sheet; false = could not present. */
  showManageSubscriptions: () => Promise<boolean>;
  /** Mints the Stripe portal session (single-use URL). */
  createPortalSession: () => Promise<{ url: string }>;
  openURL: (url: string) => Promise<unknown>;
  presentPaywall: () => void;
  announceFailure: (options?: { message?: string }) => void;
}

/** The dispatch itself — pure over its deps, so the table is testable
 *  without a simulator. */
export async function runManageSubscriptionAction(
  rail: BillingRail | null | undefined,
  deps: ManageSubscriptionDeps
): Promise<void> {
  if (rail === 'app_store') {
    const shown = await deps.showManageSubscriptions();
    if (!shown) {
      // The SDK could not present it (unlinked native module, or the sheet
      // threw). Apple's web page is the honest fallback — same destination,
      // one hop further.
      await deps.openURL(MANAGE_SUBSCRIPTIONS_URL).catch(() => {
        deps.announceFailure({
          message:
            'We could not open your App Store subscriptions. Try iOS Settings → Apple ID → Subscriptions.',
        });
      });
    }
    return;
  }

  if (rail === 'web') {
    try {
      const { url } = await deps.createPortalSession();
      await deps.openURL(url);
    } catch (error) {
      logger.error('Billing portal session failed', error);
      deps.announceFailure({
        message: 'We could not open your billing portal. Please try again.',
      });
    }
    return;
  }

  if (rail === null || rail === undefined) {
    // No live subscription (never subscribed, lapsed, or on a comp): there is
    // nothing to manage, so show what there IS to buy.
    deps.presentPaywall();
    return;
  }

  // EXHAUSTIVENESS (F9802). The two `if`s above used to end in a bare
  // `presentPaywall()`, so the table's default arm was "anything I don't
  // recognize is a prospect". The day the server learns a third rail, every
  // subscriber on it taps Manage subscription and gets asked to buy what they
  // already own — the paywall failure of F9800/F9801 a third time, and this
  // one would have shipped silently because a string union widens without
  // complaint. `never` makes the omission a COMPILE error instead, which is
  // why the union is single-sourced from @crave-search/shared.
  const unreachable: never = rail;
  logger.error('Unknown billing rail — falling back to the plans', {
    rail: unreachable,
  });
  deps.presentPaywall();
}
