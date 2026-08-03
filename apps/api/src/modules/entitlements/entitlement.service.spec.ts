import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { EntitlementService } from './entitlement.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LoggerService } from '../../shared';

/**
 * Integration spec for the access-grant ledger (real dev DB — the ledger's
 * value IS its persistence semantics; mocking Prisma would test nothing).
 * Uses a dedicated probe user, cleaned before each run.
 */
const prisma = new PrismaClient();
const fakeLogger = {
  setContext: () => fakeLogger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as LoggerService;
const fakeConfig = {
  get: (key: string) =>
    key === 'billing.defaultEntitlement' ? 'premium' : undefined,
} as never;

const service = new EntitlementService(
  prisma as unknown as PrismaService,
  fakeConfig,
  null as never, // no redis in tests — cache path is optional by design
  fakeLogger,
);

let userId: string;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: 'entitlement-spec@test.local' },
    update: {},
    create: {
      email: 'entitlement-spec@test.local',
      authProvider: 'clerk',
      authProviderUserId: 'spec-ent-1',
    },
    select: { userId: true },
  });
  userId = user.userId;
});

beforeEach(async () => {
  await prisma.accessGrant.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.accessGrant.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

describe('EntitlementService (ledger integration)', () => {
  it('denies by default and grants trial access', async () => {
    expect((await service.accessVerdict(userId)).kind).toBe('denied');
    await service.grant({ userId, source: 'trial_base', days: 14 });
    expect((await service.accessVerdict(userId)).kind).toBe('granted');
    const summary = await service.summarize(userId);
    expect(summary.source).toBe('trial_base');
    expect(summary.expiresAt).not.toBeNull();
  });

  it('lifetime comp wins as carrier and revocation falls back, never cuts off', async () => {
    await service.grant({ userId, source: 'trial_base', days: 7 });
    const comp = await service.grant({
      userId,
      source: 'comp',
      lifetime: true,
      sourceRef: 'spec friend',
    });
    let summary = await service.summarize(userId);
    expect(summary.source).toBe('comp');
    expect(summary.expiresAt).toBeNull();

    await service.revoke(comp.grantId!, 'spec cleanup');
    summary = await service.summarize(userId);
    expect(summary.active).toBe(true); // trial still live
    expect(summary.source).toBe('trial_base');
  });

  it('REFUND-TAIL: a reward stacked on a subscription horizon dies with the refund', async () => {
    // Annual subscription (365d), then a 1-day gift day-grant "on top".
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: 'revenuecat:txn_tail',
      expiresAt: new Date(Date.now() + 365 * 864e5),
      active: true,
    });
    await service.grant({
      userId,
      source: 'winback',
      days: 1,
      sourceRef: 'photo:tail-1',
    });
    // Immediate refund revokes the subscription grant.
    await service.revokeBySource({
      userId,
      source: 'subscription',
      reason: 'refund',
    });
    const summary = await service.summarize(userId);
    // The reward chain re-anchors to the revocation: the user keeps their
    // EARNED 1 day, not a 366-day tail.
    expect(summary.active).toBe(true);
    const days =
      (summary.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(1.01);
    expect(summary.source).toBe('winback');
  });

  it('revoking an early chain member shifts later members instead of stranding time', async () => {
    await service.grant({
      userId,
      source: 'winback',
      days: 10,
      sourceRef: 'photo:a',
    });
    const second = await service.grant({
      userId,
      source: 'winback',
      days: 10,
      sourceRef: 'photo:b',
    });
    expect(second.grantId).not.toBeNull();
    let summary = await service.summarize(userId);
    let days =
      (summary.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(19);
    // Revoke the FIRST grant: coverage re-derives to ~10 days (grant b's
    // days), not the stale 20-day absolute endpoint.
    const first = await prisma.accessGrant.findFirst({
      where: { userId, sourceRef: 'photo:a' },
      select: { grantId: true },
    });
    await service.revoke(first!.grantId, 'fraud');
    summary = await service.summarize(userId);
    days = (summary.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(9);
    expect(days).toBeLessThanOrEqual(10.01);
  });

  it('concurrent same-sourceRef rewards collapse to one grant (unique backstop)', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.grant({
          userId,
          source: 'winback',
          days: 1,
          sourceRef: 'photo:race',
        }),
      ),
    );
    const granted = results.filter((result) => result.grantId !== null);
    expect(granted).toHaveLength(1);
    const rows = await prisma.accessGrant.findMany({
      where: { userId, sourceRef: 'photo:race' },
    });
    expect(rows).toHaveLength(1);
  });

  it('subscription grant refuses to become lifetime (active without expiry)', async () => {
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: 'revenuecat:txn_nolife',
      expiresAt: null,
      active: true,
    });
    expect((await service.accessVerdict(userId)).kind).toBe('denied');
  });

  it('subscription sync: create, renew extends, deactivate revokes — idempotent per sourceRef', async () => {
    const ref = 'stripe:sub_spec';
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: ref,
      expiresAt: new Date(Date.now() + 30 * 864e5),
      active: true,
    });
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: ref,
      expiresAt: new Date(Date.now() + 60 * 864e5),
      active: true,
    });
    // renewals reuse ONE grant row, not a pile
    const rows = await prisma.accessGrant.findMany({
      where: { userId, sourceRef: ref },
    });
    expect(rows).toHaveLength(1);
    expect((await service.summarize(userId)).source).toBe('subscription');

    await service.syncSubscriptionGrant({
      userId,
      sourceRef: ref,
      expiresAt: null,
      active: false,
    });
    expect((await service.accessVerdict(userId)).kind).toBe('denied');
  });

  it('paidUntil vs coverageUntil: a paying subscriber with banked days is never told access comes from a reward', async () => {
    const periodEnd = new Date(Date.now() + 30 * 864e5);
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: 'revenuecat:txn_paid',
      expiresAt: periodEnd,
      active: true,
    });
    await service.grant({
      userId,
      source: 'winback',
      days: 5,
      sourceRef: 'photo:paid-1',
    });
    const summary = await service.summarize(userId);
    expect(summary.source).toBe('subscription'); // NOT the banked day source
    expect(summary.paidUntil?.getTime()).toBe(periodEnd.getTime());
    // total coverage extends ~5 banked days past the paid window
    const bankedDays =
      (summary.coverageUntil!.getTime() - periodEnd.getTime()) / 864e5;
    expect(bankedDays).toBeGreaterThan(4.99);
    expect(bankedDays).toBeLessThanOrEqual(5.01);
    expect(summary.expiresAt?.getTime()).toBe(summary.coverageUntil?.getTime());
  });

  /**
   * F103 / D3 — the emptiest row is no longer the most powerful one.
   *
   * Before the `kind` column, a 'days' row that lost its granted_days was
   * both-null, which is how LIFETIME is spelled, and deriveSummary returned
   * unbounded access. The per-kind CHECK makes that row unrepresentable, and
   * the derivation now reads the row's declared kind rather than inferring it.
   */
  describe('grant kind is explicit (F103/D3)', () => {
    it('every write NAMES its shape', async () => {
      await service.grant({ userId, source: 'winback', days: 3 });
      await service.grant({ userId, source: 'comp', lifetime: true });
      await service.syncSubscriptionGrant({
        userId,
        sourceRef: 'revenuecat:txn_kind',
        expiresAt: new Date(Date.now() + 30 * 864e5),
        active: true,
      });
      const rows = await prisma.accessGrant.findMany({
        where: { userId },
        select: { source: true, kind: true },
      });
      expect(new Map(rows.map((r) => [r.source, r.kind]))).toEqual(
        new Map([
          ['winback', 'days'],
          ['comp', 'lifetime'],
          ['subscription', 'window'],
        ]),
      );
    });

    it('RED — a day-grant that loses its granted_days can no longer become immortal', async () => {
      const { grantId } = await service.grant({
        userId,
        source: 'winback',
        days: 3,
      });
      // The exact corruption F103 described: blank the day count, leaving the
      // both-null row the old NAND constraint permitted. The DB now refuses.
      await expect(
        prisma.accessGrant.update({
          where: { grantId: grantId! },
          data: { grantedDays: null },
        }),
      ).rejects.toThrow(/access_grants_kind_shape/);

      // ... and the row is untouched: still a bounded day grant.
      const summary = await service.summarize(userId);
      expect(summary.expiresAt).not.toBeNull();
    });

    it('a lifetime row cannot quietly acquire an expiry, nor a window row a day count', async () => {
      const lifetime = await service.grant({
        userId,
        source: 'comp',
        lifetime: true,
      });
      await expect(
        prisma.accessGrant.update({
          where: { grantId: lifetime.grantId! },
          data: { expiresAt: new Date(Date.now() + 864e5) },
        }),
      ).rejects.toThrow(/access_grants_kind_shape/);
    });
  });

  /**
   * F111 / D8 — the photo reward is abolished. Migration
   * 20260803010000_abolish_photo_reward_grants deleted its rows; this proves
   * the retired vocabulary is gone from the table entirely, so nothing can
   * surface `access.source = 'reward_photo'` to a client again.
   */
  it('the retired reward sources hold no rows anywhere in the ledger', async () => {
    const survivors = await prisma.accessGrant.count({
      where: { source: { in: ['reward_photo', 'reward_referral'] } },
    });
    expect(survivors).toBe(0);
  });
});
