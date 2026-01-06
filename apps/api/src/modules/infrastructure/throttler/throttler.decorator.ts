import { SetMetadata } from '@nestjs/common';

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
  | 'default'      // 100 req/min - most endpoints
  | 'search'       // 60 req/min - search queries
  | 'naturalSearch'// 30 req/min - LLM-powered search (costs money)
  | 'autocomplete' // 120 req/min - rapid typing
  | 'auth'         // 10 req/min - login attempts
  | 'sensitive'    // 20 req/min - billing, username claims
  | 'premium';     // 300 req/min - premium users

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
  SetMetadata(RATE_LIMIT_TIER_KEY, tier);

/**
 * Skip rate limiting entirely for an endpoint
 * Use for webhooks and health checks
 */
export const SKIP_THROTTLE_KEY = 'skip-throttle';
export const SkipThrottle = () => SetMetadata(SKIP_THROTTLE_KEY, true);
