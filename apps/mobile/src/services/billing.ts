import api from './api';

/**
 * The WEB rail's management surface: the Stripe-hosted billing portal
 * (change card, cancel, invoices).
 *
 * The session is minted server-side for the authenticated caller and the
 * return URL comes from server config — this call takes NO body on purpose
 * (a caller-supplied return URL is an open redirect; see the api's
 * billing.controller `portal-session`).
 *
 * A single-use URL: mint one per tap, never cache it.
 */
export const billingService = {
  async createPortalSession(): Promise<{ url: string }> {
    const response = await api.post<{ url: string }>('/billing/portal-session');
    return response.data;
  },
};
