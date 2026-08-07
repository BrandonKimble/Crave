/**
 * THE SITE'S ENTIRE ENV CONTRACT. Three vars, none of them secret.
 *
 * The site is a PUBLIC surface: it never holds a Stripe key, a Clerk secret
 * key, or a database URL. Every privileged act (creating the Checkout
 * session, choosing the price, choosing the redirect URLs, granting
 * entitlements) happens in the api. The site's only job is: sign the visitor
 * in with Clerk, hand the api a bearer token, and follow the URL it returns.
 *
 * A missing value is reported, never defaulted into a plausible-looking
 * guess — a guessed API origin points checkout at nothing, and a guessed
 * publishable key points sign-in at the wrong Clerk instance. `/premium`
 * refuses (503) and names what is missing; the four static pages keep
 * serving, because a landing page has no reason to go down over a billing
 * misconfiguration.
 */
export interface SiteConfig {
  /** Origin of the api, WITHOUT the `/api/v1` prefix (the site adds it). */
  apiOrigin: string | null;
  /** Clerk's `pk_test_…` / `pk_live_…`. Safe in client code by design. */
  clerkPublishableKey: string | null;
  /**
   * Clerk JWT TEMPLATE name used to mint the bearer the api verifies.
   *
   * NOT cosmetic: `ClerkAuthService` validates `aud` against
   * `CLERK_JWT_AUDIENCE` and REFUSES a token whose audience is not in that
   * list (absence of configuration never grants access). The mobile app
   * calls `getToken({ template: 'mobile' })`, so 'mobile' is the one
   * template known to produce an accepted audience today. Point this at a
   * dedicated 'web' template only after that template's `aud` has been
   * added to the api's CLERK_JWT_AUDIENCE.
   */
  clerkJwtTemplate: string;
  port: number;
}

export const DEFAULT_PORT = 8080;
/** Matches apps/mobile/src/providers/AuthProvider.tsx. See the field doc. */
export const DEFAULT_CLERK_JWT_TEMPLATE = 'mobile';

function trimmed(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

export function readConfig(env: Record<string, string | undefined>): SiteConfig {
  const apiOrigin = trimmed(env.API_ORIGIN);
  return {
    // Trailing slashes make `${origin}/api/v1/...` into a double slash, which
    // some proxies 301 and browsers then re-POST as GET. Normalize once.
    apiOrigin: apiOrigin ? apiOrigin.replace(/\/+$/, '') : null,
    clerkPublishableKey: trimmed(env.CLERK_PUBLISHABLE_KEY),
    clerkJwtTemplate: trimmed(env.CLERK_JWT_TEMPLATE) ?? DEFAULT_CLERK_JWT_TEMPLATE,
    port: Number.parseInt(env.PORT ?? '', 10) || DEFAULT_PORT,
  };
}

/**
 * A `SiteConfig` proven to have the two fields `/premium` cannot render without.
 * Carrying the narrowing in the TYPE (not just a runtime check) is what lets
 * `renderPremium` drop its `as string` casts: the only way to obtain this type is
 * through `checkoutConfig`, which cannot return it without both fields present.
 */
export type ReadyCheckoutConfig = SiteConfig & {
  apiOrigin: string;
  clerkPublishableKey: string;
};

/**
 * The single narrowing point for `/premium`. Either the config is ready (and the
 * caller gets a `ReadyCheckoutConfig` it can hand straight to `renderPremium`), or
 * it names what is missing (for the 503 page). Removing the ready-branch guard at
 * a caller now fails tsc — `renderPremium` no longer accepts a raw `SiteConfig` —
 * where the old `as string` casts let a null sail through to the boot script.
 */
export type CheckoutConfigResult =
  | { ready: true; config: ReadyCheckoutConfig }
  | { ready: false; missing: string[] };

export function checkoutConfig(config: SiteConfig): CheckoutConfigResult {
  const missing = [
    config.apiOrigin ? null : 'API_ORIGIN',
    config.clerkPublishableKey ? null : 'CLERK_PUBLISHABLE_KEY',
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return { ready: false, missing };
  }
  // The filter above proves both fields are non-null; TS cannot narrow object
  // fields from an array result, so this is the ONE guarded cast — justified in
  // place, rather than two unguarded casts at the far-away use site.
  return { ready: true, config: config as ReadyCheckoutConfig };
}

/** The env var names missing for `/premium` to work — empty means ready. */
export function missingCheckoutConfig(config: SiteConfig): string[] {
  const result = checkoutConfig(config);
  return result.ready ? [] : result.missing;
}
