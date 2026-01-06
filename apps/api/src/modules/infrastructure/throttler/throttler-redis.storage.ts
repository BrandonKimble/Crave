import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';
import { RedisService } from '@liaoliaots/nestjs-redis';

/**
 * Redis-based storage for rate limiting
 * 
 * This enables distributed rate limiting across multiple API instances.
 * Each rate limit is stored as a Redis key with TTL-based expiration.
 */
@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly prefix = 'throttler:';
  private readonly scanCount = 1000;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getClient();
  }

  async onModuleDestroy(): Promise<void> {
    // Connection is managed by RedisModule, no cleanup needed
  }

  /**
   * Increment the request count for a key
   * Returns the updated record with total hits and remaining TTL
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = this.getStorageKey(key, throttlerName);
    
    // Use Redis transaction for atomic increment
    const multi = this.redis.multi();
    multi.incr(storageKey);
    multi.pttl(storageKey);
    
    const results = await multi.exec();
    
    if (!results) {
      throw new Error('Redis transaction failed');
    }
    
    const [[incrErr, totalHits], [ttlErr, currentTtl]] = results as [
      [Error | null, number],
      [Error | null, number],
    ];
    
    if (incrErr) throw incrErr;
    if (ttlErr) throw ttlErr;
    
    // Set TTL on first request (when TTL is -1, key exists but has no expiry)
    if (currentTtl === -1 || currentTtl === -2) {
      await this.redis.pexpire(storageKey, ttl);
    }
    
    // Check if blocked
    const isBlocked = totalHits > limit;
    const timeToBlockExpire = isBlocked ? blockDuration : 0;
    
    return {
      totalHits,
      timeToExpire: Math.max(currentTtl, 0),
      isBlocked,
      timeToBlockExpire,
    };
  }

  /**
   * Get current record for a key (used for checking status)
   */
  async get(key: string, throttlerName: string): Promise<ThrottlerStorageRecord | undefined> {
    const storageKey = this.getStorageKey(key, throttlerName);
    
    const [hits, ttl] = await Promise.all([
      this.redis.get(storageKey),
      this.redis.pttl(storageKey),
    ]);
    
    if (!hits || ttl < 0) {
      return undefined;
    }
    
    return {
      totalHits: parseInt(hits, 10),
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private getStorageKey(key: string, throttlerName: string): string {
    return `${this.prefix}${throttlerName}:${key}`;
  }
}
