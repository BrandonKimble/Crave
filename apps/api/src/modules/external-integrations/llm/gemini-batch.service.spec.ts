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
    ).rejects.toThrow(/campaign breached/i);

    expect(spendCampaigns.isDispatchable).toHaveBeenCalledWith('camp-breached');
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
      // count:0 short-circuits resumeSubmit before any genAI network call.
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      // count:0 short-circuits resumeSubmit before any genAI network call.
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    await service.submit({
      purpose: 'other_purpose',
      model: 'gemini-3-flash-preview',
      items: [{ key: 'k1', contents: 'hi', config: {} }],
    });

    expect(spendCampaigns.isDispatchable).not.toHaveBeenCalled();
  });
});
