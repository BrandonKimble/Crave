import { Module, type ExecutionContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/clerk-sdk-node';
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
 * - /billing/webhooks/* - Payment provider webhooks
 */
/**
 * The ONLY paths that skip rate limiting, matched exactly. Health checks
 * must answer during an incident, and the three webhooks carry their own
 * signature/secret verification and are called by vendors we cannot
 * throttle. Anything not on this list is limited — including anything that
 * merely LOOKS like one of these.
 */
/**
 * Verified-subject memo for the throttler tracker. Keyed by the raw token, so
 * a request pays at most one signature check per token per window regardless
 * of how many times the token is presented. Bounded and swept — an unbounded
 * map keyed by attacker-supplied strings is itself a memory-exhaustion vector.
 */
const SUBJECT_MEMO_TTL_MS = 60_000;
const SUBJECT_MEMO_MAX_ENTRIES = 10_000;
const subjectMemo = new Map<string, { subject: string | null; at: number }>();

async function resolveVerifiedSubject(
  token: string,
  secretKey: string | undefined,
): Promise<string | null> {
  if (!secretKey) return null;

  const now = Date.now();
  const cached = subjectMemo.get(token);
  if (cached && now - cached.at < SUBJECT_MEMO_TTL_MS) {
    return cached.subject;
  }

  let subject: string | null = null;
  try {
    const claims = (await verifyToken(token, { secretKey })) as {
      sub?: unknown;
    };
    subject = typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    // An unverifiable token is an anonymous caller. It must NOT get its own
    // bucket — fall through to the IP key.
    subject = null;
  }

  if (subjectMemo.size >= SUBJECT_MEMO_MAX_ENTRIES) {
    for (const [key, value] of subjectMemo) {
      if (now - value.at >= SUBJECT_MEMO_TTL_MS) subjectMemo.delete(key);
    }
    if (subjectMemo.size >= SUBJECT_MEMO_MAX_ENTRIES) subjectMemo.clear();
  }
  subjectMemo.set(token, { subject, at: now });
  return subject;
}

const RATE_LIMIT_EXEMPT_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/api/v1/billing/webhooks/stripe',
  '/api/v1/billing/webhooks/revenuecat',
  '/api/v1/photos/webhooks/cloudinary',
]);

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
        // PER-USER WHEN THE CALLER PROVES WHO THEY ARE, IP OTHERWISE.
        //
        // This used to read `req.user` — which is set by ClerkAuthGuard, a
        // ROUTE guard that runs AFTER this APP_GUARD. It was therefore always
        // undefined, so every request in the app was tracked by IP and the
        // per-user branch was dead code (audit 2026-08-01). That is not a
        // security hole (IP is the stricter key) but it is a real product
        // defect: everyone behind one carrier NAT or one office egress shared
        // a single bucket and throttled each other.
        //
        // The identity must be VERIFIED here, not merely claimed: keying on an
        // unverified token would let an attacker mint a fresh bucket per
        // request and have no ceiling at all. Verification is a local
        // signature check against Clerk's cached JWKS, and the result is
        // memoized per token below so the guard's own verify isn't doubled.
        getTracker: async (req: Record<string, unknown>) => {
          const ipValue = (req as { ip?: unknown }).ip;
          const ip =
            typeof ipValue === 'string' && ipValue.trim() ? ipValue : 'unknown';

          const headers = (req as { headers?: Record<string, unknown> })
            .headers;
          const authorization = headers?.authorization;
          if (typeof authorization !== 'string') return ip;
          const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
          const token = match?.[1]?.trim();
          if (!token) return ip;

          const subject = await resolveVerifiedSubject(
            token,
            configService.get<string>('clerk.secretKey'),
          );
          return subject ? `user:${subject}` : ip;
        },
        // Skip rate limiting for these routes.
        //
        // EXACT PATHS, NEVER SUBSTRING (security audit 2026-08-01, proven
        // against the running API). Fastify's `request.url` is path AND
        // QUERY STRING, and this used `url.includes('/webhooks/')` — so
        // appending `?x=/webhooks/` to ANY url disabled rate limiting
        // entirely. Measured: 20 parallel POSTs to the auth endpoint gave
        // 5 x 400 + 15 x 429 plain, and 20 x 400 + ZERO 429 with the query
        // param. Every ceiling in the app — auth, LLM search spend, the
        // heavy viewport reads, comment spam — was one query param away
        // from not existing.
        skipIf: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{ url?: string }>();
          const path = (request.url ?? '').split('?')[0];
          return RATE_LIMIT_EXEMPT_PATHS.has(path);
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
