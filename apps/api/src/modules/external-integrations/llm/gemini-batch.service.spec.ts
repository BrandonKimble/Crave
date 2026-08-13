import { readFileSync } from 'fs';
import { join } from 'path';
import { GeminiBatchService } from './gemini-batch.service';

/**
 * §24 red team finding 1 ("a breach must stop work"): submit() must refuse
 * a batch belonging to a breached (or otherwise non-dispatchable) Tier 1
 * campaign BEFORE any DB row is created or vendor call is made — the
 * envelope stopping SPEND after the fact (recordSpend) is not the same as
 * stopping NEW work from being dispatched in the first place.
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function buildService(isDispatchable: boolean) {
  const prisma = {
    llmBatchJob: { create: jest.fn() },
  };
  const usageLedger = { record: jest.fn() };
  const governance = {
    // Batch submission now goes through THE shared gemini spend gate rather
    // than hand-comparing a poolStatus snapshot (which never refreshed and
    // failed OPEN on an unconfirmed store).
    assertGeminiSpendOpen: jest.fn().mockResolvedValue(undefined),
    pools: {
      poolStatus: jest.fn().mockReturnValue({
        poisonedForMs: null,
        used: 0,
        limit: 1_000_000,
      }),
    },
  };
  const spendCampaigns = {
    isDispatchable: jest.fn().mockResolvedValue(isDispatchable),
    // ONE ENFORCEMENT (2026-08-12): submit now calls the shared typed
    // assertDispatchable rather than a hand-rolled isDispatchable check.
    assertDispatchable: jest.fn().mockImplementation((campaignId: string) => {
      if (isDispatchable) return Promise.resolve();
      return Promise.reject(
        new Error(
          `Campaign ${campaignId} is breached — refusing further spend`,
        ),
      );
    }),
  };
  // The transport consumes typed vendor ops from the gateway now — no
  // ConfigService/client of its own.
  const llmService = {
    batchTransportOps: () => ({
      create: jest.fn().mockResolvedValue({ name: 'batches/fake' }),
      cancel: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ state: 'JOB_STATE_PENDING' }),
    }),
  };
  const service = new GeminiBatchService(
    prisma as never,
    stubLogger() as never,
    usageLedger as never,
    governance as never,
    spendCampaigns as never,
    llmService as never,
  );
  return { service, prisma, spendCampaigns };
}

describe('GeminiBatchService.submit (§24 red team finding 1)', () => {
  it('refuses BEFORE any DB write when the resumeContext campaign is breached (not dispatchable)', async () => {
    const { service, prisma, spendCampaigns } = buildService(false);

    await expect(
      service.submit({
        purpose: 'collection_extraction',
        model: 'gemini-3-flash-preview',
        items: [{ key: 'k1', contents: 'hi', config: {} }],
        resumeContext: { campaignId: 'camp-breached' },
      }),
    ).rejects.toThrow(/breached/i);

    expect(spendCampaigns.assertDispatchable).toHaveBeenCalledWith(
      'camp-breached',
    );
    expect(prisma.llmBatchJob.create).not.toHaveBeenCalled();
  });

  it('proceeds when the resumeContext campaign IS dispatchable', async () => {
    const { service, prisma } = buildService(true);
    prisma.llmBatchJob.create = jest.fn().mockResolvedValue({ jobId: 'job-1' });
    const executeCreateMany = jest.fn().mockResolvedValue(undefined);
    (prisma as unknown as { llmBatchJobItem: unknown }).llmBatchJobItem = {
      createMany: executeCreateMany,
    };
    (
      prisma as unknown as {
        llmBatchJob: { update: unknown; updateMany: unknown };
      }
    ).llmBatchJob = {
      ...prisma.llmBatchJob,
      update: jest.fn().mockResolvedValue(undefined),
      // The submitter's OWN 'persisting' claims (heartbeat + pending handoff)
      // succeed; the 'pending'->submitting claim returns count:0 so
      // resumeSubmit short-circuits before any genAI network call.
      updateMany: jest
        .fn()
        .mockImplementation((args: { where?: { status?: unknown } }) =>
          Promise.resolve({
            count: args?.where?.status === 'persisting' ? 1 : 0,
          }),
        ),
    };

    const jobId = await service.submit({
      purpose: 'collection_extraction',
      model: 'gemini-3-flash-preview',
      items: [{ key: 'k1', contents: 'hi', config: {} }],
      resumeContext: { campaignId: 'camp-approved' },
    });

    expect(jobId).toBe('job-1');
    expect(prisma.llmBatchJob.create).toHaveBeenCalled();
  });

  it('skips the campaign gate entirely when resumeContext carries no campaignId', async () => {
    const { service, prisma, spendCampaigns } = buildService(true);
    prisma.llmBatchJob.create = jest.fn().mockResolvedValue({ jobId: 'job-2' });
    (prisma as unknown as { llmBatchJobItem: unknown }).llmBatchJobItem = {
      createMany: jest.fn().mockResolvedValue(undefined),
    };
    (
      prisma as unknown as {
        llmBatchJob: { update: unknown; updateMany: unknown };
      }
    ).llmBatchJob = {
      ...prisma.llmBatchJob,
      update: jest.fn().mockResolvedValue(undefined),
      // The submitter's OWN 'persisting' claims (heartbeat + pending handoff)
      // succeed; the 'pending'->submitting claim returns count:0 so
      // resumeSubmit short-circuits before any genAI network call.
      updateMany: jest
        .fn()
        .mockImplementation((args: { where?: { status?: unknown } }) =>
          Promise.resolve({
            count: args?.where?.status === 'persisting' ? 1 : 0,
          }),
        ),
    };

    await service.submit({
      purpose: 'other_purpose',
      model: 'gemini-3-flash-preview',
      items: [{ key: 'k1', contents: 'hi', config: {} }],
    });

    expect(spendCampaigns.assertDispatchable).not.toHaveBeenCalled();
  });
});

/**
 * F-async (2026-08-08): the last two bare status writes are now GUARDED
 * conditional transitions. Mutation proof: a cancel racing a TERMINAL state
 * must no-op (updateMany count 0, no throw, record kept) — before the fix,
 * cancel() stamped 'failed' over 'ingested', erasing a completed PAID
 * ingest. Weaken the where-clause back to bare {jobId} and the terminal
 * assertion below goes red.
 */
describe('GeminiBatchService.cancel — terminal states are unclobberable', () => {
  function buildCancelHarness(updateManyCount: number) {
    const updateMany = jest.fn().mockResolvedValue({ count: updateManyCount });
    const prisma = {
      llmBatchJob: {
        findUnique: jest.fn().mockResolvedValue({ providerJobName: null }),
        updateMany,
      },
    };
    const service = new GeminiBatchService(
      prisma as never,
      stubLogger() as never,
      { record: jest.fn() } as never,
      { assertGeminiSpendOpen: jest.fn() } as never,
      { isDispatchable: jest.fn() } as never,
      { batchTransportOps: () => ({ cancel: jest.fn() }) } as never,
    );
    return { service, updateMany };
  }

  it('cancel writes only through a live-state precondition', async () => {
    const { service, updateMany } = buildCancelHarness(1);
    await service.cancel('job-1');
    const where = (
      updateMany.mock.calls[0] as [{ where: { status?: { in?: string[] } } }]
    )[0].where;
    // THE GUARD ITSELF: the write must carry a status precondition that
    // excludes every terminal state. Bare {jobId} (the old shape) fails here.
    expect(where.status?.in).toEqual(
      expect.arrayContaining(['pending', 'submitted']),
    );
    expect(where.status?.in ?? []).not.toContain('succeeded');
    expect(where.status?.in ?? []).not.toContain('ingested');
    expect(where.status?.in ?? []).not.toContain('failed');
  });

  it('a cancel racing a terminal state no-ops without throwing', async () => {
    const { service, updateMany } = buildCancelHarness(0);
    await expect(service.cancel('job-terminal')).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * C3 CLASS CLOSURE (2026-08-08): after b0db25258 + this commit, ZERO bare
 * `llmBatchJob.update(` status writes remain — every job-status transition
 * is a conditional updateMany from its expected state. This scan is the
 * class-level mutation proof: reintroduce any bare update() and it REDs.
 */
describe('C3 — no bare llmBatchJob.update() status writes', () => {
  it('every status transition is a guarded updateMany', () => {
    const source = readFileSync(
      join(__dirname, 'gemini-batch.service.ts'),
      'utf8',
    );
    const bareUpdates = source.match(/llmBatchJob\.update\(/g) ?? [];
    expect(bareUpdates).toEqual([]);
  });
});
