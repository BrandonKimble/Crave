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
 * Three windows govern every route that carries no tier annotation: a short
 * burst window, a medium window, and a long sustained window. Their values
 * live in config/configuration.ts (env-driven) and are stated NOWHERE else —
 * the numbers that used to be restated here had drifted from the live config
 * and were deleted (audit 2026-08-02). Annotated routes carry an explicit
 * ceiling via @RateLimitTier; see throttler.decorator.ts.
 *
 * Excluded from rate limiting: /health only. See below.
 */
/**
 * The ONLY paths that skip rate limiting, matched exactly.
 *
 * ONE MECHANISM, NOT TWO (2026-08-01). This list used to carry the webhooks
 * too, and a substring test over it was the bypass that disabled throttling
 * app-wide. An allowlist of paths that opt OUT is a second, parallel way to
 * decide a request's ceiling, and it is the one nobody re-reads — so it is
 * the one that rots. Webhooks now carry a generous `webhook` TIER instead,
 * which is the same mechanism every other route uses; being on the wrong
 * side of a tier costs a vendor a 429, whereas being on the wrong side of
 * this list costs us the entire ceiling.
 *
 * Health stays here because it must answer during an incident — a probe that
 * 429s turns a partial outage into a total one — and because it reads no
 * database and spends nothing.
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

/**
 * Exported so the exemption decision is DIRECTLY testable. It was previously
 * an anonymous closure inside the module factory, reachable only by booting
 * the whole app — which is precisely why a one-line substring bug sat in
 * production unnoticed. See throttler-exemptions.spec.ts.
 */
export function isRateLimitExempt(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<{ url?: string }>();
  const path = (request.url ?? '').split('?')[0];
  return RATE_LIMIT_EXEMPT_PATHS.has(path);
}

const RATE_LIMIT_EXEMPT_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
]);

/**
 * A CEILING OF ZERO IS A DECISION, NOT AN ABSENCE (audit 2026-08-02).
 *
 * This read used to be `configService.get(...) || N`, which discards a
 * configured `0` — the only way to spell "this window is closed" — and
 * silently reopens it to N. Same class as the spend-cap trap `readSpendCapUsd`
 * was written to kill. `??` distinguishes absent from zero; a value that is
 * present but not a finite non-negative integer is a MALFORMED ceiling, and a
 * malformed ceiling must refuse to boot rather than quietly widen.
 *
 * The `??` fallbacks are gone as well: config/configuration.ts already parses
 * these with defaults, so a second set of literals here was a second
 * declaration of the same numbers. Absent here means the config layer is
 * missing, which is itself a boot failure.
 */
export function readThrottlerWindow(
  configService: ConfigService,
  window: 'short' | 'medium' | 'long',
): { ttl: number; limit: number } {
  const read = (field: 'ttl' | 'limit'): number => {
    const path = `throttler.${window}.${field}`;
    const raw = configService.get<number>(path);
    if (raw === undefined || raw === null) {
      throw new Error(
        `Throttler config missing: ${path}. Every rate-limit window must be declared in config/configuration.ts.`,
      );
    }
    if (!Number.isInteger(raw) || raw < 0) {
      throw new Error(
        `Throttler config malformed: ${path} = ${String(raw)}. A window must be a finite non-negative integer (0 = closed).`,
      );
    }
    return raw;
  };
  return { ttl: read('ttl'), limit: read('limit') };
}

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
          { name: 'short', ...readThrottlerWindow(configService, 'short') },
          { name: 'medium', ...readThrottlerWindow(configService, 'medium') },
          { name: 'long', ...readThrottlerWindow(configService, 'long') },
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
        // EXACT PATHS, NEVER SUBSTRING (security audit 2026-08-01, proven
        // against the running API). Fastify's `request.url` is path AND
        // QUERY STRING, and this used `url.includes('/webhooks/')` — so
        // appending `?x=/webhooks/` to ANY url disabled rate limiting
        // entirely. Measured: 20 parallel POSTs to the auth endpoint gave
        // 5 x 400 + 15 x 429 plain, and 20 x 400 + ZERO 429 with the query
        // param. Every ceiling in the app — auth, LLM search spend, the
        // heavy viewport reads, comment spam — was one query param away
        // from not existing.
        skipIf: isRateLimitExempt,
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
