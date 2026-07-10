import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * ONE declaration per grant source (no parallel lists — see the repo's
 * type-list-disease memory): its kind. Adding a source is exhaustive by
 * construction: the union type and the day/absolute branch come from here.
 *
 * - 'absolute' grants carry expiresAt (NULL = lifetime): subscription
 *   periods, admin comps, promo windows.
 * - 'day' grants carry grantedDays; coverage is DERIVED at read time (see
 *   summarize). Banked-forever semantics BLESSED 2026-07-09: unconsumed
 *   days pay out whenever coverage would otherwise lapse, indefinitely.
 *
 * Monetary engagement incentives (reward_photo/reward_referral) were
 * DELETED 2026-07-09 with the hard-paywall lock-in — engagement is
 * recognized, not paid (see product/profile.md recognition mechanics).
 * winback/gift are the operational day sources. A future EARNED source
 * re-adds a row here plus the per-source anti-farming cap machinery
 * (deleted with the incentives — git history: rewardDaysEverGranted).
 */
const GRANT_POLICY = {
  subscription: { kind: 'absolute' },
  comp: { kind: 'absolute' },
  promo: { kind: 'absolute' },
  trial_base: { kind: 'day' },
  winback: { kind: 'day' },
  gift: { kind: 'day' },
} as const satisfies Record<string, { kind: 'absolute' | 'day' }>;

export type GrantSource = keyof typeof GRANT_POLICY;
interface GrantPolicy {
  kind: 'absolute' | 'day';
}

export interface GrantInput {
  userId: string;
  entitlementCode?: string;
  source: GrantSource;
  /** Day sources: days of coverage (derived at read). Absolute sources
   *  ignore this — they take expiresAt/lifetime. */
  days?: number;
  expiresAt?: Date | null;
  /** expiresAt NULL on an ABSOLUTE source = lifetime. */
  lifetime?: boolean;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

export interface AccessSummary {
  entitlementCode: string;
  active: boolean;
  /** End of ALL coverage (paid + banked days). NULL = lifetime. This is the
   *  GATE horizon — what hasAccess derives from. */
  expiresAt: Date | null;
  /** End of the live PAID/absolute window (subscription period end, comp
   *  expiry). NULL when lifetime OR when no live absolute exists. The
   *  product's "renews/expires on" number. */
  paidUntil: Date | null;
  /** End of derived coverage beyond paidUntil (banked days). Equals
   *  expiresAt; surfaced separately so UI can say "then N banked days". */
  coverageUntil: Date | null;
  /** The source of the LIVE PAID grant when one exists (a paying subscriber
   *  is never told their access "comes from" a banked reward); falls back
   *  to the day-chain carrier when only banked coverage remains. */
  source: string | null;
}

const CACHE_TTL_SECONDS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Prisma error code for unique-constraint violation. */
const P2002 = 'P2002';

interface LedgerGrantRow {
  grantId: string;
  source: string;
  startsAt: Date;
  expiresAt: Date | null;
  grantedDays: number | null;
  revokedAt: Date | null;
}

const GRANT_ROW_SELECT = {
  grantId: true,
  source: true,
  startsAt: true,
  expiresAt: true,
  grantedDays: true,
  revokedAt: true,
} as const;

/**
 * Layer 2+3 of plans/payments-ideal-shape.md — the access-grant ledger and
 * the ONE runtime access check.
 *
 * Representation (red-team hardened 2026-07-08, ideal-shaped 2026-07-09):
 * - ABSOLUTE grants carry expiresAt (NULL = lifetime); DAY grants carry the
 *   grantedDays COLUMN (schema-enforced XOR with expiresAt). Coverage for
 *   day grants is DERIVED at read time: a chain anchored at the latest
 *   absolute-grant "effective end" (expiry, clamped to revocation), each
 *   segment starting no earlier than the grant was earned. Deriving instead
 *   of storing kills a whole defect class: refunding a subscription cannot
 *   leave a reward tail, revoking a chain member coherently shifts later
 *   members, and days earned under a lifetime comp survive its revocation.
 * - Every ledger WRITE runs in a transaction holding a per-(user,code)
 *   advisory lock; the live-rows partial unique index on
 *   (userId, source, sourceRef) is the RED backstop (P2002 = idempotent
 *   no-op).
 * - Redis is the ONLY cache (single-writer: recompute SETs, the read path
 *   SET-NXes cold misses). hasAccess NEVER throws into a product path.
 */
@Injectable()
export class EntitlementService {
  private readonly logger: LoggerService;
  private redis: Redis | null = null;
  readonly defaultCode: string;

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

  /** Write a grant to the ledger and recompute the cache. */
  async grant(input: GrantInput): Promise<{ grantId: string | null }> {
    const code = input.entitlementCode ?? this.defaultCode;
    const policy: GrantPolicy = GRANT_POLICY[input.source];
    const grantId = await this.withUserLock(input.userId, code, async (tx) => {
      let expiresAt: Date | null = null;
      let grantedDays: number | null = null;
      if (policy.kind === 'day') {
        const days = input.days ?? 0;
        if (days <= 0) return null;
        grantedDays = days;
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
            grantedDays,
            metadata: (input.metadata ?? undefined) as
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

  /** THE runtime gate check (the app-wide paywall interceptor's question).
   *  Fail-open on infrastructure errors (billing outage must not take down
   *  the product), fail-closed on "no grant". */
  async hasAccess(userId: string): Promise<boolean> {
    const code = this.defaultCode;
    try {
      const cacheKey = this.cacheKey(userId, code);
      if (this.redis) {
        const cached = await this.redis.get(cacheKey).catch(() => null);
        if (cached === '1') return true;
        if (cached === '0') return false;
      }
      const summary = await this.summarize(userId);
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
      select: GRANT_ROW_SELECT,
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
      paidUntil: null,
      coverageUntil: null,
      source: null,
    };

    const visible = grants.filter(
      (grant) => grant.startsAt.getTime() <= startsBefore,
    );
    const absolutes = visible.filter((grant) => grant.grantedDays === null);
    const dayGrants = visible.filter(
      (grant) => grant.grantedDays !== null && grant.revokedAt === null,
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
        paidUntil: null,
        coverageUntil: null,
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
      const days = grant.grantedDays ?? 0;
      if (days <= 0) continue;
      const segStart = Math.max(grant.startsAt.getTime(), coverageEnd);
      coverageEnd = segStart + days * DAY_MS;
      dayCarrier = grant;
    }

    const absoluteEnd = bestAbsolute?.expiresAt?.getTime() ?? 0;
    const finalEnd = Math.max(absoluteEnd, coverageEnd > now ? coverageEnd : 0);
    if (finalEnd <= now) return inactive;
    // Source: the live PAID grant when one exists — a paying subscriber is
    // never told their access "comes from" a banked reward.
    const carrier = bestAbsolute ?? (coverageEnd > now ? dayCarrier : null);
    return {
      entitlementCode: code,
      active: true,
      expiresAt: new Date(finalEnd),
      paidUntil: bestAbsolute?.expiresAt ?? null,
      coverageUntil: new Date(finalEnd),
      source: carrier?.source ?? null,
    };
  }

  /** Recompute the Redis cache from the ledger (single authoritative writer
   *  — see hasAccess NX note). Called after every ledger write. */
  private async recomputeCache(userId: string, code: string): Promise<void> {
    if (!this.redis) return;
    const summary = await this.summarize(userId, code);
    const ttl = summary.active
      ? this.boundedTtl(summary.expiresAt)
      : CACHE_TTL_SECONDS;
    await this.redis
      .set(this.cacheKey(userId, code), summary.active ? '1' : '0', 'EX', ttl)
      .catch(() => undefined);
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
