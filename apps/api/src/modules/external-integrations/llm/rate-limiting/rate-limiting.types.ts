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

  /** Performance stats. F115/D11: every field here is a COUNT of something
   *  that happened. `reservationAccuracy` was removed — it was returned as a
   *  literal 0 and never computed from anything. */
  performance: {
    /** Successes + terminal failures. */
    totalRequests: number;
    successfulRequests: number;
    averageWaitTime: number;
    /** LLMRateLimitError occurrences observed by the processor's catch. */
    rateLimitHits: number;
    zeroWaitPercent?: number;
  };
}
