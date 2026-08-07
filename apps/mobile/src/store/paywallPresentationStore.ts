import { create } from 'zustand';

/**
 * The DISMISSIBLE paywall — the one a user ASKED for.
 *
 * Distinct from `entitlementLapseStore` on purpose, and the difference is the
 * whole point: the lapse wall is announced by the server (403
 * ENTITLEMENT_REQUIRED) and is NON-dismissible, because the app has nothing
 * to show someone with no access. This one is opened by a deliberate tap
 * (settings → "Manage subscription" with no subscription to manage), so it
 * closes on "Not now". Folding the two together would have trapped a curious
 * trial user behind a wall they never hit.
 */
interface PaywallPresentationState {
  visible: boolean;
  presentPaywall: () => void;
  dismissPaywall: () => void;
}

export const usePaywallPresentationStore = create<PaywallPresentationState>((set) => ({
  visible: false,
  presentPaywall: () => set({ visible: true }),
  dismissPaywall: () => set({ visible: false }),
}));
