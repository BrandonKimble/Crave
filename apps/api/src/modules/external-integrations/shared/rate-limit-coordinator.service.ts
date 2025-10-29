import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LoggerService,
  WinstonLoggerService,
  CorrelationUtils,
} from '../../../shared';
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
  private readonly rateLimitConfigs: Map<string, RateLimitConfig> = new Map();
  private readonly requestCounts: Map<string, Map<string, number>> = new Map();
  private readonly resetTimes: Map<string, Map<string, Date>> = new Map();

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  private getScopeKey(service: ExternalApiService, operation?: string): string {
    return operation ? `${service}:${operation}` : `${service}`;
  }

  private resolveScope(
    service: ExternalApiService,
    operation?: string,
  ): { config?: RateLimitConfig; scopeKey: string } {
    const operationKey = this.getScopeKey(service, operation);
    if (operation && this.rateLimitConfigs.has(operationKey)) {
      return {
        config: this.rateLimitConfigs.get(operationKey),
        scopeKey: operationKey,
      };
    }

    const serviceKey = this.getScopeKey(service);
    return {
      config: this.rateLimitConfigs.get(serviceKey),
      scopeKey: serviceKey,
    };
  }

  private registerRateLimitConfig(
    service: ExternalApiService,
    config: RateLimitConfig,
    operation?: string,
  ): void {
    const key = this.getScopeKey(service, operation);
    this.rateLimitConfigs.set(key, config);
  }

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
    const { config, scopeKey } = this.resolveScope(
      request.service,
      request.operation,
    );

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
    const currentUsage = this.getCurrentUsage(scopeKey, 'minute', now);
    const limit = config.requestsPerMinute;

    // Check if we're at the rate limit
    if (limit > 0 && currentUsage >= limit) {
      const retryAfter = this.getRetryAfter(scopeKey, 'minute', now);

      this.logger.warn(`Rate limit exceeded for ${request.service}`, {
        service: request.service,
        operation: request.operation,
        scopeKey,
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
    this.incrementUsage(scopeKey, now);

    // Only log when approaching limits (80%+) to reduce noise
    const updatedUsage = currentUsage + 1;
    if (limit > 0 && updatedUsage / limit >= 0.8) {
      this.logger.info(`Approaching rate limit for ${request.service}`, {
        service: request.service,
        operation: request.operation,
        scopeKey,
        currentUsage: updatedUsage,
        limit,
        utilizationPercent: Math.round((updatedUsage / limit) * 100),
        correlationId,
      });
    }

    return {
      allowed: true,
      currentUsage: updatedUsage,
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
    const { config, scopeKey } = this.resolveScope(service, operation);
    if (config) {
      // Set usage to limit to prevent further requests
      this.setUsageToLimit(scopeKey, now, config.requestsPerMinute);
    }
  }

  /**
   * Get current rate limit status for a service
   */
  getStatus(service: ExternalApiService): RateLimitStatus {
    const now = new Date();
    const serviceKey = this.getScopeKey(service);
    const config = this.rateLimitConfigs.get(serviceKey);
    const currentUsage = this.getCurrentUsage(serviceKey, 'minute', now);
    const limit = config?.requestsPerMinute || 0;

    return {
      service,
      currentRequests: currentUsage,
      resetTime: new Date(Math.ceil(now.getTime() / 60000) * 60000), // Next minute boundary
      isAtLimit: currentUsage >= limit,
      retryAfter:
        currentUsage >= limit
          ? this.getRetryAfter(serviceKey, 'minute', now)
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
    const serviceKey = this.getScopeKey(service);
    const scopePrefix = `${service}:`;

    for (const key of Array.from(this.requestCounts.keys())) {
      if (key === serviceKey || key.startsWith(scopePrefix)) {
        this.requestCounts.delete(key);
      }
    }

    for (const key of Array.from(this.resetTimes.keys())) {
      if (key === serviceKey || key.startsWith(scopePrefix)) {
        this.resetTimes.delete(key);
      }
    }

    this.logger.info(`Rate limits reset for ${service}`, { service });
  }

  /**
   * Initialize rate limit configurations from environment
   */
  private initializeRateLimitConfigs(): void {
    const googleRequestsPerMinute =
      this.configService.get<number>('googlePlaces.requestsPerMinute') || 600;
    const googleRequestsPerDay =
      this.configService.get<number>('googlePlaces.requestsPerDay') || 0;
    const googleRequestsPerSecond =
      this.configService.get<number>('googlePlaces.requestsPerSecond') ||
      this.computePerSecond(googleRequestsPerMinute);
    const googleRequestsPerHour = this.computePerHour(
      googleRequestsPerMinute,
      googleRequestsPerDay,
    );

    this.registerRateLimitConfig(ExternalApiService.GOOGLE_PLACES, {
      requestsPerSecond: googleRequestsPerSecond,
      requestsPerMinute: googleRequestsPerMinute,
      requestsPerHour: googleRequestsPerHour,
      requestsPerDay: googleRequestsPerDay,
    });

    const googleOperationLimits =
      this.configService.get<
        Record<
          string,
          {
            requestsPerMinute?: number;
            requestsPerDay?: number;
          }
        >
      >('googlePlaces.operationLimits') || {};

    Object.entries(googleOperationLimits).forEach(([operation, value]) => {
      const perMinute =
        typeof value?.requestsPerMinute === 'number'
          ? value.requestsPerMinute
          : googleRequestsPerMinute;
      if (!Number.isFinite(perMinute) || perMinute <= 0) {
        return;
      }

      const perDay =
        typeof value?.requestsPerDay === 'number'
          ? value.requestsPerDay
          : googleRequestsPerDay;
      const perSecond = this.computePerSecond(perMinute);
      const perHour = this.computePerHour(perMinute, perDay);

      this.registerRateLimitConfig(
        ExternalApiService.GOOGLE_PLACES,
        {
          requestsPerSecond: perSecond,
          requestsPerMinute: perMinute,
          requestsPerHour: perHour,
          requestsPerDay: perDay,
        },
        operation,
      );
    });

    // Reddit API - 100 requests per minute (as per PRD section 2.5)
    const redditRequestsPerMinute =
      this.configService.get<number>('reddit.requestsPerMinute') || 100;
    this.registerRateLimitConfig(ExternalApiService.REDDIT, {
      requestsPerSecond: 1,
      requestsPerMinute: redditRequestsPerMinute,
      requestsPerHour: redditRequestsPerMinute * 60,
      requestsPerDay: redditRequestsPerMinute * 60 * 24,
    });

    // LLM API - Conservative limits to manage costs
    const llmRequestsPerMinute =
      this.configService.get<number>('llm.requestsPerMinute') || 60;
    this.registerRateLimitConfig(ExternalApiService.LLM, {
      requestsPerSecond: 2,
      requestsPerMinute: llmRequestsPerMinute,
      requestsPerHour: llmRequestsPerMinute * 60,
      requestsPerDay: llmRequestsPerMinute * 60 * 24,
    });

    this.logger.info('Rate limit configurations initialized', {
      scopes: Array.from(this.rateLimitConfigs.keys()),
    });
  }

  /**
   * Get current usage for a service within a time window
   */
  private getCurrentUsage(
    scopeKey: string,
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): number {
    const serviceMap = this.requestCounts.get(scopeKey);
    if (!serviceMap) return 0;

    const windowKey = this.getWindowKey(window, now);
    return serviceMap.get(windowKey) || 0;
  }

  private computePerSecond(requestsPerMinute: number): number {
    if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
      return 0;
    }

    return Math.max(1, Math.floor(requestsPerMinute / 60));
  }

  private computePerHour(
    requestsPerMinute: number,
    requestsPerDay?: number,
  ): number {
    if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
      return 0;
    }

    const perHour = requestsPerMinute * 60;

    if (
      !Number.isFinite(requestsPerDay) ||
      !requestsPerDay ||
      requestsPerDay <= 0
    ) {
      return perHour;
    }

    return Math.min(perHour, requestsPerDay);
  }

  /**
   * Increment usage counter for a service
   */
  private incrementUsage(scopeKey: string, now: Date): void {
    if (!this.requestCounts.has(scopeKey)) {
      this.requestCounts.set(scopeKey, new Map());
      this.resetTimes.set(scopeKey, new Map());
    }

    const serviceMap = this.requestCounts.get(scopeKey)!;
    const resetMap = this.resetTimes.get(scopeKey)!;

    // Clean up old windows first
    this.cleanupOldWindows(scopeKey, now);

    // Increment current minute
    const minuteKey = this.getWindowKey('minute', now);
    serviceMap.set(minuteKey, (serviceMap.get(minuteKey) || 0) + 1);
    resetMap.set(minuteKey, new Date(now.getTime() + 60000));
  }

  /**
   * Set usage to limit (when rate limit is hit externally)
   */
  private setUsageToLimit(scopeKey: string, now: Date, limit: number): void {
    if (!this.requestCounts.has(scopeKey)) {
      this.requestCounts.set(scopeKey, new Map());
      this.resetTimes.set(scopeKey, new Map());
    }

    const serviceMap = this.requestCounts.get(scopeKey)!;
    const resetMap = this.resetTimes.get(scopeKey)!;

    const minuteKey = this.getWindowKey('minute', now);
    serviceMap.set(minuteKey, limit);
    resetMap.set(minuteKey, new Date(now.getTime() + 60000));
  }

  /**
   * Get retry after time in seconds
   */
  private getRetryAfter(
    scopeKey: string,
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): number {
    const resetMap = this.resetTimes.get(scopeKey);
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
  private cleanupOldWindows(scopeKey: string, now: Date): void {
    const serviceMap = this.requestCounts.get(scopeKey);
    const resetMap = this.resetTimes.get(scopeKey);

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
