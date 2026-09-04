import { ledgerMicros } from './spend-currency';
import {
  SpendCampaignService,
  NoPublishedRateError,
  StaleEstimateHashError,
  CampaignBreachedError,
  CampaignStateError,
  CampaignHasOpenWorkError,
  StaleRateError,
  DuplicateLiveCampaignError,
  CAMPAIGN_STATE_TRANSITIONS,
  statesThatMayBecome,
} from './spend-campaign.service';
import { PoolRegistry } from '../governance/pool-registry';

/**
 * §24.5 Leg C RED-proof suite: estimate refuses without a published rate;
 * the pilot path creates a bounded, unpriced micro-campaign; approve
 * rejects a stale hash; an envelope breach flips state + refuses further
 * spend from being DISPATCHED while post-breach records still accumulate
 * (driven RED by metering past the boundary against a mutated unit-cost
 * fixture); a completed row is the durable drift pair the next estimate's
 * tolerance derives from. Uses the REAL PoolRegistry (not a mock) for the
 * non-campaign drift fallback path.
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
  const unitCosts = new Map<
    string,
    { microUsdPerUnit: number; refreshedAt?: Date }
  >();
  let seq = 0;
  const openBatchJobs = { count: 0 };
  return {
    _campaigns: campaigns,
    _unitCosts: unitCosts,
    _openBatchJobs: openBatchJobs,
    llmBatchJob: {
      count: jest.fn(() => Promise.resolve(openBatchJobs.count)),
    },
    spendUnitCost: {
      findUnique: jest.fn(
        ({
          where: { workClass_unit },
        }: {
          where: { workClass_unit: { workClass: string; unit: string } };
        }) => {
          const key = `${workClass_unit.workClass}::${workClass_unit.unit}`;
          const row = unitCosts.get(key);
          // A published rate carries its refresh time (G-7); fixtures that
          // omit it read as refreshed now.
          return Promise.resolve(
            row ? { refreshedAt: new Date(), ...row } : null,
          );
        },
      ),
    },
    spendCampaign: {
      findMany: jest.fn(
        ({ where }: { where: { workClass: string; state: string } }) =>
          Promise.resolve(
            Array.from(campaigns.values()).filter(
              (row) =>
                row.workClass === where.workClass &&
                row.state === where.state &&
                row.estimateMicros !== null,
            ),
          ),
      ),
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
      /** Mirrors the duplicate-live-name guard's lookup: name + state-in. */
      findFirst: jest.fn(
        ({ where }: { where: { name: string; state: { in: string[] } } }) => {
          for (const row of campaigns.values()) {
            if (
              row.name === where.name &&
              where.state.in.includes(row.state as string)
            ) {
              return Promise.resolve(row);
            }
          }
          return Promise.resolve(null);
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
            campaignId?: string;
            name?: string;
            state?: { in: string[] } | string;
            spentMicros?: number;
          };
          data: Record<string, unknown>;
        }) => {
          // Name-scoped shape (supersedeUnapprovedQuotes): flip every
          // matching row, mirroring Postgres updateMany.
          if (where.campaignId === undefined && where.name !== undefined) {
            let count = 0;
            for (const [id, row] of campaigns) {
              const stateMatches =
                where.state === undefined ||
                (typeof where.state === 'string'
                  ? row.state === where.state
                  : (where.state as { in: string[] }).in.includes(
                      row.state as string,
                    ));
              if (
                row.name === where.name &&
                stateMatches &&
                (where.spentMicros === undefined ||
                  Number(row.spentMicros ?? 0) === where.spentMicros)
              ) {
                campaigns.set(id, { ...row, ...data });
                count += 1;
              }
            }
            return Promise.resolve({ count });
          }
          const existing = campaigns.get(where.campaignId as string);
          if (
            !existing ||
            (where.state &&
              !(where.state as { in: string[] }).in.includes(
                existing.state as string,
              ))
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
          campaigns.set(where.campaignId as string, updated);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    /** Mirrors recordSpend's guarded UPDATE..RETURNING (red team F6): the
     *  increment and the returned total are one atomic step; state must be
     *  approved/running or zero rows return. */
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('UPDATE spend_campaigns')) {
          // Mirrors the accumulation/permission split (2026-08-31): breached
          // accumulates but STAYS breached (the CASE); terminal states match
          // zero rows.
          const [micros, campaignId, states] = values as [
            number,
            string,
            string[],
          ];
          const existing = campaigns.get(campaignId);
          if (!existing || !states.includes(existing.state as string)) {
            return Promise.resolve([]);
          }
          const spent = Number(existing.spentMicros ?? 0) + micros;
          const state = existing.state === 'breached' ? 'breached' : 'running';
          campaigns.set(campaignId, {
            ...existing,
            spentMicros: BigInt(spent),
            state,
          });
          return Promise.resolve([{ spent_micros: BigInt(spent), state }]);
        }
        return Promise.resolve([]);
      },
    ),
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

  it('a fresh estimate supersedes prior unapproved quotes for the SAME name only — approved and differently-named rows survive (owner ruling 2026-08-10)', async () => {
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
    const mk = (name: string) =>
      service.prepareEstimate({
        name,
        workClass: 'gemini.reddit_extraction',
        unit: 'document',
        unitCount: 100,
      });
    const approved = await mk('reextract:a:v7');
    await service.approve(approved.campaignId, approved.estimateHash);
    const stale = await mk('reextract:b:v7');
    const other = await mk('reextract:c:v7');
    const fresh = await mk('reextract:b:v7'); // re-quote of b
    expect(prisma._campaigns.get(stale.campaignId)?.state).toBe('superseded');
    expect(prisma._campaigns.get(fresh.campaignId)?.state).toBe(
      'awaiting_approval',
    );
    expect(prisma._campaigns.get(approved.campaignId)?.state).toBe('approved');
    expect(prisma._campaigns.get(other.campaignId)?.state).toBe(
      'awaiting_approval',
    );
    // The superseded quote can no longer be approved — its hash is dead.
    await expect(
      service.approve(stale.campaignId, stale.estimateHash),
    ).rejects.toThrow(/cannot approve from state 'superseded'/);
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
    await service.recordSpend(
      estimate.campaignId,
      'gemini',
      ledgerMicros(1000),
    );
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('running');

    // Push past the envelope boundary (1000 + 300 = 1300 > 1250) — this is
    // the mutated-fixture RED proof: the SAME unit-cost rate the estimate
    // used, but actual draws exceed the projected envelope.
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(300));
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

    // ACCUMULATION/PERMISSION SPLIT (2026-08-31): post-breach spend STILL
    // accumulates (the tail of in-flight work costs real money and the row
    // must stay truthful) while the state stays 'breached' — refusing NEW
    // work is the dispatch gates' job, not the record's.
    await expect(
      service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(7)),
    ).resolves.toBeUndefined();
    const after = prisma._campaigns.get(estimate.campaignId);
    expect(after?.state).toBe('breached');
    expect(after?.spentMicros).toBe(BigInt(1307));
  });

  it('breach invokes the registered reaper (fire-and-forget) so in-flight batch jobs get cancelled', async () => {
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
    const reaped: string[] = [];
    service.registerBreachReaper((campaignId) => {
      reaped.push(campaignId);
      return Promise.resolve();
    });
    const estimate = await service.prepareEstimate({
      name: 'archive:test',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100, // envelope 1250
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(500));
    expect(reaped).toEqual([]); // under envelope — no reap
    await service.recordSpend(
      estimate.campaignId,
      'gemini',
      ledgerMicros(1000),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(reaped).toEqual([estimate.campaignId]);
    // Post-breach accumulation does NOT re-invoke the reaper.
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(10));
    await new Promise((resolve) => setImmediate(resolve));
    expect(reaped).toEqual([estimate.campaignId]);
  });

  it('a completed campaign row IS the drift pair: the next estimate of the work class derives its tolerance from (estimate, spent)', async () => {
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
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(500)); // under envelope.
    await service.complete(estimate.campaignId);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('completed');

    // The drift memory is DURABLE (the completed row), not an in-memory
    // pool feed (deleted with the campaign.* mirror): a fresh estimate for
    // the same work class reads |500/1000 - 1| = 0.5 > the 0.25 bootstrap.
    const next = await service.prepareEstimate({
      name: 'archive:test2',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100,
    });
    expect(next.toleranceFraction).toBeCloseTo(0.5);
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
    await service.recordSpend(
      estimate.campaignId,
      'gemini',
      ledgerMicros(1300),
    );
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');
    expect(await service.isDispatchable(estimate.campaignId)).toBe(false);

    // Unknown campaign id: fail closed, never fail open.
    expect(await service.isDispatchable('does-not-exist')).toBe(false);
  });

  it('§24 red team finding 5: a stale writer cannot resurrect running over an already-breached row (the CASE keeps breached breached)', async () => {
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

    // The stale writer's spend ACCUMULATES (accumulation/permission split),
    // but the guarded CASE cannot flip the row back to 'running' — the
    // breach verdict stands.
    await expect(
      service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(1)),
    ).resolves.toBeUndefined();
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');
    // A terminal state still refuses the record outright.
    prisma._campaigns.set(estimate.campaignId, {
      ...prisma._campaigns.get(estimate.campaignId)!,
      state: 'completed',
    });
    await expect(
      service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(1)),
    ).rejects.toBeInstanceOf(CampaignStateError);
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

    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(100));
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(200));
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(300));

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
    prisma._unitCosts.set('gemini.relevance_gate::document', {
      microUsdPerUnit: 3,
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
      ['gemini.relevance_gate', 3_000],
      ['gemini.interactive_pipeline', 5_000],
      ['gemini.embedding', 1_000],
      ['google_places.enrichment', 100_000],
    ]);
    expect(manifest.totalEstimateMicros).toBe(119_000);
    // Bootstrap tolerance 0.25 → envelope = all-in total × 1.25.
    expect(manifest.envelopeMicros).toBe(148_750);
    // ONE hash over the whole manifest, stored on the row so approve()
    // approves every line + total at once.
    const row = prisma._campaigns.get(manifest.campaignId);
    expect(row?.estimateHash).toBe(manifest.estimateHash);
    expect(row?.estimateMicros).toBe(119_000);
    await expect(
      service.approve(manifest.campaignId, manifest.estimateHash),
    ).resolves.toMatchObject({ envelopeMicros: 148_750 });
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
    await service.recordSpend(
      estimate.campaignId,
      'gemini',
      ledgerMicros(5000),
    ); // breach (envelope 1250)
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
    // ONE quote (G-2): the hash the fresh service verifies is the one it
    // computes — and it is floored at the 5000 already spent, not the 1000
    // the class rate alone would re-quote.
    const quote = await freshService.quoteResume(estimate.campaignId);
    expect(quote.estimateMicros).toBe(5000);
    const resumed = await freshService.resumeAfterBreach(
      estimate.campaignId,
      quote.estimateHash,
    );
    expect(resumed.campaignId).toBe(estimate.campaignId);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('approved');
  });
});

describe('SpendCampaignService lifecycle chokepoint (2026-08-12)', () => {
  function build() {
    const prisma = buildPrisma();
    const service = new SpendCampaignService(
      prisma as never,
      stubLogger() as never,
      buildOpsAlerts().mock,
      buildGovernance(),
    );
    return { prisma, service };
  }

  it('the transition table declares every legal edge and derives the guards', () => {
    // The table IS the enforcement: these assertions pin the declared edges
    // so an accidental widening (e.g. completed -> approved) fails a test,
    // not a production audit.
    expect(statesThatMayBecome('approved').slice().sort()).toEqual([
      'awaiting_approval',
      'breached',
    ]);
    expect(statesThatMayBecome('completed').slice().sort()).toEqual([
      'approved',
      'running',
    ]);
    expect(statesThatMayBecome('superseded')).toEqual(['awaiting_approval']);
    // Terminal states have no OUTBOUND edges anywhere in the table.
    for (const from of Object.values(CAMPAIGN_STATE_TRANSITIONS)) {
      expect(from).not.toContain('completed');
      expect(from).not.toContain('superseded');
    }
    // An undeclared target state throws rather than defaulting open.
    expect(() => statesThatMayBecome('re_awaiting')).toThrow(
      /no declared inbound transitions/,
    );
  });

  it('complete() refuses from breached — the edge is absent from the table', async () => {
    const { prisma, service } = build();
    const { campaignId } = await service.preparePilot({
      name: 'pilot:lifecycle',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 10,
    });
    prisma._campaigns.get(campaignId)!.state = 'breached';
    await expect(service.complete(campaignId)).rejects.toBeInstanceOf(
      CampaignStateError,
    );
    expect(prisma._campaigns.get(campaignId)!.state).toBe('breached');
  });

  it('quoteResume floors the refined estimate at what was already spent, and resume with its hash reopens without re-breaching (G-2)', async () => {
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
      name: 'archive:resume',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 100, // estimate 1000; envelope 1250
    });
    await service.approve(estimate.campaignId, estimate.estimateHash);
    await service.recordSpend(
      estimate.campaignId,
      'gemini',
      ledgerMicros(1300),
    );
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('breached');

    const quote = await service.quoteResume(estimate.campaignId);
    // The class rate alone re-quotes 1000 — below the 1300 already spent;
    // a resume at that envelope re-breached on the first recordSpend.
    expect(quote.estimateMicros).toBe(1300);
    expect(quote.envelopeMicros).toBeGreaterThan(1300);

    const resumed = await service.resumeAfterBreach(
      estimate.campaignId,
      quote.estimateHash,
    );
    expect(resumed.estimateMicros).toBe(1300);
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('approved');
    await service.recordSpend(estimate.campaignId, 'gemini', ledgerMicros(100));
    expect(prisma._campaigns.get(estimate.campaignId)?.state).toBe('running');
  });

  it('a stale published rate is a typed refusal, never a quoted envelope (G-7)', async () => {
    const { prisma, service } = build();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 10,
      refreshedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    });
    await expect(
      service.prepareEstimate({
        name: 'archive:stale-rate',
        workClass: 'gemini.reddit_extraction',
        unit: 'document',
        unitCount: 10,
      }),
    ).rejects.toBeInstanceOf(StaleRateError);
  });

  it('complete() refuses while the campaign still carries non-terminal batch jobs — paid output must drain first (G-3)', async () => {
    const { prisma, service } = build();
    const { campaignId } = await service.preparePilot({
      name: 'pilot:open-work',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 10,
    });
    prisma._openBatchJobs.count = 2;
    await expect(service.complete(campaignId)).rejects.toBeInstanceOf(
      CampaignHasOpenWorkError,
    );
    expect(prisma._campaigns.get(campaignId)!.state).toBe('approved');
    prisma._openBatchJobs.count = 0;
    await service.complete(campaignId);
    expect(prisma._campaigns.get(campaignId)!.state).toBe('completed');
  });

  it('prepare refuses while a LIVE campaign of the same name exists (typed)', async () => {
    const { service } = build();
    await service.preparePilot({
      name: 'reextract:austin:v8',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 10,
    }); // preparePilot creates directly 'approved' = live
    await expect(
      service.prepareEstimate({
        name: 'reextract:austin:v8',
        workClass: 'gemini.reddit_extraction',
        unit: 'document',
        unitCount: 1000,
      }),
    ).rejects.toBeInstanceOf(DuplicateLiveCampaignError);
  });

  it('a fresh quote still supersedes an UNAPPROVED quote of the same name', async () => {
    const { prisma, service } = build();
    prisma._unitCosts.set('gemini.reddit_extraction::document', {
      microUsdPerUnit: 100,
    });
    const first = await service.prepareEstimate({
      name: 'quote:twice',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 10,
    });
    const second = await service.prepareEstimate({
      name: 'quote:twice',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 20,
    });
    expect(prisma._campaigns.get(first.campaignId)!.state).toBe('superseded');
    expect(prisma._campaigns.get(second.campaignId)!.state).toBe(
      'awaiting_approval',
    );
  });

  it('assertDispatchable: breached throws CampaignBreachedError (requeue), terminal/missing throws CampaignStateError', async () => {
    const { prisma, service } = build();
    const { campaignId } = await service.preparePilot({
      name: 'pilot:dispatch',
      workClass: 'gemini.reddit_extraction',
      unit: 'document',
      unitCount: 10,
    });
    await expect(
      service.assertDispatchable(campaignId),
    ).resolves.toBeUndefined();
    prisma._campaigns.get(campaignId)!.state = 'breached';
    await expect(service.assertDispatchable(campaignId)).rejects.toBeInstanceOf(
      CampaignBreachedError,
    );
    prisma._campaigns.get(campaignId)!.state = 'completed';
    await expect(service.assertDispatchable(campaignId)).rejects.toBeInstanceOf(
      CampaignStateError,
    );
    await expect(
      service.assertDispatchable('no-such-campaign'),
    ).rejects.toBeInstanceOf(CampaignStateError);
  });
});
