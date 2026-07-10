/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { EntitlementService } from './entitlement.service';
import { RewardGrantService } from './reward-grant.service';
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
const rewards = new RewardGrantService(service, fakeLogger);

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
  await prisma.userEntitlement.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.accessGrant.deleteMany({ where: { userId } });
  await prisma.userEntitlement.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

describe('EntitlementService (ledger integration)', () => {
  it('denies by default and grants trial access', async () => {
    expect(await service.hasAccess(userId)).toBe(false);
    await service.grant({ userId, source: 'trial_base', days: 14 });
    expect(await service.hasAccess(userId)).toBe(true);
    const summary = await service.summarize(userId);
    expect(summary.source).toBe('trial_base');
    expect(summary.expiresAt).not.toBeNull();
  });

  it('clamps reward grants at the per-source cap and never errors', async () => {
    const first = await service.grant({
      userId,
      source: 'reward_photo',
      days: 25,
    });
    expect(first.grantId).not.toBeNull();
    // cap is 30 — second grant clamps to 5, third clamps to zero (no grant)
    const second = await service.grant({
      userId,
      source: 'reward_photo',
      days: 25,
    });
    expect(second.grantId).not.toBeNull();
    const third = await service.grant({
      userId,
      source: 'reward_photo',
      days: 5,
    });
    expect(third.grantId).toBeNull();
    const summary = await service.summarize(userId);
    const days =
      (summary.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30.01);
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
    // Annual subscription (365d), then a 1-day photo reward "on top".
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: 'revenuecat:txn_tail',
      expiresAt: new Date(Date.now() + 365 * 864e5),
      active: true,
    });
    await service.grant({
      userId,
      source: 'reward_photo',
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
    expect(summary.source).toBe('reward_photo');
  });

  it('revoking an early chain member shifts later members instead of stranding time', async () => {
    await service.grant({
      userId,
      source: 'reward_photo',
      days: 10,
      sourceRef: 'photo:a',
    });
    const second = await service.grant({
      userId,
      source: 'reward_photo',
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
          source: 'reward_photo',
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

  it('concurrent DISTINCT rewards cannot blow past the cap (advisory lock)', async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        service.grant({
          userId,
          source: 'reward_photo',
          days: 10,
          sourceRef: `photo:cap-${index}`,
        }),
      ),
    );
    const summary = await service.summarize(userId);
    const days =
      (summary.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    // cap is 30 — six concurrent 10-day grants must clamp to exactly 30.
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30.01);
  });

  it('subscription grant refuses to become lifetime (active without expiry)', async () => {
    await service.syncSubscriptionGrant({
      userId,
      sourceRef: 'revenuecat:txn_nolife',
      expiresAt: null,
      active: true,
    });
    expect(await service.hasAccess(userId)).toBe(false);
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
    expect(await service.hasAccess(userId)).toBe(false);
  });

  it('reward hooks are idempotent per sourceRef (same photo/invitee never pays twice)', async () => {
    await rewards.grantPhotoReward({ userId, photoId: 'photo-1' });
    await rewards.grantPhotoReward({ userId, photoId: 'photo-1' });
    const rows = await prisma.accessGrant.findMany({
      where: { userId, source: 'reward_photo' },
    });
    expect(rows).toHaveLength(1);
  });

  it('keeps the UserEntitlement cache row consistent with the ledger', async () => {
    await service.grant({ userId, source: 'trial_base', days: 3 });
    const cache = await prisma.userEntitlement.findUnique({
      where: {
        userId_entitlementCode: { userId, entitlementCode: 'premium' },
      },
    });
    expect(cache?.status).toBe('active');
    const summary = await service.summarize(userId);
    expect(cache?.expiresAt?.getTime()).toBe(summary.expiresAt?.getTime());
  });

  it('gateFeature mode matrix: off allows, log allows+records, enforce locks', async () => {
    // no grants for this user in this test (beforeEach cleaned)
    process.env.ENTITLEMENT_GATING = 'off';
    expect((await service.gateFeature(userId, 'dish_results')).allowed).toBe(
      true,
    );
    process.env.ENTITLEMENT_GATING = 'log';
    expect((await service.gateFeature(userId, 'dish_results')).allowed).toBe(
      true,
    );
    process.env.ENTITLEMENT_GATING = 'enforce';
    expect((await service.gateFeature(userId, 'dish_results')).allowed).toBe(
      false,
    );
    // premium users pass in enforce
    await service.grant({ userId, source: 'comp', lifetime: true });
    expect((await service.gateFeature(userId, 'dish_results')).allowed).toBe(
      true,
    );
    // anonymous = no access
    expect((await service.gateFeature(null, 'dish_results')).allowed).toBe(
      false,
    );
    delete process.env.ENTITLEMENT_GATING;
  });
});
