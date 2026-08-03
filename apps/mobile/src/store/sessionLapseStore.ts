import { create } from 'zustand';

/**
 * THE ONE SIGNAL FOR "the server said 401" (F804).
 *
 * The api client had no 401 branch at all: an expired or revoked Clerk session
 * — or a token resolver that threw, which `getAuthToken` swallows into `null` —
 * produced a 401 that fell through to the generic failure modal, and the app
 * then kept making UNAUTHENTICATED requests forever. No sign-out, no re-auth
 * prompt: it silently degraded to anonymous while still looking signed in. The
 * case was never written; nothing compensated for it.
 *
 * So an expired session is now an EXPLICIT STATE, exactly the shape
 * `entitlementLapseStore` already uses for the entitlement wall: the api
 * client's response interceptor is the ONE announcer (one chokepoint, not a
 * per-caller convention), and the route coordinator observes it and routes to
 * sign-in. Clerk still owns refresh; this store owns "the refresh failed, now
 * what" — the part that belongs to the client.
 *
 * Cleared when a real session exists again (Clerk reports signed-out, or a new
 * sign-in lands) — never by user dismissal, because the user cannot make a dead
 * token live by tapping something.
 */
interface SessionLapseState {
  lapsed: boolean;
  announceLapse: () => void;
  clearLapse: () => void;
}

export const useSessionLapseStore = create<SessionLapseState>((set) => ({
  lapsed: false,
  announceLapse: () => set({ lapsed: true }),
  clearLapse: () => set({ lapsed: false }),
}));
