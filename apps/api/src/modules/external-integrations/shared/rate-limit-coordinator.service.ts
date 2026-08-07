import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import type { Redis } from 'ioredis';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { resolveAppEnv } from '../../../shared/config/app-env';
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

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
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

  /**
   * A CEILING IS THREE-VALUED AND ZERO IS CLOSED (F114, owner-ratified
   * 2026-08-03).
   *
   * config/configuration.ts `ceilingEnv` is the single declaration: it has
   * already refused anything malformed and preserved a deliberate 0. So the
   * only thing left to get wrong here is `||`, which cannot tell 0 from
   * absent — the exact bug that turned `textSearch: 0` into 600/min on the
   * most expensive Places call. This reads with `??` semantics and REFUSES
   * (rather than substituting a local literal) when the key is missing,
   * because a second copy of the number here is how the two declarations
   * drift apart.
   */
  private requireCeiling(key: string): number {
    const value = this.configService.get<number>(key);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `Rate limit ceiling '${key}' is missing or malformed (${String(
          value,
        )}). Config owns this number; a spend ceiling must refuse to boot ` +
          `rather than fall back to a literal that can silently widen it.`,
      );
    }
    return value;
  }

  private registerRateLimitConfig(
    service: ExternalApiService,
    config: RateLimitConfig,
    operation?: string,
  ): void {
    const key = this.getScopeKey(service, operation);
    this.rateLimitConfigs.set(key, config);
    // A CLOSED SCOPE IS ANNOUNCED, NOT INFERRED. 0 is a legitimate setting
    // ("stop making these calls"), which is exactly why an ACCIDENTAL 0 must
    // not be silent: every closed scope says so at boot, at warn level, so
    // "why did Places stop?" is answered by the first line of the log rather
    // than by reading config.
    if (config.requestsPerMinute === 0) {
      this.logger.warn(
        `RATE LIMIT SCOPE CLOSED: '${key}' is configured to 0 requests/minute — ` +
          `every call on this scope will be DENIED without reaching the vendor. ` +
          `This is the deliberate spelling of "halt"; if it was not intended, ` +
          `remove the 0 (omit the entry to inherit the service default).`,
        { scopeKey: key },
      );
    }
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

  private resolveRedisPrefix(): string {
    const explicitPrefix = process.env.EXTERNAL_RATE_LIMIT_REDIS_PREFIX;
    if (typeof explicitPrefix === 'string' && explicitPrefix.trim()) {
      return explicitPrefix.trim();
    }

    // ONE NORMALIZER — see centralized-rate-limiter. This hand-rolled ternary
    // chain handled production/development but not `stage`, and disagreed with
    // the LLM limiter's dialect; both strings are Redis key prefixes.
    const appEnv = resolveAppEnv();
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
        case 'llm':
          resolved.add(ExternalApiService.LLM);
          break;
        default:
          // REFUSE, DON'T WIDEN (F3002 — the same F114 doctrine as
          // requireCeiling above). An unknown token used to be silently
          // discarded, so 'google_places' (underscore — the ledger's own
          // spelling of the SAME vendor) quietly unlisted Places from the
          // Redis-outage fail-closed set: a typo in a fail-CLOSED list must
          // refuse boot loudly, never narrow the guard silently.
          throw new Error(
            `EXTERNAL_RATE_LIMIT_FAIL_CLOSED_SERVICES contains unrecognized ` +
              `token '${token}'. Valid tokens: 'google-places', 'llm'. A ` +
              `fail-closed list must refuse to boot rather than silently ` +
              `drop a service from the Redis-outage guard.`,
          );
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
    now: Date;
    minuteResetTime: Date;
  }): RateLimitResponse {
    const { request, config, scopeKey, now, minuteResetTime } = options;
    const shouldUseEmergencyGuard =
      this.failClosedServices.has(request.service) &&
      config.requestsPerMinute > 0;

    if (!shouldUseEmergencyGuard) {
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
    // CLOSED SCOPE (F114): a registered ceiling of 0 means the owner said
    // "stop" — deny before Redis, before the emergency guard, before
    // anything that could reinterpret 0 as "unlimited" or "unset".
    if (config && config.requestsPerMinute === 0) {
      return {
        allowed: false,
        currentUsage: 0,
        limit: 0,
        resetTime: new Date(Date.now() + 60_000),
        retryAfter: 60,
      };
    }
    if (!config) {
      // ABSENT CONFIG DENIES (red team 2026-08-02). This returned
      // `allowed: true` — an unregistered service was UNLIMITED. Harmless
      // today only because the single caller (Places) always resolves a
      // config via a `|| 600` default, which means the fail-open has never
      // been exercised and nothing would notice if it started being.
      //
      // It is the dormant form of the rate-limit path allowlist that rotted
      // into a total bypass: a registration removed as "dead" leaves every
      // call site compiling and silently uncapped. A ceiling nobody
      // configured is not a ceiling, and this guards paid third-party APIs.
      this.logger.error(
        `No rate limit configuration for service: ${request.service} — DENYING`,
        {
          service: request.service,
          operation: request.operation,
          correlationId,
        },
      );
      return {
        allowed: false,
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

      if (!allowed) {
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
   * Initialize rate limit configurations from environment.
   */
  private initializeRateLimitConfigs(): void {
    // `??`, NOT `||` (F114): config owns these defaults and its `ceilingEnv`
    // already refused anything malformed, so a 0 arriving here is a
    // DELIBERATE CLOSED service — `|| 600` would have re-opened it, and the
    // literal 600 was a second declaration of a number config already owns.
    const googleRequestsPerMinute = this.requireCeiling(
      'googlePlaces.requestsPerMinute',
    );
    const googleRequestsPerDay = this.requireCeiling(
      'googlePlaces.requestsPerDay',
    );
    const googleRequestsPerHour = this.computePerHour(
      googleRequestsPerMinute,
      googleRequestsPerDay,
    );

    this.registerRateLimitConfig(ExternalApiService.GOOGLE_PLACES, {
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
      // A limit is one of {positive ceiling, 0 = CLOSED, absent = inherit}
      // (F114, owner-ratified 2026-08-03): zero must register a closed
      // scope, not silently fall back to the service default on the most
      // expensive call. Malformed refuses boot — a money guard that can't
      // parse must not quietly widen.
      if (!Number.isFinite(perMinute) || perMinute < 0) {
        throw new Error(
          `google_places operation '${operation}' has a malformed requestsPerMinute (${String(
            value?.requestsPerMinute,
          )}) — a money ceiling must be a non-negative finite number`,
        );
      }
      if (perMinute === 0) {
        this.registerRateLimitConfig(
          ExternalApiService.GOOGLE_PLACES,
          { requestsPerMinute: 0, requestsPerDay: 0, requestsPerHour: 0 },
          operation,
        );
        return;
      }

      const perDay =
        typeof value?.requestsPerDay === 'number'
          ? value.requestsPerDay
          : googleRequestsPerDay;
      const perHour = this.computePerHour(perMinute, perDay);

      this.registerRateLimitConfig(
        ExternalApiService.GOOGLE_PLACES,
        {
          requestsPerMinute: perMinute,
          requestsPerHour: perHour,
          requestsPerDay: perDay,
        },
        operation,
      );
    });

    // §12.5/§14.8: the reddit window MOVED into the governor's
    // reddit.requests pool atomically with the client's per-request draws —
    // this coordinator has ZERO reddit admission authority (one pool, one
    // ledger). Nothing reddit-shaped registers or draws here anymore.

    // §12.7: the dead LLM registration is gone — LLM admission lives in the
    // Redis CentralizedRateLimiter (gemini.tokens pool mirrors it, §14.2);
    // nothing draws LLM through this coordinator.

    this.logger.info('Rate limit configurations initialized', {
      scopes: Array.from(this.rateLimitConfigs.keys()),
    });
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
