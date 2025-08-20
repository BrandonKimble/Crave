/**
 * Smart Rate Limiting Types
 * 
 * Clean interfaces for coordinated RPM + TPM rate limiting
 */

export interface RateLimitConfig {
  /** Requests per minute limit */
  maxRPM: number;
  
  /** Tokens per minute limit */
  maxTPM: number;
  
  /** Burst tolerance in seconds */
  burstSeconds: number;
  
  /** TPM throttle threshold (0-1) */
  tpmThrottleAt: number;
}

export interface TokenUsage {
  /** Input tokens consumed */
  inputTokens: number;
  
  /** Output tokens generated */  
  outputTokens: number;
  
  /** Total tokens */
  totalTokens: number;
}

export interface RateLimitResult {
  /** Time waited for rate limit token */
  waitedMs: number;
  
  /** Current TPM utilization */
  tpmUtilization: number;
  
  /** Available rate limit tokens */
  tokensAvailable: number;
}

export interface RateLimitMetrics {
  /** RPM tracking */
  rpm: {
    current?: number;
    currentRPS?: number;
    max?: number;
    tokensAvailable?: number;
    utilizationPercent: number;
  };
  
  /** TPM tracking */
  tpm: {
    current?: number;
    currentTPM?: number;
    max?: number;
    utilizationPercent: number;
    requestsInLastMinute?: number;
    shouldThrottle?: boolean;
    recommendedDelayMs?: number;
  };
  
  /** Performance stats */
  performance: {
    totalRequests: number;
    successfulRequests: number;
    averageWaitTime: number;
    rateLimitHits: number;
    zeroWaitPercent?: number;
    reservationAccuracy?: number;
  };
}