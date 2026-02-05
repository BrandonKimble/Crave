import { Module, type ExecutionContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { ThrottlerRedisStorage } from './throttler-redis.storage';

/**
 * Custom Throttler Module with Redis Storage
 *
 * Provides distributed rate limiting using Redis as the backing store.
 * This ensures rate limits work correctly across multiple API instances.
 *
 * Rate Limit Tiers:
 * - short: 3 requests per 1 second (burst protection)
 * - medium: 20 requests per 10 seconds
 * - long: 100 requests per 60 seconds
 *
 * Endpoints can override these defaults using @Throttle() or @SkipThrottle()
 *
 * Excluded from rate limiting:
 * - /health/* - Health check endpoints
 * - /metrics - Prometheus metrics
 * - /billing/webhooks/* - Payment provider webhooks
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, RedisService],
      useFactory: (
        configService: ConfigService,
        redisService: RedisService,
      ) => ({
        throttlers: [
          {
            name: 'short',
            ttl: configService.get<number>('throttler.short.ttl') || 1000,
            limit: configService.get<number>('throttler.short.limit') || 5,
          },
          {
            name: 'medium',
            ttl: configService.get<number>('throttler.medium.ttl') || 10000,
            limit: configService.get<number>('throttler.medium.limit') || 30,
          },
          {
            name: 'long',
            ttl: configService.get<number>('throttler.long.ttl') || 60000,
            limit: configService.get<number>('throttler.long.limit') || 100,
          },
        ],
        storage: new ThrottlerRedisStorage(redisService),
        // Prefer per-user throttling for authenticated routes (fall back to IP).
        getTracker: (req: Record<string, unknown>) => {
          const userId = (() => {
            const user = (req as { user?: unknown }).user;
            if (!user || typeof user !== 'object') return null;
            const userIdValue = (user as { userId?: unknown }).userId;
            return typeof userIdValue === 'string' && userIdValue.trim()
              ? userIdValue
              : null;
          })();
          if (userId) {
            return userId;
          }

          const ipValue = (req as { ip?: unknown }).ip;
          return typeof ipValue === 'string' && ipValue.trim()
            ? ipValue
            : 'unknown';
        },
        // Skip rate limiting for these routes
        skipIf: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{ url?: string }>();
          const url = request.url ?? '';

          // Skip health checks
          if (url.startsWith('/health')) return true;

          // Skip metrics endpoint
          if (url.startsWith('/metrics')) return true;

          // Skip webhooks (they have their own auth)
          if (url.includes('/webhooks/')) return true;

          return false;
        },
        // Custom error message
        errorMessage: 'Too many requests. Please slow down and try again.',
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class CustomThrottlerModule {}
