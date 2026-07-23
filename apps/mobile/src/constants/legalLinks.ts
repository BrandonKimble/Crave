/**
 * Shared legal / store-management URLs — consumed by the paywall AND the
 * settings scene (W4). Apple's standard EULA stands in until the landing
 * site ships hosted terms; privacy MUST point at our policy. The manage
 * URL is the MANAGE_IN_APP_STORE path (App Store subscriptions can only
 * be changed/cancelled through iOS).
 */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://craveapp.ai/privacy';
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
