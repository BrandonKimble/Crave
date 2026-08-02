import { SetMetadata, applyDecorators } from '@nestjs/common';
import { SkipThrottle as NestSkipThrottle, Throttle } from '@nestjs/throttler';

/**
 * Rate limit tiers for different endpoint types
 *
 * Usage:
 *   @RateLimitTier('search')
 *   @Post('run')
 *   async run() { ... }
 */
export const RATE_LIMIT_TIER_KEY = 'rate-limit-tier';

export type RateLimitTierName =
  | 'default' // 100 req/min - most endpoints
  | 'search' // 60 req/min - search queries
  | 'naturalSearch' // 30 req/min - LLM-powered search (costs money)
  | 'autocomplete' // 120 req/min - rapid typing
  | 'auth' // 10 req/min - login attempts
  | 'sensitive' // 20 req/min - billing, username claims
  | 'premium' // 300 req/min - premium users
  | 'heavyGeoRead' // 30 req/min - unauthenticated viewport reads
  | 'publicRead' // unauthenticated public reads (share links, teaser)
  | 'webhook'; // vendor callbacks - generous, but never unbounded

const tierLimits: Partial<
  Record<
    RateLimitTierName,
    Record<
      string,
      {
        limit: number;
      }
    >
  >
> = {
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
  premium: {
    short: { limit: 60 },
    medium: { limit: 300 },
    long: { limit: 3000 },
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
export const RateLimitTier = (tier: RateLimitTierName) => {
  const throttlerOptions = tierLimits[tier];
  const decorators: Array<ClassDecorator | MethodDecorator> = [
    SetMetadata(RATE_LIMIT_TIER_KEY, tier),
  ];
  if (throttlerOptions) {
    decorators.push(Throttle(throttlerOptions));
  }
  return applyDecorators(...decorators);
};

/**
 * Skip rate limiting entirely for an endpoint
 * Use for webhooks and health checks
 */
export const SKIP_THROTTLE_KEY = 'skip-throttle';
export const SkipThrottle = () =>
  applyDecorators(NestSkipThrottle(), SetMetadata(SKIP_THROTTLE_KEY, true));
