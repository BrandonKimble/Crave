import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import type { Redis } from 'ioredis';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { MetricsService } from '../../metrics/metrics.service';
import {
  ExternalApiService,
  RateLimitConfig,
  RateLimitRequest,
  RateLimitResponse,
  RateLimitStatus,
} from './external-integrations.types';
import { Counter, Gauge } from 'prom-client';

/**
 * Rate Limiting Coordinator
 *
 * Implements PRD Section 9.2.1: "basic rate limiting for google-places, reddit-api, llm-api"
 * Provides centralized rate limiting across all external API services to prevent quota exhaustion.
 *
 * Backing store: Redis (distributed across API replicas).
 */
@Injectable()
export class RateLimitCoordinatorService implements OnModuleInit {
  private logger!: LoggerService;
  private redis!: Redis;
  private redisKeyPrefix = '';

  private readonly rateLimitConfigs: Map<string, RateLimitConfig> = new Map();
  private failClosedServices = new Set<ExternalApiService>();
  private readonly emergencyMinuteCounters = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  private requestCounter!: Counter<string>;
  private rateLimitHitCounter!: Counter<string>;
  private usageGauge!: Gauge<string>;
  private limitGauge!: Gauge<string>;
  private utilizationGauge!: Gauge<string>;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly metricsService: MetricsService,
    private readonly redisService: RedisService,
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
    this.redis = this.redisService.getOrThrow();
    this.redisKeyPrefix = this.resolveRedisPrefix();
    this.initializeFailureModePolicy();

    this.logger.info('Initializing Rate Limit Coordinator', {
      redisKeyPrefix: this.redisKeyPrefix,
    });

    this.initializeRateLimitConfigs();
    this.initializeMetrics();

    this.logger.info('Rate Limit Coordinator initialized successfully');
  }

  private initializeFailureModePolicy(): void {
    const configured = this.resolveFailClosedServices(
      process.env.EXTERNAL_RATE_LIMIT_FAIL_CLOSED_SERVICES,
    );

    this.failClosedServices =
      configured.size > 0
        ? configured
        : new Set([ExternalApiService.GOOGLE_PLACES, ExternalApiService.LLM]);

    this.logger.info('Rate limit fallback policy initialized', {
      failClosedServices: Array.from(this.failClosedServices.values()),
    });
  }

  private initializeMetrics(): void {
    this.requestCounter = this.metricsService.getCounter({
      name: 'external_api_rate_limit_requests_total',
      help: 'Total external API requests checked by the rate limit coordinator',
      labelNames: ['service', 'operation', 'decision'],
    });
    this.rateLimitHitCounter = this.metricsService.getCounter({
      name: 'external_api_rate_limit_hits_total',
      help: 'Total external API rate limit hits (coordinator blocks and upstream 429s)',
      labelNames: ['service', 'operation', 'source'],
    });
    this.usageGauge = this.metricsService.getGauge({
      name: 'external_api_rate_limit_usage',
      help: 'Current external API rate limit usage per window',
      labelNames: ['service', 'operation', 'window'],
    });
    this.limitGauge = this.metricsService.getGauge({
      name: 'external_api_rate_limit_limit',
      help: 'Configured external API rate limit per window',
      labelNames: ['service', 'operation', 'window'],
    });
    this.utilizationGauge = this.metricsService.getGauge({
      name: 'external_api_rate_limit_utilization_percent',
      help: 'External API rate limit utilization percent per window',
      labelNames: ['service', 'operation', 'window'],
    });
  }

  private resolveRedisPrefix(): string {
    const explicitPrefix = process.env.EXTERNAL_RATE_LIMIT_REDIS_PREFIX;
    if (typeof explicitPrefix === 'string' && explicitPrefix.trim()) {
      return explicitPrefix.trim();
    }

    const appEnvRaw =
      process.env.APP_ENV || process.env.CRAVE_ENV || process.env.NODE_ENV;
    const appEnv =
      typeof appEnvRaw === 'string' && appEnvRaw.trim()
        ? appEnvRaw.trim().toLowerCase() === 'production'
          ? 'prod'
          : appEnvRaw.trim().toLowerCase() === 'development'
            ? 'dev'
            : appEnvRaw.trim()
        : 'dev';

    return `crave:${appEnv}:external-rate-limit`;
  }

  private buildRedisKey(
    scopeKey: string,
    window: 'minute' | 'hour' | 'day',
    bucket: string,
  ): string {
    return `${this.redisKeyPrefix}:${window}:${scopeKey}:${bucket}`;
  }

  private getWindowBucket(
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): string {
    switch (window) {
      case 'minute':
        return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
      case 'hour':
        return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
      case 'day':
        return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
      default:
        return 'unknown';
    }
  }

  private getWindowResetTime(
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): Date {
    switch (window) {
      case 'minute': {
        const reset = new Date(now);
        reset.setUTCSeconds(0, 0);
        reset.setUTCMinutes(reset.getUTCMinutes() + 1);
        return reset;
      }
      case 'hour': {
        const reset = new Date(now);
        reset.setUTCMinutes(0, 0, 0);
        reset.setUTCHours(reset.getUTCHours() + 1);
        return reset;
      }
      case 'day': {
        const reset = new Date(now);
        reset.setUTCHours(0, 0, 0, 0);
        reset.setUTCDate(reset.getUTCDate() + 1);
        return reset;
      }
      default:
        return new Date(now.getTime() + 60000);
    }
  }

  private getWindowTtlSeconds(
    window: 'minute' | 'hour' | 'day',
    now: Date,
  ): number {
    const reset = this.getWindowResetTime(window, now);
    return Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 1000));
  }

  private async getWindowUsageCounts(
    scopeKey: string,
    now: Date,
  ): Promise<{ minute: number; hour: number; day: number }> {
    const minuteKey = this.buildRedisKey(
      scopeKey,
      'minute',
      this.getWindowBucket('minute', now),
    );
    const hourKey = this.buildRedisKey(
      scopeKey,
      'hour',
      this.getWindowBucket('hour', now),
    );
    const dayKey = this.buildRedisKey(
      scopeKey,
      'day',
      this.getWindowBucket('day', now),
    );

    const values = await this.redis.mget(minuteKey, hourKey, dayKey);
    return {
      minute: Number.parseInt(values[0] ?? '0', 10) || 0,
      hour: Number.parseInt(values[1] ?? '0', 10) || 0,
      day: Number.parseInt(values[2] ?? '0', 10) || 0,
    };
  }

  private recordLimitSnapshot(options: {
    service: ExternalApiService;
    operation: string;
    config: RateLimitConfig;
    usage: { minute: number; hour: number; day: number };
  }): void {
    const { service, operation, config, usage } = options;

    const snapshots = [
      {
        window: 'minute',
        usage: usage.minute,
        limit: config.requestsPerMinute,
      },
      {
        window: 'hour',
        usage: usage.hour,
        limit: config.requestsPerHour,
      },
      {
        window: 'day',
        usage: usage.day,
        limit: config.requestsPerDay,
      },
    ] as const;

    snapshots.forEach((snapshot) => {
      this.usageGauge.set(
        { service, operation, window: snapshot.window },
        snapshot.usage,
      );
      this.limitGauge.set(
        { service, operation, window: snapshot.window },
        snapshot.limit,
      );
      this.utilizationGauge.set(
        { service, operation, window: snapshot.window },
        snapshot.limit > 0 ? (snapshot.usage / snapshot.limit) * 100 : 0,
      );
    });
  }

  private parseLuaNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private resolveFailClosedServices(
    raw: string | undefined,
  ): Set<ExternalApiService> {
    const resolved = new Set<ExternalApiService>();
    if (!raw) {
      return resolved;
    }

    const tokens = raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    for (const token of tokens) {
      switch (token) {
        case 'google-places':
          resolved.add(ExternalApiService.GOOGLE_PLACES);
          break;
        case 'reddit':
          resolved.add(ExternalApiService.REDDIT);
          break;
        case 'llm':
          resolved.add(ExternalApiService.LLM);
          break;
      }
    }

    return resolved;
  }

  private pruneEmergencyMinuteCounters(nowMs: number): void {
    for (const [key, entry] of this.emergencyMinuteCounters.entries()) {
      if (entry.expiresAt <= nowMs) {
        this.emergencyMinuteCounters.delete(key);
      }
    }
  }

  private handleRedisFailureFallback(options: {
    request: RateLimitRequest;
    config: RateLimitConfig;
    scopeKey: string;
    operationLabel: string;
    now: Date;
    minuteResetTime: Date;
  }): RateLimitResponse {
    const { request, config, scopeKey, operationLabel, now, minuteResetTime } =
      options;
    const shouldUseEmergencyGuard =
      this.failClosedServices.has(request.service) &&
      config.requestsPerMinute > 0;

    if (!shouldUseEmergencyGuard) {
      this.requestCounter.inc({
        service: request.service,
        operation: operationLabel,
        decision: 'allowed_fallback',
      });

      return {
        allowed: true,
        currentUsage: 0,
        limit: config.requestsPerMinute,
        resetTime: minuteResetTime,
      };
    }

    const nowMs = now.getTime();
    this.pruneEmergencyMinuteCounters(nowMs);

    const retryAfter = Math.max(
      1,
      Math.ceil((minuteResetTime.getTime() - nowMs) / 1000),
    );
    const emergencyKey = `${scopeKey}:${this.getWindowBucket('minute', now)}`;
    const current = this.emergencyMinuteCounters.get(emergencyKey);
    const currentUsage = current?.count ?? 0;

    if (currentUsage >= config.requestsPerMinute) {
      this.requestCounter.inc({
        service: request.service,
        operation: operationLabel,
        decision: 'blocked_fallback',
      });
      this.rateLimitHitCounter.inc({
        service: request.service,
        operation: operationLabel,
        source: 'coordinator_fallback',
      });

      this.logger.warn(
        'Redis unavailable; blocking request via emergency local minute guard',
        {
          service: request.service,
          operation: request.operation,
          scopeKey,
          currentUsage,
          limit: config.requestsPerMinute,
          retryAfter,
        },
      );

      return {
        allowed: false,
        retryAfter,
        currentUsage,
        limit: config.requestsPerMinute,
        resetTime: minuteResetTime,
      };
    }

    const nextUsage = currentUsage + 1;
    this.emergencyMinuteCounters.set(emergencyKey, {
      count: nextUsage,
      expiresAt: minuteResetTime.getTime(),
    });
    this.requestCounter.inc({
      service: request.service,
      operation: operationLabel,
      decision: 'allowed_fallback_guarded',
    });

    return {
      allowed: true,
      currentUsage: nextUsage,
      limit: config.requestsPerMinute,
      resetTime: minuteResetTime,
    };
  }

  /**
   * Request permission to make an API call.
   * Returns whether the request is allowed and any retry information.
   */
  async requestPermission(
    request: RateLimitRequest,
  ): Promise<RateLimitResponse> {
    const correlationId = CorrelationUtils.getCorrelationId();
    const { config, scopeKey } = this.resolveScope(
      request.service,
      request.operation,
    );
    const operationLabel = scopeKey.includes(':') ? request.operation : 'all';

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
    const minuteResetTime = this.getWindowResetTime('minute', now);
    const minuteTtlSeconds = this.getWindowTtlSeconds('minute', now);
    const hourTtlSeconds = this.getWindowTtlSeconds('hour', now);
    const dayTtlSeconds = this.getWindowTtlSeconds('day', now);

    const minuteKey = this.buildRedisKey(
      scopeKey,
      'minute',
      this.getWindowBucket('minute', now),
    );
    const hourKey = this.buildRedisKey(
      scopeKey,
      'hour',
      this.getWindowBucket('hour', now),
    );
    const dayKey = this.buildRedisKey(
      scopeKey,
      'day',
      this.getWindowBucket('day', now),
    );

    try {
      const lua = `
        local minuteKey = KEYS[1]
        local hourKey = KEYS[2]
        local dayKey = KEYS[3]

        local minuteLimit = tonumber(ARGV[1])
        local hourLimit = tonumber(ARGV[2])
        local dayLimit = tonumber(ARGV[3])

        local minuteTtl = tonumber(ARGV[4])
        local hourTtl = tonumber(ARGV[5])
        local dayTtl = tonumber(ARGV[6])

        local minuteCount = tonumber(redis.call('GET', minuteKey) or '0')
        local hourCount = tonumber(redis.call('GET', hourKey) or '0')
        local dayCount = tonumber(redis.call('GET', dayKey) or '0')

        local blocked =
          (minuteLimit > 0 and minuteCount >= minuteLimit) or
          (hourLimit > 0 and hourCount >= hourLimit) or
          (dayLimit > 0 and dayCount >= dayLimit)

        if blocked then
          local retryAfter = redis.call('TTL', minuteKey)
          if retryAfter == nil or retryAfter < 0 then
            retryAfter = minuteTtl
          end
          return {0, minuteCount, hourCount, dayCount, retryAfter}
        end

        minuteCount = redis.call('INCR', minuteKey)
        if minuteCount == 1 then
          redis.call('EXPIRE', minuteKey, minuteTtl)
        end

        hourCount = redis.call('INCR', hourKey)
        if hourCount == 1 then
          redis.call('EXPIRE', hourKey, hourTtl)
        end

        dayCount = redis.call('INCR', dayKey)
        if dayCount == 1 then
          redis.call('EXPIRE', dayKey, dayTtl)
        end

        local retryAfter = redis.call('TTL', minuteKey)
        if retryAfter == nil or retryAfter < 0 then
          retryAfter = minuteTtl
        end

        return {1, minuteCount, hourCount, dayCount, retryAfter}
      `;

      const raw = (await this.redis.eval(
        lua,
        3,
        minuteKey,
        hourKey,
        dayKey,
        String(config.requestsPerMinute),
        String(config.requestsPerHour),
        String(config.requestsPerDay),
        String(minuteTtlSeconds),
        String(hourTtlSeconds),
        String(dayTtlSeconds),
      )) as unknown[];

      const allowed = this.parseLuaNumber(raw[0]) === 1;
      const usage = {
        minute: this.parseLuaNumber(raw[1]),
        hour: this.parseLuaNumber(raw[2]),
        day: this.parseLuaNumber(raw[3]),
      };
      const retryAfter = Math.max(1, this.parseLuaNumber(raw[4]));

      this.recordLimitSnapshot({
        service: request.service,
        operation: operationLabel,
        config,
        usage,
      });

      if (!allowed) {
        this.requestCounter.inc({
          service: request.service,
          operation: operationLabel,
          decision: 'blocked',
        });
        this.rateLimitHitCounter.inc({
          service: request.service,
          operation: operationLabel,
          source: 'coordinator',
        });

        this.logger.warn(`Rate limit exceeded for ${request.service}`, {
          service: request.service,
          operation: request.operation,
          scopeKey,
          currentUsage: usage.minute,
          limit: config.requestsPerMinute,
          retryAfter,
          correlationId,
        });

        return {
          allowed: false,
          retryAfter,
          currentUsage: usage.minute,
          limit: config.requestsPerMinute,
          resetTime: new Date(now.getTime() + retryAfter * 1000),
        };
      }

      this.requestCounter.inc({
        service: request.service,
        operation: operationLabel,
        decision: 'allowed',
      });

      if (
        config.requestsPerMinute > 0 &&
        usage.minute / config.requestsPerMinute >= 0.8
      ) {
        this.logger.info(`Approaching rate limit for ${request.service}`, {
          service: request.service,
          operation: request.operation,
          scopeKey,
          currentUsage: usage.minute,
          limit: config.requestsPerMinute,
          utilizationPercent: Math.round(
            (usage.minute / config.requestsPerMinute) * 100,
          ),
          correlationId,
        });
      }

      return {
        allowed: true,
        currentUsage: usage.minute,
        limit: config.requestsPerMinute,
        resetTime: minuteResetTime,
      };
    } catch (error) {
      this.logger.warn(
        'Redis rate limit check failed; applying fallback policy',
        {
          service: request.service,
          operation: request.operation,
          scopeKey,
          correlationId,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        },
      );

      return this.handleRedisFailureFallback({
        request,
        config,
        scopeKey,
        operationLabel,
        now,
        minuteResetTime,
      });
    }
  }

  /**
   * Report a rate limit hit from an external API.
   */
  async reportRateLimitHit(
    service: ExternalApiService,
    retryAfter: number,
    operation?: string,
  ): Promise<void> {
    const correlationId = CorrelationUtils.getCorrelationId();
    const resolvedOperation = operation ?? 'unknown';

    this.logger.warn(`Rate limit hit reported for ${service}`, {
      service,
      operation,
      retryAfter,
      correlationId,
    });

    const { config, scopeKey } = this.resolveScope(service, operation);
    if (!config) {
      return;
    }

    const operationLabel = scopeKey.includes(':') ? resolvedOperation : 'all';
    this.rateLimitHitCounter.inc({
      service,
      operation: operationLabel,
      source: 'upstream',
    });

    const now = new Date();
    const minuteKey = this.buildRedisKey(
      scopeKey,
      'minute',
      this.getWindowBucket('minute', now),
    );

    try {
      const ttl = Math.max(
        1,
        retryAfter > 0
          ? Math.ceil(retryAfter)
          : this.getWindowTtlSeconds('minute', now),
      );
      await this.redis.set(
        minuteKey,
        String(Math.max(1, config.requestsPerMinute)),
        'EX',
        ttl,
      );

      const usage = await this.getWindowUsageCounts(scopeKey, now);
      this.recordLimitSnapshot({
        service,
        operation: operationLabel,
        config,
        usage,
      });
    } catch (error) {
      this.logger.warn('Failed to persist upstream rate-limit hit', {
        service,
        operation,
        scopeKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  /**
   * Get current rate limit status for a service.
   */
  async getStatus(service: ExternalApiService): Promise<RateLimitStatus> {
    const now = new Date();
    const serviceKey = this.getScopeKey(service);
    const config = this.rateLimitConfigs.get(serviceKey);
    const limit = config?.requestsPerMinute || 0;

    const minuteKey = this.buildRedisKey(
      serviceKey,
      'minute',
      this.getWindowBucket('minute', now),
    );

    try {
      const [usageRaw, ttlRaw] = await Promise.all([
        this.redis.get(minuteKey),
        this.redis.ttl(minuteKey),
      ]);
      const currentRequests = Number.parseInt(usageRaw ?? '0', 10) || 0;
      const retryAfter = ttlRaw > 0 ? ttlRaw : undefined;

      return {
        service,
        currentRequests,
        resetTime:
          retryAfter !== undefined
            ? new Date(now.getTime() + retryAfter * 1000)
            : this.getWindowResetTime('minute', now),
        isAtLimit: limit > 0 && currentRequests >= limit,
        retryAfter:
          limit > 0 && currentRequests >= limit ? retryAfter || 1 : undefined,
      };
    } catch (error) {
      this.logger.warn('Failed to load rate limit status', {
        service,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });

      return {
        service,
        currentRequests: 0,
        resetTime: this.getWindowResetTime('minute', now),
        isAtLimit: false,
      };
    }
  }

  /**
   * Get status for all services.
   */
  async getAllStatuses(): Promise<RateLimitStatus[]> {
    return Promise.all(
      Object.values(ExternalApiService).map((service) =>
        this.getStatus(service),
      ),
    );
  }

  /**
   * Reset rate limits for a service (for testing/debugging).
   */
  async resetService(service: ExternalApiService): Promise<void> {
    const servicePattern = `${this.redisKeyPrefix}:*:${service}*`;
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        servicePattern,
        'COUNT',
        '1000',
      );
      cursor = nextCursor;
      if (batch.length > 0) {
        keys.push(...batch);
      }
    } while (cursor !== '0');

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    this.logger.info(`Rate limits reset for ${service}`, {
      service,
      deletedKeys: keys.length,
    });
  }

  /**
   * Initialize rate limit configurations from environment.
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
}
