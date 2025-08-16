import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, WinstonLoggerService, CorrelationUtils } from '../../../shared';
import {
  ExternalApiService,
  RateLimitConfig,
  RateLimitRequest,
  RateLimitResponse,
  RateLimitStatus,
} from './external-integrations.types';

/**
 * Rate Limiting Coordinator
 *
 * Implements PRD Section 9.2.1: "basic rate limiting for google-places, reddit-api, llm-api"
 * Provides centralized rate limiting across all external API services to prevent quota exhaustion
 */
@Injectable()
export class RateLimitCoordinatorService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly rateLimitConfigs: Map<ExternalApiService, RateLimitConfig> =
    new Map();
  private readonly requestCounts: Map<ExternalApiService, Map<string, number>> =
    new Map();
  private readonly resetTimes: Map<ExternalApiService, Map<string, Date>> =
    new Map();

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RateLimitCoordinator');
    this.logger.info('Initializing Rate Limit Coordinator');
    this.initializeRateLimitConfigs();
    this.logger.info('Rate Limit Coordinator initialized successfully');
  }

  /**
   * Request permission to make an API call
   * Returns whether the request is allowed and any retry information
   */
  requestPermission(request: RateLimitRequest): RateLimitResponse {
    const correlationId = CorrelationUtils.getCorrelationId();
    const config = this.rateLimitConfigs.get(request.service);

    if (!config) {
      this.logger.warn(
        `No rate limit configuration found for service: ${request.service}`,
        {
          service: request.service,
          operation: request.operation,
          correlationId,
        },
      );
      return {
        allowed: true,
        currentUsage: 0,
        limit: 0,
        resetTime: new Date(),
      };
    }

    const now = new Date();
    const currentUsage = this.getCurrentUsage(request.service, 'minute', now);
    const limit = config.requestsPerMinute;

    // Check if we're at the rate limit
    if (currentUsage >= limit) {
      const retryAfter = this.getRetryAfter(request.service, 'minute', now);

      this.logger.warn(`Rate limit exceeded for ${request.service}`, {
        service: request.service,
        operation: request.operation,
        currentUsage,
        limit,
        retryAfter,
        correlationId,
      });

      return {
        allowed: false,
        retryAfter,
        currentUsage,
        limit,
        resetTime: new Date(now.getTime() + retryAfter * 1000),
      };
    }

    // Increment usage counter
    this.incrementUsage(request.service, now);

    this.logger.debug(`API request approved for ${request.service}`, {
      service: request.service,
      operation: request.operation,
      currentUsage: currentUsage + 1,
      limit,
      correlationId,
    });

    return {
      allowed: true,
      currentUsage: currentUsage + 1,
      limit,
      resetTime: new Date(now.getTime() + 60000), // Next minute
    };
  }

  /**
   * Report a rate limit hit from an external API
   */
  reportRateLimitHit(
    service: ExternalApiService,
    retryAfter: number,
    operation?: string,
  ): void {
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.warn(`Rate limit hit reported for ${service}`, {
      service,
      operation,
      retryAfter,
      correlationId,
    });

    // Update internal tracking to reflect the rate limit
    const now = new Date();
    const config = this.rateLimitConfigs.get(service);
    if (config) {
      // Set usage to limit to prevent further requests
      this.setUsageToLimit(service, now);
    }
  }

  /**
   * Get current rate limit status for a service
   */
  getStatus(service: ExternalApiService): RateLimitStatus {
    const now = new Date();
    const config = this.rateLimitConfigs.get(service);
    const currentUsage = this.getCurrentUsage(service, 'minute', now);
    const limit = config?.requestsPerMinute || 0;

    return {
      service,
      currentRequests: currentUsage,
      resetTime: new Date(Math.ceil(now.getTime() / 60000) * 60000), // Next minute boundary
      isAtLimit: currentUsage >= limit,
      retryAfter:
        currentUsage >= limit
          ? this.getRetryAfter(service, 'minute', now)
          : undefined,
    };
  }

  /**
   * Get status for all services
   */
  getAllStatuses(): RateLimitStatus[] {
    return Object.values(ExternalApiService).map((service) =>
      this.getStatus(service),
    );
  }

  /**
   * Reset rate limits for a service (for testing/debugging)
   */
  resetService(service: ExternalApiService): void {
    this.requestCounts.delete(service);
    this.resetTimes.delete(service);

    this.logger.info(`Rate limits reset for ${service}`, { service });
  }

  /**
   * Initialize rate limit configurations from environment
   */
  private initializeRateLimitConfigs(): void {
    // Google Places API - 100 requests per minute (as per PRD section 2.5)
    this.rateLimitConfigs.set(ExternalApiService.GOOGLE_PLACES, {
      requestsPerSecond: 10,
      requestsPerMinute:
        this.configService.get<number>('googlePlaces.requestsPerMinute') || 50,
      requestsPerHour: 3000,
      requestsPerDay: 100000,
    });

    // Reddit API - 100 requests per minute (as per PRD section 2.5)
    this.rateLimitConfigs.set(ExternalApiService.REDDIT, {
      requestsPerSecond: 1,
      requestsPerMinute:
        this.configService.get<number>('reddit.requestsPerMinute') || 100,
      requestsPerHour: 6000,
      requestsPerDay: 144000,
    });

    // LLM API - Conservative limits to manage costs
    this.rateLimitConfigs.set(ExternalApiService.LLM, {
      requestsPerSecond: 2,
      requestsPerMinute:
        this.configService.get<number>('llm.requestsPerMinute') || 60,
      requestsPerHour: 3600,
      requestsPerDay: 86400,
    });

    this.logger.info('Rate limit configurations initialized', {
      services: Array.from(this.rateLimitConfigs.keys()),
    });
  }

  /**
   * Get current usage for a service within a time window
   */
  private getCurrentUsage(
    service: ExternalApiService,
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): number {
    const serviceMap = this.requestCounts.get(service);
    if (!serviceMap) return 0;

    const windowKey = this.getWindowKey(window, now);
    return serviceMap.get(windowKey) || 0;
  }

  /**
   * Increment usage counter for a service
   */
  private incrementUsage(service: ExternalApiService, now: Date): void {
    if (!this.requestCounts.has(service)) {
      this.requestCounts.set(service, new Map());
      this.resetTimes.set(service, new Map());
    }

    const serviceMap = this.requestCounts.get(service)!;
    const resetMap = this.resetTimes.get(service)!;

    // Clean up old windows first
    this.cleanupOldWindows(service, now);

    // Increment current minute
    const minuteKey = this.getWindowKey('minute', now);
    serviceMap.set(minuteKey, (serviceMap.get(minuteKey) || 0) + 1);
    resetMap.set(minuteKey, new Date(now.getTime() + 60000));
  }

  /**
   * Set usage to limit (when rate limit is hit externally)
   */
  private setUsageToLimit(service: ExternalApiService, now: Date): void {
    const config = this.rateLimitConfigs.get(service);
    if (!config) return;

    if (!this.requestCounts.has(service)) {
      this.requestCounts.set(service, new Map());
      this.resetTimes.set(service, new Map());
    }

    const serviceMap = this.requestCounts.get(service)!;
    const resetMap = this.resetTimes.get(service)!;

    const minuteKey = this.getWindowKey('minute', now);
    serviceMap.set(minuteKey, config.requestsPerMinute);
    resetMap.set(minuteKey, new Date(now.getTime() + 60000));
  }

  /**
   * Get retry after time in seconds
   */
  private getRetryAfter(
    service: ExternalApiService,
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): number {
    const resetMap = this.resetTimes.get(service);
    if (!resetMap) return 60; // Default to 1 minute

    const windowKey = this.getWindowKey(window, now);
    const resetTime = resetMap.get(windowKey);

    if (!resetTime) return 60;

    return Math.max(1, Math.ceil((resetTime.getTime() - now.getTime()) / 1000));
  }

  /**
   * Generate window key for time-based tracking
   */
  private getWindowKey(window: 'minute' | 'hour' | 'day', now: Date): string {
    switch (window) {
      case 'minute':
        return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      case 'hour':
        return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
      case 'day':
        return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      default:
        return 'unknown';
    }
  }

  /**
   * Clean up old tracking windows to prevent memory leaks
   */
  private cleanupOldWindows(service: ExternalApiService, now: Date): void {
    const serviceMap = this.requestCounts.get(service);
    const resetMap = this.resetTimes.get(service);

    if (!serviceMap || !resetMap) return;

    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [key, resetTime] of resetMap.entries()) {
      if (resetTime < cutoff) {
        serviceMap.delete(key);
        resetMap.delete(key);
      }
    }
  }
}
