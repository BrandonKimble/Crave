import { create } from 'zustand';

/**
 * The ONE signal for "the server said ENTITLEMENT_REQUIRED" (the app-wide
 * paywall, hard-paywall model). Announced by the api client's response
 * interceptor; observed by the EntitlementLapseHost in App.tsx, which mounts
 * the paywall as a full-screen takeover. Cleared when server-truth access
 * flips active (post-purchase/restore) — never by user dismissal.
 */
interface EntitlementLapseState {
  lapsed: boolean;
  announceLapse: () => void;
  clearLapse: () => void;
}

export const useEntitlementLapseStore = create<EntitlementLapseState>((set) => ({
  lapsed: false,
  announceLapse: () => set({ lapsed: true }),
  clearLapse: () => set({ lapsed: false }),
}));
