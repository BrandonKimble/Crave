import React from 'react';
import { Linking } from 'react-native';

import { announceFailureIfOnline } from '../../../components/app-modal-store';
import { billingService } from '../../../services/billing';
import { showManageSubscriptions } from '../../../services/purchases';
import { usePaywallPresentationStore } from '../../../store/paywallPresentationStore';
import type { AccessSummary } from '../../../services/users';
import { runManageSubscriptionAction } from './manage-subscription-dispatch';

export type { BillingRail, ManageSubscriptionDeps } from './manage-subscription-dispatch';
export { runManageSubscriptionAction } from './manage-subscription-dispatch';

/**
 * The row's real wiring. THE DISPATCH ITSELF lives in the leaf module
 * `manage-subscription-dispatch.ts` — it imports no native module and no
 * store, which is what lets the rail table be unit-tested at all (this file
 * pulls in axios/StoreKit/zustand the moment it loads).
 */
/** Bound to the real rails. `billingRail` comes from the server access
 *  block — pass it straight through, undefined included (an unknown rail is
 *  not App Store by default; it routes to the plans). */
export const useManageSubscriptionAction = (
  billingRail: AccessSummary['billingRail']
): (() => void) => {
  const presentPaywall = usePaywallPresentationStore((state) => state.presentPaywall);

  return React.useCallback(() => {
    void runManageSubscriptionAction(billingRail, {
      showManageSubscriptions,
      createPortalSession: () => billingService.createPortalSession(),
      openURL: (url: string) => Linking.openURL(url),
      presentPaywall,
      announceFailure: announceFailureIfOnline,
    });
  }, [billingRail, presentPaywall]);
};
