import { SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const RATE_LIMIT_KEY = 'rate_limit_config';

/**
 * Rate limiting configuration interface
 */
export interface RateLimitConfig {
  ttl: number; // Time window in seconds
  limit: number; // Max requests per window
  skipIf?: (req: any) => boolean; // Conditional skip function
}

/**
 * Apply strict rate limiting to endpoints
 * Used for sensitive operations like authentication
 */
export const StrictRateLimit = () =>
  Throttle({ default: { limit: 10, ttl: 60000 } });

/**
 * Apply lenient rate limiting to endpoints
 * Used for general API operations
 */
export const LenientRateLimit = () =>
  Throttle({ default: { limit: 1000, ttl: 60000 } });

/**
 * Apply custom rate limiting configuration
 */
export const CustomRateLimit = (config: RateLimitConfig) =>
  Throttle({ default: { limit: config.limit, ttl: config.ttl * 1000 } });

/**
 * Skip rate limiting for specific endpoints
 * Used for health checks and monitoring
 */
export const SkipRateLimit = () => SetMetadata('skip_throttle', true);
