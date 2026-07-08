import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import {
  EntitlementStatus,
  Prisma,
  SubscriptionProvider,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export type GrantSource =
  | 'subscription'
  | 'trial_base'
  | 'reward_photo'
  | 'reward_referral'
  | 'comp'
  | 'promo'
  | 'winback'
  | 'gift';

export interface GrantInput {
  userId: string;
  entitlementCode?: string;
  source: GrantSource;
  /** Days from now (ignored when expiresAt/lifetime given). */
  days?: number;
  expiresAt?: Date | null;
  /** expiresAt NULL = lifetime. */
  lifetime?: boolean;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

export interface AccessSummary {
  entitlementCode: string;
  active: boolean;
  /** NULL = lifetime. */
  expiresAt: Date | null;
  /** The source whose grant currently carries access (longest-lived). */
  source: string | null;
}

/** Per-source lifetime caps on REWARD days (anti-farming). 0 = uncapped. */
const REWARD_DAY_CAPS: Partial<Record<GrantSource, number>> = {
  reward_photo: 30,
  reward_referral: 60,
};

const CACHE_TTL_SECONDS = 300;

/**
 * Layer 2+3 of plans/payments-ideal-shape.md — the access-grant ledger and
 * the ONE runtime access check.
 *
 * Truth = access_grants rows; UserEntitlement is a materialized cache
 * recomputed on every grant write (kept hot for gating + legacy readers).
 * hasAccess() reads Redis -> cache table -> ledger, and NEVER throws into a
 * product path (a broken billing lookup must not take down search).
 */
@Injectable()
export class EntitlementService {
  private readonly logger: LoggerService;
  private redis: Redis | null = null;
  private readonly defaultCode: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() redisService: RedisService | null,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntitlementService');
    this.defaultCode =
      this.configService.get<string>('billing.defaultEntitlement') || 'premium';
    try {
      this.redis = redisService?.getOrThrow() ?? null;
    } catch {
      this.redis = null; // cache is an optimization only
    }
  }

  /** Write a grant to the ledger and recompute the cache. Reward sources are
   *  capped per REWARD_DAY_CAPS (excess days are clamped, never errored —
   *  the user did the action; we just stop paying past the cap). */
  async grant(input: GrantInput): Promise<{ grantId: string | null }> {
    const code = input.entitlementCode ?? this.defaultCode;
    let expiresAt: Date | null;
    if (input.lifetime) {
      expiresAt = null;
    } else if (input.expiresAt !== undefined) {
      expiresAt = input.expiresAt;
    } else {
      let days = input.days ?? 0;
      const cap = REWARD_DAY_CAPS[input.source];
      if (cap) {
        const used = await this.rewardDaysUsed(input.userId, input.source);
        days = Math.max(0, Math.min(days, cap - used));
        if (days === 0) {
          this.logger.info('Reward grant clamped to zero (cap reached)', {
            userId: input.userId,
            source: input.source,
            cap,
          });
          return { grantId: null };
        }
      }
      // Day grants STACK: they extend the user's current access horizon
      // ("every photo adds a day" means a day ON TOP, not an overlapping
      // window that silently vanishes inside an existing grant).
      const current = await this.summarize(input.userId, code);
      const base =
        current.active && current.expiresAt
          ? Math.max(current.expiresAt.getTime(), Date.now())
          : Date.now();
      expiresAt = new Date(base + days * 24 * 60 * 60 * 1000);
      input = {
        ...input,
        metadata: { ...(input.metadata ?? {}), grantedDays: days },
      };
    }

    const grant = await this.prisma.accessGrant.create({
      data: {
        userId: input.userId,
        entitlementCode: code,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        expiresAt,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
      select: { grantId: true },
    });
    await this.recomputeCache(input.userId, code);
    this.logger.info('Access granted', {
      userId: input.userId,
      entitlementCode: code,
      source: input.source,
      expiresAt: expiresAt?.toISOString() ?? 'lifetime',
    });
    return { grantId: grant.grantId };
  }

  /** Lookup a grant by its idempotency ref (reward double-pay guard). */
  async findGrantByRef(
    userId: string,
    sourceRef: string,
  ): Promise<{ grantId: string } | null> {
    return this.prisma.accessGrant.findFirst({
      where: { userId, sourceRef },
      select: { grantId: true },
    });
  }

  /** Revoke a single grant (reversible history stays). */
  async revoke(grantId: string, reason: string): Promise<void> {
    const grant = await this.prisma.accessGrant.update({
      where: { grantId },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 256) },
      select: { userId: true, entitlementCode: true },
    });
    await this.recomputeCache(grant.userId, grant.entitlementCode);
  }

  /** Revoke every live grant from one source (webhooks use this when a
   *  subscription is refunded/cancelled). */
  async revokeBySource(params: {
    userId: string;
    source: GrantSource;
    sourceRef?: string;
    reason: string;
    entitlementCode?: string;
  }): Promise<number> {
    const code = params.entitlementCode ?? this.defaultCode;
    const result = await this.prisma.accessGrant.updateMany({
      where: {
        userId: params.userId,
        entitlementCode: code,
        source: params.source,
        ...(params.sourceRef ? { sourceRef: params.sourceRef } : {}),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: params.reason.slice(0, 256),
      },
    });
    await this.recomputeCache(params.userId, code);
    return result.count;
  }

  /** Extend (or create) the subscription-source grant to a new period end —
   *  the webhook translation of renewals. Idempotent per sourceRef. */
  async syncSubscriptionGrant(params: {
    userId: string;
    sourceRef: string;
    expiresAt: Date | null;
    active: boolean;
    entitlementCode?: string;
  }): Promise<void> {
    const code = params.entitlementCode ?? this.defaultCode;
    const existing = await this.prisma.accessGrant.findFirst({
      where: {
        userId: params.userId,
        entitlementCode: code,
        source: 'subscription',
        sourceRef: params.sourceRef,
      },
      select: { grantId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!params.active) {
      if (existing) {
        await this.prisma.accessGrant.update({
          where: { grantId: existing.grantId },
          data: {
            revokedAt: new Date(),
            revokedReason: 'subscription_inactive',
          },
        });
      }
    } else if (existing) {
      await this.prisma.accessGrant.update({
        where: { grantId: existing.grantId },
        data: { expiresAt: params.expiresAt, revokedAt: null },
      });
    } else {
      await this.prisma.accessGrant.create({
        data: {
          userId: params.userId,
          entitlementCode: code,
          source: 'subscription',
          sourceRef: params.sourceRef,
          expiresAt: params.expiresAt,
        },
      });
    }
    await this.recomputeCache(params.userId, code);
  }

  /** THE runtime gate check. Fail-open on infrastructure errors (billing
   *  outage must not take down the product), fail-closed on "no grant". */
  async hasAccess(userId: string, entitlementCode?: string): Promise<boolean> {
    const code = entitlementCode ?? this.defaultCode;
    try {
      const cacheKey = this.cacheKey(userId, code);
      if (this.redis) {
        const cached = await this.redis.get(cacheKey).catch(() => null);
        if (cached === '1') return true;
        if (cached === '0') return false;
      }
      const summary = await this.summarize(userId, code);
      if (this.redis) {
        const ttl = summary.active
          ? this.boundedTtl(summary.expiresAt)
          : CACHE_TTL_SECONDS;
        await this.redis
          .set(cacheKey, summary.active ? '1' : '0', 'EX', ttl)
          .catch(() => undefined);
      }
      return summary.active;
    } catch (error) {
      this.logger.error('hasAccess failed — failing open', {
        userId,
        entitlementCode: code,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return true;
    }
  }

  /** Server-truth access block for the session/user payload. */
  async summarize(
    userId: string,
    entitlementCode?: string,
  ): Promise<AccessSummary> {
    const code = entitlementCode ?? this.defaultCode;
    const now = new Date();
    // +2s tolerance: a grant's DB-assigned startsAt can land marginally after
    // this process's clock (timestamp rounding / server skew) — a just-created
    // grant must never be invisible to its own recompute.
    const startsBefore = new Date(now.getTime() + 2000);
    const grants = await this.prisma.accessGrant.findMany({
      where: {
        userId,
        entitlementCode: code,
        revokedAt: null,
        startsAt: { lte: startsBefore },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { expiresAt: true, source: true },
    });
    if (!grants.length) {
      return {
        entitlementCode: code,
        active: false,
        expiresAt: null,
        source: null,
      };
    }
    const lifetime = grants.find((grant) => grant.expiresAt === null);
    const carrier =
      lifetime ??
      grants.reduce((best, grant) =>
        (grant.expiresAt as Date) > (best.expiresAt as Date) ? grant : best,
      );
    return {
      entitlementCode: code,
      active: true,
      expiresAt: carrier.expiresAt,
      source: carrier.source,
    };
  }

  /** Recompute the UserEntitlement cache row from the ledger + bust Redis. */
  private async recomputeCache(userId: string, code: string): Promise<void> {
    const summary = await this.summarize(userId, code);
    await this.prisma.userEntitlement.upsert({
      where: { userId_entitlementCode: { userId, entitlementCode: code } },
      update: {
        status: summary.active
          ? EntitlementStatus.active
          : EntitlementStatus.expired,
        expiresAt: summary.expiresAt,
        lastSyncedAt: new Date(),
        source: SubscriptionProvider.manual,
      },
      create: {
        userId,
        entitlementCode: code,
        status: summary.active
          ? EntitlementStatus.active
          : EntitlementStatus.expired,
        expiresAt: summary.expiresAt,
        source: SubscriptionProvider.manual,
        activatedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
    if (this.redis) {
      await this.redis.del(this.cacheKey(userId, code)).catch(() => undefined);
    }
  }

  private async rewardDaysUsed(
    userId: string,
    source: GrantSource,
  ): Promise<number> {
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, source, revokedAt: null },
      select: { startsAt: true, expiresAt: true, metadata: true },
    });
    // NOTE: with stacking, expiresAt - startsAt no longer equals the granted
    // days; the authoritative count rides metadata.grantedDays (set below in
    // grant()) with the duration as a legacy fallback.
    return grants.reduce((sum, grant) => {
      const meta = grant.metadata as { grantedDays?: number } | null;
      if (typeof meta?.grantedDays === 'number') {
        return sum + Math.max(0, meta.grantedDays);
      }
      if (!grant.expiresAt) return sum;
      const days =
        (grant.expiresAt.getTime() - grant.startsAt.getTime()) /
        (24 * 60 * 60 * 1000);
      return sum + Math.max(0, Math.round(days));
    }, 0);
  }

  private boundedTtl(expiresAt: Date | null): number {
    if (!expiresAt) return CACHE_TTL_SECONDS;
    const secondsLeft = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return Math.max(1, Math.min(CACHE_TTL_SECONDS, secondsLeft));
  }

  private cacheKey(userId: string, code: string): string {
    return `crave:entl:v1:${userId}:${code}`;
  }
}
