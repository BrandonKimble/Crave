/**
 * Shared legal / store-management URLs — consumed by the paywall, the
 * settings scene (W4), and onboarding. Both terms and privacy are hosted
 * on the landing site.
 *
 * MANAGE_SUBSCRIPTIONS_URL is APPLE'S page, and it is no longer the answer to
 * "manage my subscription" — that question is RAIL-DEPENDENT and is answered
 * by `runManageSubscriptionAction` (overlays/panels/runtime/
 * manage-subscription-dispatch.ts) off the server's `access.billingRail`.
 * Two legitimate consumers remain:
 *   1. the paywall's Apple 3.1.2 disclosure row — a pre-subscription "manage"
 *      link Apple requires to be reachable, where the tapper by definition has
 *      no rail yet;
 *   2. the app_store arm's out-of-app fallback when the in-app StoreKit sheet
 *      cannot be presented.
 * Do NOT reintroduce it as a settings destination.
 */
export const TERMS_URL = 'https://craveapp.ai/terms';
export const PRIVACY_URL = 'https://craveapp.ai/privacy';
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
