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

/** Sources whose grants are DAY grants: they carry metadata.grantedDays and
 *  NO absolute expiry — coverage is derived at read time (see summarize). */
const DAY_GRANT_SOURCES: ReadonlySet<GrantSource> = new Set([
  'trial_base',
  'reward_photo',
  'reward_referral',
  'winback',
  'gift',
]);

export interface GrantInput {
  userId: string;
  entitlementCode?: string;
  /** Day grants (trial/reward/winback/gift): days of coverage, derived at
   *  read time. Absolute sources (subscription/comp/promo) ignore this. */
  days?: number;
  source: GrantSource;
  expiresAt?: Date | null;
  /** expiresAt NULL on an ABSOLUTE source = lifetime. */
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
const DAY_MS = 24 * 60 * 60 * 1000;
/** Prisma error code for unique-constraint violation. */
const P2002 = 'P2002';

interface LedgerGrantRow {
  grantId: string;
  source: string;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  metadata: Prisma.JsonValue;
}

/**
 * Layer 2+3 of plans/payments-ideal-shape.md — the access-grant ledger and
 * the ONE runtime access check.
 *
 * Representation (red-team hardened 2026-07-08):
 * - ABSOLUTE grants (subscription/comp/promo) carry expiresAt; NULL = lifetime.
 * - DAY grants (trial_base, rewards, winback, gift) carry metadata.grantedDays
 *   and expiresAt NULL — their coverage is DERIVED at read time as a chain
 *   anchored at the latest absolute-grant "effective end" (expiry, or
 *   revocation time if revoked earlier). Deriving instead of storing kills a
 *   whole defect class: refunding a subscription can no longer leave a
 *   year-long reward tail (the chain re-anchors to the revocation), revoking
 *   a chain member coherently shifts later members, and days earned under a
 *   lifetime comp survive the comp's revocation.
 * - Every ledger WRITE runs in a transaction holding a per-(user,code)
 *   advisory lock: check-then-write sequences (caps, idempotency, sync) are
 *   single-writer. A partial unique index on (userId, source, sourceRef) is
 *   the RED backstop; P2002 is treated as idempotent no-op.
 *
 * Truth = access_grants rows; UserEntitlement is a materialized cache
 * recomputed on every grant write. Redis is single-writer: recomputeCache
 * SETs the computed value; hasAccess only SET-NXes on cold misses so a stale
 * read can never clobber a recompute. hasAccess NEVER throws into a product
 * path (a broken billing lookup must not take down search).
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
    const grantId = await this.withUserLock(input.userId, code, async (tx) => {
      let expiresAt: Date | null;
      let metadata = input.metadata;
      if (DAY_GRANT_SOURCES.has(input.source)) {
        let days = input.days ?? 0;
        const cap = REWARD_DAY_CAPS[input.source];
        if (cap) {
          const used = await this.rewardDaysUsed(
            tx,
            input.userId,
            input.source,
          );
          days = Math.max(0, Math.min(days, cap - used));
          if (days === 0) {
            this.logger.info('Reward grant clamped to zero (cap reached)', {
              userId: input.userId,
              source: input.source,
              cap,
            });
            return null;
          }
        }
        if (days <= 0) return null;
        // Day grants carry duration, not expiry — coverage derives at read.
        expiresAt = null;
        metadata = { ...(metadata ?? {}), grantedDays: days };
      } else if (input.lifetime) {
        expiresAt = null;
      } else if (input.expiresAt !== undefined) {
        expiresAt = input.expiresAt;
      } else {
        // Absolute source with neither expiry nor lifetime is a caller bug.
        throw new Error(
          `grant(${input.source}) requires expiresAt or lifetime`,
        );
      }

      try {
        const grant = await tx.accessGrant.create({
          data: {
            userId: input.userId,
            entitlementCode: code,
            source: input.source,
            sourceRef: input.sourceRef ?? null,
            expiresAt,
            metadata: (metadata ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
          },
          select: { grantId: true },
        });
        return grant.grantId;
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          // The (userId, source, sourceRef) unique index IS the idempotency
          // contract — a concurrent duplicate is a no-op, not an error.
          this.logger.info('Grant already exists for sourceRef (idempotent)', {
            userId: input.userId,
            source: input.source,
            sourceRef: input.sourceRef,
          });
          return null;
        }
        throw error;
      }
    });
    await this.recomputeCache(input.userId, code);
    if (grantId) {
      this.logger.info('Access granted', {
        userId: input.userId,
        entitlementCode: code,
        source: input.source,
      });
    }
    return { grantId };
  }

  /** Feature-level gate for PARAM/response-shaped gating (endpoint-shaped
   *  gating uses @RequireEntitlement instead). Honors ENTITLEMENT_GATING:
   *  off -> always allowed; log -> allowed but would-blocks are recorded;
   *  enforce -> callers shape the response (lock/strip), NEVER throw from
   *  here. No userId (anonymous) counts as no access. */
  async gateFeature(
    userId: string | null | undefined,
    feature: string,
    entitlementCode?: string,
  ): Promise<{ allowed: boolean }> {
    const mode = process.env.ENTITLEMENT_GATING?.trim().toLowerCase();
    if (mode !== 'log' && mode !== 'enforce') return { allowed: true };
    const hasAccess = userId
      ? await this.hasAccess(userId, entitlementCode)
      : false;
    if (hasAccess) return { allowed: true };
    this.logger.info(
      mode === 'log'
        ? 'Entitlement gate WOULD lock feature (log mode)'
        : 'Entitlement gate locked feature',
      { userId: userId ?? 'anonymous', feature },
    );
    return { allowed: mode === 'log' };
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

  /** Account deletion: revoke every live grant across all entitlement codes
   *  (history stays for audit). */
  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const codes = await this.prisma.accessGrant.findMany({
      where: { userId, revokedAt: null },
      select: { entitlementCode: true },
      distinct: ['entitlementCode'],
    });
    const result = await this.prisma.accessGrant.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 256) },
    });
    for (const row of codes) {
      await this.recomputeCache(userId, row.entitlementCode);
    }
    return result.count;
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
   *  subscription is refunded/cancelled). sourceRefPrefix scopes to one
   *  provider's refs (e.g. 'stripe:') without knowing the exact id. */
  async revokeBySource(params: {
    userId: string;
    source: GrantSource;
    sourceRef?: string;
    sourceRefPrefix?: string;
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
        ...(params.sourceRefPrefix
          ? { sourceRef: { startsWith: params.sourceRefPrefix } }
          : {}),
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
   *  the webhook translation of renewals. Idempotent per sourceRef; all
   *  same-sourceRef rows are settled (duplicates from historical races are
   *  revoked, never left live). */
  async syncSubscriptionGrant(params: {
    userId: string;
    sourceRef: string;
    expiresAt: Date | null;
    active: boolean;
    entitlementCode?: string;
  }): Promise<void> {
    const code = params.entitlementCode ?? this.defaultCode;
    // A subscription grant is never lifetime: active requires a period end.
    if (params.active && !params.expiresAt) {
      this.logger.warn(
        'Refusing subscription grant without expiry (would be lifetime)',
        { userId: params.userId, sourceRef: params.sourceRef },
      );
      return;
    }
    const staleCodes = await this.withUserLock(
      params.userId,
      code,
      async (tx) => {
        // One subscription carries ONE entitlement: a product change that
        // moves this sourceRef to a new code must not leave the old code's
        // grant live (revoked FIRST — the live-rows unique index would
        // otherwise block re-creating under the new code).
        const crossCode = await tx.accessGrant.findMany({
          where: {
            userId: params.userId,
            source: 'subscription',
            sourceRef: params.sourceRef,
            entitlementCode: { not: code },
            revokedAt: null,
          },
          select: { grantId: true, entitlementCode: true },
        });
        if (crossCode.length > 0) {
          await tx.accessGrant.updateMany({
            where: { grantId: { in: crossCode.map((row) => row.grantId) } },
            data: {
              revokedAt: new Date(),
              revokedReason: 'entitlement_changed',
            },
          });
        }
        const rows = await tx.accessGrant.findMany({
          where: {
            userId: params.userId,
            entitlementCode: code,
            source: 'subscription',
            sourceRef: params.sourceRef,
          },
          select: { grantId: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!params.active) {
          await tx.accessGrant.updateMany({
            where: {
              grantId: { in: rows.map((row) => row.grantId) },
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
              revokedReason: 'subscription_inactive',
            },
          });
          return crossCode.map((row) => row.entitlementCode);
        }
        if (rows.length > 0) {
          const [keeper, ...duplicates] = rows;
          await tx.accessGrant.update({
            where: { grantId: keeper.grantId },
            data: { expiresAt: params.expiresAt, revokedAt: null },
          });
          if (duplicates.length > 0) {
            await tx.accessGrant.updateMany({
              where: {
                grantId: { in: duplicates.map((row) => row.grantId) },
                revokedAt: null,
              },
              data: {
                revokedAt: new Date(),
                revokedReason: 'duplicate_subscription_row',
              },
            });
          }
          return crossCode.map((row) => row.entitlementCode);
        }
        try {
          await tx.accessGrant.create({
            data: {
              userId: params.userId,
              entitlementCode: code,
              source: 'subscription',
              sourceRef: params.sourceRef,
              expiresAt: params.expiresAt,
            },
          });
        } catch (error) {
          if (!this.isUniqueViolation(error)) throw error;
        }
        return crossCode.map((row) => row.entitlementCode);
      },
    );
    for (const staleCode of new Set(staleCodes ?? [])) {
      await this.recomputeCache(params.userId, staleCode);
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
        // NX: recomputeCache is the authoritative writer; a read-path fill
        // must never overwrite a value a concurrent recompute just SET.
        await this.redis
          .set(cacheKey, summary.active ? '1' : '0', 'EX', ttl, 'NX')
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

  /** Server-truth access block for the session/user payload. Coverage is
   *  DERIVED: absolute grants contribute their live windows; day grants
   *  chain sequentially from the latest absolute "effective end" (expiry or
   *  revocation, whichever cut it short), never starting before they were
   *  earned. Pure function of the ledger rows — no stored derived state. */
  async summarize(
    userId: string,
    entitlementCode?: string,
  ): Promise<AccessSummary> {
    const code = entitlementCode ?? this.defaultCode;
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, entitlementCode: code },
      select: {
        grantId: true,
        source: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        metadata: true,
      },
      orderBy: { startsAt: 'asc' },
    });
    return this.deriveSummary(code, grants);
  }

  /** Pure derivation — exposed shape documented on summarize(). */
  private deriveSummary(code: string, grants: LedgerGrantRow[]): AccessSummary {
    const now = Date.now();
    // +2s tolerance: a grant's DB-assigned startsAt can land marginally after
    // this process's clock — a just-created grant must never be invisible to
    // its own recompute.
    const startsBefore = now + 2000;
    const inactive: AccessSummary = {
      entitlementCode: code,
      active: false,
      expiresAt: null,
      source: null,
    };

    const visible = grants.filter(
      (grant) => grant.startsAt.getTime() <= startsBefore,
    );
    const absolutes = visible.filter((grant) => !this.isDayGrant(grant));
    const dayGrants = visible.filter(
      (grant) => this.isDayGrant(grant) && grant.revokedAt === null,
    );

    // Live lifetime grant ends the derivation: access is unbounded.
    const lifetime = absolutes.find(
      (grant) => grant.revokedAt === null && grant.expiresAt === null,
    );
    if (lifetime) {
      return {
        entitlementCode: code,
        active: true,
        expiresAt: null,
        source: lifetime.source,
      };
    }

    // Live absolute coverage (unrevoked, future expiry).
    let bestAbsolute: LedgerGrantRow | null = null;
    for (const grant of absolutes) {
      if (grant.revokedAt !== null) continue;
      if (!grant.expiresAt || grant.expiresAt.getTime() <= now) continue;
      if (
        !bestAbsolute ||
        grant.expiresAt.getTime() > bestAbsolute.expiresAt!.getTime()
      ) {
        bestAbsolute = grant;
      }
    }

    // Anchor for the day chain: the latest EFFECTIVE end among all absolute
    // grants — expiry, clamped to revocation when revoked earlier. A refunded
    // subscription anchors the chain at the refund, not the paid-out horizon.
    let anchor = 0;
    for (const grant of absolutes) {
      const expiry = grant.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const effectiveEnd = grant.revokedAt
        ? Math.min(expiry, grant.revokedAt.getTime())
        : expiry;
      if (Number.isFinite(effectiveEnd)) {
        anchor = Math.max(anchor, effectiveEnd);
      } else if (grant.revokedAt) {
        // Lifetime grant revoked: it covered until the revocation.
        anchor = Math.max(anchor, grant.revokedAt.getTime());
      }
    }

    // Chain day grants: each consumes wall-clock after the previous coverage
    // ends, never before it was earned.
    let coverageEnd = anchor;
    let dayCarrier: LedgerGrantRow | null = null;
    for (const grant of dayGrants) {
      const days = this.grantedDays(grant);
      if (days <= 0) continue;
      const segStart = Math.max(grant.startsAt.getTime(), coverageEnd);
      coverageEnd = segStart + days * DAY_MS;
      dayCarrier = grant;
    }

    const absoluteEnd = bestAbsolute?.expiresAt?.getTime() ?? 0;
    const finalEnd = Math.max(absoluteEnd, coverageEnd > now ? coverageEnd : 0);
    if (finalEnd <= now) return inactive;
    const carrier =
      coverageEnd >= absoluteEnd && coverageEnd > now && dayCarrier
        ? dayCarrier
        : bestAbsolute;
    return {
      entitlementCode: code,
      active: true,
      expiresAt: new Date(finalEnd),
      source: carrier?.source ?? null,
    };
  }

  /** Recompute the UserEntitlement cache row from the ledger + write-through
   *  Redis (single authoritative writer — see hasAccess NX note). */
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
      const ttl = summary.active
        ? this.boundedTtl(summary.expiresAt)
        : CACHE_TTL_SECONDS;
      await this.redis
        .set(this.cacheKey(userId, code), summary.active ? '1' : '0', 'EX', ttl)
        .catch(() => undefined);
    }
  }

  /** Serialize all ledger writes for one (user, entitlement): a transaction
   *  holding a pg advisory xact lock. Kills every check-then-write race in
   *  this module (caps, idempotency, subscription sync, signup trial). */
  private async withUserLock<T>(
    userId: string,
    code: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${code}`}, 0))`;
      return fn(tx);
    });
  }

  private isDayGrant(grant: LedgerGrantRow): boolean {
    return (
      DAY_GRANT_SOURCES.has(grant.source as GrantSource) ||
      typeof (grant.metadata as { grantedDays?: unknown } | null)
        ?.grantedDays === 'number'
    );
  }

  private grantedDays(grant: LedgerGrantRow): number {
    const meta = grant.metadata as { grantedDays?: number } | null;
    if (typeof meta?.grantedDays === 'number') {
      return Math.max(0, meta.grantedDays);
    }
    // Legacy rows (pre-derivation) stored absolute expiries.
    if (grant.expiresAt) {
      return Math.max(
        0,
        Math.round(
          (grant.expiresAt.getTime() - grant.startsAt.getTime()) / DAY_MS,
        ),
      );
    }
    return 0;
  }

  private async rewardDaysUsed(
    tx: Prisma.TransactionClient,
    userId: string,
    source: GrantSource,
  ): Promise<number> {
    const grants = await tx.accessGrant.findMany({
      where: { userId, source, revokedAt: null },
      select: {
        grantId: true,
        source: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        metadata: true,
      },
    });
    return grants.reduce((sum, grant) => sum + this.grantedDays(grant), 0);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === P2002
    );
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
