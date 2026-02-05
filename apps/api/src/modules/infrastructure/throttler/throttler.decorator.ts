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
  | 'premium'; // 300 req/min - premium users

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
