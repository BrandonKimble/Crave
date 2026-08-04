import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { LoggerService } from '../../shared';

/**
 * REDIS EVICTION POLICY ENFORCER (2026-08-04 incident: the query-embedding
 * cache filled the prod instance to its ~390MB ceiling under Redis's
 * default `noeviction` — the next write would have ERRORED, including the
 * Bull queues that share the instance; background processing would have
 * died silently).
 *
 * THE CONTRACT this enforces at every boot (CONFIG SET is runtime-only,
 * so a Redis restart silently reverts any hand-applied fix — boot-time
 * enforcement makes the policy self-healing):
 *   - maxmemory: a cap BELOW the instance ceiling, so eviction starts
 *     before write-failure can.
 *   - maxmemory-policy volatile-lru: eviction may touch ONLY keys that
 *     carry a TTL. Every cache in this codebase is volatile by law
 *     (redis-volatility-lockdown.spec.ts); Bull queue keys carry no TTL
 *     and are therefore structurally un-evictable. Cache pressure can
 *     never cost a job.
 *
 * Managed Redis providers sometimes disable CONFIG — that is a WARN, not
 * a crash: the app must boot, and the alert channel picks up the gap.
 */
@Injectable()
export class RedisPolicyEnforcer implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly redisService: RedisService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RedisPolicyEnforcer');
  }

  async onApplicationBootstrap(): Promise<void> {
    let redis: import('ioredis').Redis;
    try {
      redis = this.redisService.getOrThrow();
    } catch {
      return; // no redis in this runtime — nothing to enforce
    }
    const maxmemoryBytes =
      Number(process.env.REDIS_MAXMEMORY_BYTES) || 300 * 1024 * 1024;
    try {
      await redis.config('SET', 'maxmemory', String(maxmemoryBytes));
      await redis.config('SET', 'maxmemory-policy', 'volatile-lru');
      this.logger.info('Redis eviction policy enforced', {
        maxmemoryBytes,
        policy: 'volatile-lru',
      });
    } catch (error) {
      // logger.error IS the Sentry seam — loud, but the boot proceeds.
      this.logger.error(
        'Redis eviction policy could NOT be enforced — verify manually',
        error,
      );
    }
  }
}
