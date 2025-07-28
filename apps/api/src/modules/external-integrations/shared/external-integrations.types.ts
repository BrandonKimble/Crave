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
  requestsPerSecond: number;
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
  REDDIT = 'reddit',
  LLM = 'llm',
}

/**
 * Centralized rate limiting request
 */
export interface RateLimitRequest {
  service: ExternalApiService;
  operation: string;
  priority?: 'high' | 'medium' | 'low';
  estimatedCost?: number;
}

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
