import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Rate limit tiers for different endpoint types
 *
 * Usage:
 *   @RateLimitTier('search')
 *   @Post('run')
 *   async run() { ... }
 *
 * EVERY TIER APPLIES A CEILING (2026-08-02). `default` used to be a member of
 * the union with NO entry in the table below, so `@RateLimitTier('default')`
 * pushed no `Throttle()` at all: it set metadata nobody read and let the route
 * fall through to the global windows. The annotation read as a decision that
 * had in fact never been applied, and the day someone added a `default` entry
 * four routes would have changed ceiling silently. `default` now carries the
 * global window values explicitly, so a route's ceiling is readable AT the
 * route rather than in a config file the reader has to go find.
 *
 * (Superseded 2026-08-03: 'default' now applies no override — see the
 * decorator. Stale half of this paragraph kept out; the rest stands.)
 * Trade recorded deliberately: these are literals, so the `default` tier no
 * longer tracks the THROTTLER_*_LIMIT env vars. That is the point — a route
 * that names its tier states its ceiling. The global windows (which still
 * govern every UNannotated route) remain env-driven in config/configuration.ts,
 * and throttler.module.ts asserts at boot that they are well-formed.
 */
export type RateLimitTierName =
  | 'default' // most endpoints: the global windows, stated
  | 'search' // search queries
  | 'naturalSearch' // LLM-powered search (costs money)
  | 'autocomplete' // rapid typing
  | 'auth' // login attempts
  | 'sensitive' // billing, username claims
  | 'heavyGeoRead' // unauthenticated viewport reads
  | 'publicRead' // unauthenticated public reads (share links, teaser)
  | 'webhook'; // vendor callbacks - generous, but never unbounded

const tierLimits: Record<
  Exclude<RateLimitTierName, 'default'>,
  Record<
    string,
    {
      limit: number;
    }
  >
> = {
  // The global windows, restated so an annotated route is never a mystery.
  // These MUST equal config/configuration.ts's throttler defaults; the pair is
  // asserted by throttler-tiers.spec.ts.
  // Keeps the app responsive during fast scrolling/pagination.
  search: {
    short: { limit: 25 },
    medium: { limit: 120 },
    long: { limit: 1200 },
  },
  // LLM-backed search is more expensive; allow reasonable bursts but cap sustained usage.
  naturalSearch: {
    short: { limit: 10 },
    medium: { limit: 30 },
    long: { limit: 120 },
  },
  // Typing can generate bursts of requests; allow higher short/medium windows.
  autocomplete: {
    short: { limit: 50 },
    medium: { limit: 200 },
    long: { limit: 1200 },
  },
  // Conservative defaults for abuse-prone endpoints.
  auth: {
    short: { limit: 5 },
    medium: { limit: 15 },
    long: { limit: 60 },
  },
  sensitive: {
    short: { limit: 5 },
    medium: { limit: 15 },
    long: { limit: 60 },
  },
  // Abuse audit 2026-08-01: a viewport read clips and serializes every
  // ground touching the view. It is reachable UNAUTHENTICATED (IP-tracked)
  // on the polls feed, and a world-span box costs ~200ms of Postgres and a
  // multi-MB payload even after the candidate cap. The map only ever moves
  // at human speed, so a human never notices this ceiling and a script hits
  // it immediately. What changes it: a measured legitimate burst, never
  // tuning.
  heavyGeoRead: {
    short: { limit: 5 },
    medium: { limit: 15 },
    long: { limit: 30 },
  },
  // Unauthenticated, pre-auth public reads (share links, the onboarding
  // teaser). They touch Postgres, so "no auth" cannot also mean "no
  // ceiling" — but a real person opening a shared list bursts a handful of
  // requests, never dozens.
  publicRead: {
    short: { limit: 10 },
    medium: { limit: 40 },
    long: { limit: 120 },
  },
  // Vendor callbacks (Stripe, RevenueCat, Cloudinary). These used to skip
  // rate limiting ENTIRELY, which made every invalid-signature request a
  // free crypto verify plus a DB lookup — an unauthenticated CPU burn with
  // no ceiling at all. The limit is set far above any real vendor delivery
  // rate: it exists to stop a flood from one source, not to shape traffic.
  // Vendors retry on 429, so the failure mode is delay, not lost events.
  webhook: {
    short: { limit: 50 },
    medium: { limit: 300 },
    long: { limit: 2000 },
  },
};

/**
 * Decorator to apply a specific rate limit tier to an endpoint
 *
 * @example
 * ```typescript
 * @RateLimitTier('naturalSearch')
 * @Post('natural')
 * async runNatural() { ... }
 * ```
 */
export const RateLimitTier = (tier: RateLimitTierName) =>
  // 'default' applies NO override — it defers to ThrottlerModule's global
  // windows, which are ENV-GOVERNED (prod runs 3/20/120, not the config
  // literals; verified 2026-08-03). Copying literals here would silently
  // divorce those routes from the env the moment ops changed it. The
  // annotation stays honest: it documents "this route uses the global
  // tier" without restating numbers it doesn't own.
  tier === 'default'
    ? applyDecorators()
    : applyDecorators(Throttle(tierLimits[tier]));

/** Exported for the tier/config agreement spec. Not for runtime use. */
export const rateLimitTierLimitsForSpec = tierLimits;
