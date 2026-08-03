import type { PlacesOperation } from './vendor-pricing';

/**
 * External Integrations Shared Types
 *
 * Implements PRD Section 9.2.1: "Centralized API management, basic rate limiting"
 * Common types and interfaces for all external API integrations
 */

/**
 * Base configuration for external API services
 */
export interface BaseApiConfig {
  timeout: number;
  retryOptions: RetryOptions;
}

/**
 * Retry configuration with exponential backoff
 * Implements PRD section 9.2.2: "proper retry logic"
 */
export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryBackoffFactor: number;
}

/**
 * Base performance metrics for external API services
 */
export interface BasePerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  lastReset: Date;
  errorCount: number;
  successRate: number;
  rateLimitHits: number;
}

/**
 * Rate limiting configuration per API service
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit?: number;
}

/**
 * Rate limiting status for coordination
 */
export interface RateLimitStatus {
  service: string;
  currentRequests: number;
  resetTime: Date;
  isAtLimit: boolean;
  retryAfter?: number;
}

/**
 * Health status for external API services
 */
export interface ApiHealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  metrics: BasePerformanceMetrics;
  configuration: {
    timeout: number;
    retryOptions: RetryOptions;
  };
  lastError?: {
    message: string;
    timestamp: Date;
    count: number;
  };
}

/**
 * External API service types for rate limiting coordination
 */
export enum ExternalApiService {
  GOOGLE_PLACES = 'google-places',
  // 'reddit' REMOVED (§12.5/§14.8): reddit admission lives solely in the
  // governor's reddit.requests pool — no second window may exist here.
  LLM = 'llm',
}

interface RateLimitRequestBase {
  priority?: 'high' | 'medium' | 'low';
  estimatedCost?: number;
}

/**
 * A rate-limit request, DISCRIMINATED BY SERVICE — because `operation` is not
 * free text, it is the service's vocabulary, and a typo in it is silent.
 *
 * There were three spellings of one Places call: the limiter said
 * `findPlaceFromText`, the ledger and pricing table said `textSearch`, and
 * config had no key for it at all. An owner reacting to a Places bill by
 * adding a `textSearch` limit got NO EFFECT — the scope lookup missed and fell
 * through to the 600/min service default. The cap you would most want to set
 * was the one you could not set, on the most expensive Places call, and
 * nothing warned.
 *
 * A test used to scan the service for stray literals. A union rejects them at
 * the call site instead, and it is the SAME union the pricing table, the
 * ledger, and `googlePlaces.operationLimits` are keyed by, so the three
 * vocabularies cannot drift apart again.
 */
export type RateLimitRequest =
  | (RateLimitRequestBase & {
      service: ExternalApiService.GOOGLE_PLACES;
      operation: PlacesOperation;
    })
  | (RateLimitRequestBase & {
      service: ExternalApiService.LLM;
      operation: string;
    });

/**
 * Rate limiting response
 */
export interface RateLimitResponse {
  allowed: boolean;
  retryAfter?: number;
  currentUsage: number;
  limit: number;
  resetTime: Date;
}
