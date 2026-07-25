import {
  SpendCampaignService,
  NoPublishedRateError,
  StaleEstimateHashError,
  CampaignBreachedError,
} from './spend-campaign.service';
import { PoolRegistry } from '../governance/pool-registry';

/**
 * §24.5 Leg C RED-proof suite: estimate refuses without a published rate;
 * the pilot path creates a bounded, unpriced micro-campaign; approve
 * rejects a stale hash; an envelope breach flips state + refuses further
 * spend (driven RED by metering past the boundary against a mutated
 * unit-cost fixture); complete() records the drift pair via
 * PoolRegistry.recordActualPair. Uses the REAL PoolRegistry (not a mock)
 * so grant/meter/measureDrift/recordActualPair math is proven, not assumed.
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/** In-memory spend_campaigns table double — enough Prisma surface for the
 *  service's create/findUnique/update calls. */
function buildPrisma() {
  const campaigns = new Map<string, Record<string, unknown>>();
  const unitCosts = new Map<string, { microUsdPerUnit: number }>();
  let seq = 0;
  return {
    _campaigns: campaigns,
    _unitCosts: unitCosts,
    spendUnitCost: {
      findUnique: jest.fn(
        ({
          where: { workClass_unit },
        }: {
          where: { workClass_unit: { workClass: string; unit: string } };
        }) => {
          const key = `${workClass_unit.workClass}::${workClass_unit.unit}`;
          return Promise.resolve(unitCosts.get(key) ?? null);
        },
      ),
    },
    spendCampaign: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const campaignId = `campaign-${seq}`;
        const row = {
          campaignId,
          microUsdPerUnit: null,
          estimateMicros: null,
          toleranceFraction: null,
          estimateHash: null,
          spentMicros: BigInt(0),
          approvedAt: null,
          completedAt: null,
          breachNote: null,
          ...data,
        };
        campaigns.set(campaignId, row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(
        ({ where: { campaignId } }: { where: { campaignId: string } }) => {
          return Promise.resolve(campaigns.get(campaignId) ?? null);
        },
      ),
      update: jest.fn(
        ({
          where: { campaignId },
          data,
        }: {
          where: { campaignId: string };
          data: Record<string, unknown>;
        }) => {
          const existing = campaigns.get(campaignId);
          if (!existing) throw new Error('not found');
          const updated = { ...existing, ...data };
          campaigns.set(campaignId, updated);
          return Promise.resolve(updated);
        },
      ),
      /** Mirrors Postgres updateMany semantics closely enough for the
       *  recordSpend atomic-increment + guarded state-flip fix (§24 red
       *  team finding 5): a `state: { in: [...] }` filter and a
       *  `spentMicros: { increment: N }` write; matches count 0 when the
       *  WHERE no longer holds (already flipped by another writer). */
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            campaignId: string;
            state?: { in: string[] };
          };
          data: Record<string, unknown>;
        }) => {
          const existing = campaigns.get(where.campaignId);
          if (
            !existing ||
            (where.state && !where.state.in.includes(existing.state as string))
          ) {
            return Promise.resolve({ count: 0 });
          }
          const { spentMicros, ...rest } = data as {
            spentMicros?: { increment?: number };
          } & Record<string, unknown>;
          const updated = { ...existing, ...rest };
          if (spentMicros && typeof spentMicros.increment === 'number') {
            updated.spentMicros =
              (existing.spentMicros as bigint) + BigInt(spentMicros.increment);
          }
          campaigns.set(where.campaignId, updated);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
}

function buildGovernance() {
  const pools = new PoolRegistry();
  return {
    pools,
  } as unknown as import('../governance/governance.service').GovernanceService;
}

function buildOpsAlerts() {
  const emit = jest.fn();
  return {
    mock: {
      emit: emit as never,
    } as unknown as import('./ops-alerts.service').OpsAlertsService,
    emit,
  };
}

describe('SpendCampaignService (§24.5 Leg C)', () => {
  it('prepareEstimate refuses (typed) when the work class has no published rate', async () => {
    const prisma = buildPrisma();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    await expect(
      service.prepareEstimate({
        name: 'archive:test',
        workClass: 'gemini.reddit_extraction',
        unit: 'document',
        unitCount: 1000,
      }),
    ).rejects.toBeInstanceOf(NoPublishedRateError);
  });

  it('preparePilot creates a bounded, unpriced micro-campaign directly in approved state', async () => {
    const prisma = buildPrisma();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const pilot = await service.preparePilot({
      name: 'archive-pilot:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 50,
    });
    const row = prisma._campaigns.get(pilot.campaignId);
    expect(row?.state).toBe('approved');
    expect(row?.estimateMicros).toBeNull();
    expect(row?.unitCount).toBe(50);
  });

  it('approve rejects a stale estimate hash', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100,
    });
    await expect(
      service.approve(estimate.campaignId, 'not-the-real-hash'),
    ).rejects.toBeInstanceOf(StaleEstimateHashError);
    // The correct hash still works afterward — proves the row wasn't
    // corrupted by the rejected attempt.
    await expect(
      service.approve(estimate.campaignId, estimate.estimateHash),
    ).resolves.toMatchObject({ campaignId: estimate.campaignId });
  });

  it('approve mints a grant sized to estimate x (1 + tolerance), and recordSpend past it flips breached and refuses further spend (RED-proof)', async () => {
    const prisma = buildPrisma();
    // rate = 10 micro-USD/document; no drift sample yet -> bootstrap 0.25.
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const governance = buildGovernance();
    const opsAlerts = buildOpsAlerts();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      opsAlerts.mock,
      governance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100, // estimate = 1000 micro-USD; envelope = 1250.
    });
    expect(estimate.estimateMicros).toBe(1000);
    expect(estimate.toleranceFraction).toBeCloseTo(0.25);
    expect(estimate.envelopeMicros).toBe(1250);

    await service.approve(estimate.campaignId, estimate.estimateHash);

    // Spend under the envelope: stays 'running', no breach.
    await service.recordSpend(estimate.campaignId, 1000);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('running');

    // Push past the envelope boundary (1000 + 300 = 1300 > 1250) — this is
    // the mutated-fixture RED proof: the SAME unit-cost rate the estimate
    // used, but actual draws exceed the projected envelope.
    await service.recordSpend(estimate.campaignId, 300);
    const row = prisma._campaigns.get(estimate.campaignId);
    expect(row?.state).toBe('breached');
    expect(row?.breachNote).toEqual(expect.stringContaining('envelope breach'));

    // The breach emits a critical ops alert, deduped per campaign.
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        kind: 'campaign_breached',
        dedupeKey: `campaign_breached:${estimate.campaignId}`,
      }),
    );

    // Breached campaigns refuse further spend (typed, not silent).
    await expect(
      service.recordSpend(estimate.campaignId, 1),
    ).rejects.toBeInstanceOf(CampaignBreachedError);
  });

  it('complete() records the declared-vs-actual pair so measureDrift learns for next time', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const governance = buildGovernance();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      governance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100, // estimate 1000 micro-USD.
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);
    await service.recordSpend(estimate.campaignId, 900); // under envelope.

    expect(
      governance.pools.measureDrift('gemini.reddit_extraction'),
    ).toBeNull();
    await service.complete(estimate.campaignId);
    // actual 900 / declared 1000 = 0.9.
    expect(
      governance.pools.measureDrift('gemini.reddit_extraction'),
    ).toBeCloseTo(0.9);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('completed');
  });

  it('§24 red team finding 1: isDispatchable is true only for approved/running, false for breached/missing', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const governance = buildGovernance();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      governance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100,
    });
    // awaiting_approval: not yet dispatchable.
    expect(await service.isDispatchable(estimate.campaignId)).toBe(false);

    await service.approve(estimate.campaignId, estimate.estimateHash);
    expect(await service.isDispatchable(estimate.campaignId)).toBe(true);

    // Push it into 'breached'.
    await service.recordSpend(estimate.campaignId, 1300);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');
    expect(await service.isDispatchable(estimate.campaignId)).toBe(false);

    // Unknown campaign id: fail closed, never fail open.
    expect(await service.isDispatchable('does-not-exist')).toBe(false);
  });

  it('§24 red team finding 5: a guarded state flip cannot resurrect running over an already-breached row', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const governance = buildGovernance();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      governance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100, // estimate 1000 micro-USD; envelope 1250.
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);

    // Simulate the row already having flipped to 'breached' out from under
    // a stale in-flight caller (e.g. a concurrent recordSpend that already
    // won the race) — a guarded updateMany targeting
    // state IN ('approved','running') must match ZERO rows here, so the
    // spentMicros increment for THIS call is skipped rather than
    // clobbering the breach back to 'running'.
    const row = prisma._campaigns.get(estimate.campaignId)!;
    prisma._campaigns.set(estimate.campaignId, {
      ...row,
      state: 'breached',
      breachNote: 'already breached by another writer',
    });

    // recordSpend's top-of-function findUnique sees state==='breached' and
    // typed-refuses before ever reaching the guarded updateMany — proving
    // the guard is defense-in-depth, and the row stays 'breached'.
    await expect(
      service.recordSpend(estimate.campaignId, 1),
    ).rejects.toBeInstanceOf(CampaignBreachedError);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');
  });

  it('recordSpend increments spentMicros atomically across sequential calls (no lost updates)', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const governance = buildGovernance();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      governance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 1000, // estimate 10_000; envelope 12_500 — plenty of room.
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);

    await service.recordSpend(estimate.campaignId, 100);
    await service.recordSpend(estimate.campaignId, 200);
    await service.recordSpend(estimate.campaignId, 300);

    expect(prisma._campaigns.get(estimate.campaignId)?.spentMicros).toBe(
      BigInt(600),
    );
  });
});

describe('SpendCampaignService.prepareManifestEstimate (§24.3 v2 all-in manifest)', () => {
  function seedAllRates(prisma: ReturnType<typeof buildPrisma>) {
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    prisma._unitCosts.set('gemini.interactive_pipeline::document', {
      microUsdPerUnit: 5,
    });
    prisma._unitCosts.set('gemini.embedding::document', {
      microUsdPerUnit: 1,
    });
    prisma._unitCosts.set('google_places.enrichment::restaurant', {
      microUsdPerUnit: 2000,
    });
    // NOT currency: 50 restaurants per 1000 documents.
    prisma._unitCosts.set('pipeline.entities_per_kilodoc::ratio', {
      microUsdPerUnit: 50,
    });
  }

  it('RED-proof: a manifest missing ANY line rate refuses (typed), naming the missing class — never silently skips the line', async () => {
    const prisma = buildPrisma();
    seedAllRates(prisma);
    prisma._unitCosts.delete('gemini.embedding::document');
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const promise = service.prepareManifestEstimate({
      name: 'archive:test',
      docCount: 1000,
    });
    await expect(promise).rejects.toBeInstanceOf(NoPublishedRateError);
    await promise.catch((error: NoPublishedRateError) => {
      expect(error.workClass).toBe('gemini.embedding');
      expect(error.unit).toBe('document');
    });
  });

  it('sums EVERY paid class into one all-in total, derives entities from the measured ratio, and hashes the whole manifest once', async () => {
    const prisma = buildPrisma();
    seedAllRates(prisma);
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const manifest = await service.prepareManifestEstimate({
      name: 'archive:test',
      docCount: 1000,
    });
    // 50 entities/kilodoc × 1000 docs = 50 expected restaurants.
    expect(manifest.expectedEntities).toBe(50);
    expect(manifest.lines.map((l) => [l.workClass, l.estimateMicros])).toEqual([
      ['gemini.reddit_extraction', 10_000],
      ['gemini.interactive_pipeline', 5_000],
      ['gemini.embedding', 1_000],
      ['google_places.enrichment', 100_000],
    ]);
    expect(manifest.totalEstimateMicros).toBe(116_000);
    // Bootstrap tolerance 0.25 → envelope = all-in total × 1.25.
    expect(manifest.envelopeMicros).toBe(145_000);
    // ONE hash over the whole manifest, stored on the row so approve()
    // approves every line + total at once.
    const row = prisma._campaigns.get(manifest.campaignId);
    expect(row?.estimateHash).toBe(manifest.estimateHash);
    expect(row?.estimateMicros).toBe(116_000);
    await expect(
      service.approve(manifest.campaignId, manifest.estimateHash),
    ).resolves.toMatchObject({ envelopeMicros: 145_000 });
  });

  it('a re-measured rate on any single line changes the ONE manifest hash (a stale printout cannot be approved against fresher rates)', async () => {
    const prisma = buildPrisma();
    seedAllRates(prisma);
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const first = await service.prepareManifestEstimate({
      name: 'archive:test',
      docCount: 1000,
    });
    prisma._unitCosts.set('gemini.embedding::document', {
      microUsdPerUnit: 2,
    });
    const second = await service.prepareManifestEstimate({
      name: 'archive:test',
      docCount: 1000,
    });
    expect(second.estimateHash).not.toBe(first.estimateHash);
  });

  it('RED-proof: resumeAfterBreach works in a FRESH process (breached pools are not boot-rehydrated — it must self-register the grant pool)', async () => {
    const prisma = buildPrisma();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
    });
    const firstGovernance = buildGovernance();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      firstGovernance,
    );
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100,
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);
    await service.recordSpend(estimate.campaignId, 5000); // breach (envelope 1250)
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');

    // Fresh process: NEW registry with NO campaign pool registered (boot
    // rehydration skips breached campaigns) — the old code threw
    // PoolRegistrationError here, making the recovery path unrunnable.
    const freshService = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    const rate = 10;
    const estimateMicros = Math.round(100 * rate);
    const resumed = await freshService.resumeAfterBreach(
      estimate.campaignId,
      // hash the fresh service will recompute (bootstrap tolerance 0.25)
      await (async () => {
        const { hashEstimate } = await import('./spend-campaign.service');
        return hashEstimate({
          workClass: 'gemini.reddit_extraction',
          unit: 'document',
          unitCount: 100,
          microUsdPerUnit: rate,
          estimateMicros,
          toleranceFraction: 0.25,
        });
      })(),
    );
    expect(resumed.campaignId).toBe(estimate.campaignId);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('approved');
  });
});
