import { CollectionSchedulerService } from './collection-scheduler.service';

describe('CollectionSchedulerService', () => {
  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    community: 'austinfood',
    workKind: 'chronological',
    intervalDays: 1,
    enabled: true,
    nextDueAt: new Date('2026-07-08T00:00:00Z'),
    lastRanAt: null,
    metadata: null,
    ...overrides,
  });

  const build = () => {
    const prisma = {
      collectionSchedule: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const chronologicalScheduler = {
      scheduleChronologicalCollection: jest.fn().mockResolvedValue('job-id'),
    };
    const keywordScheduler = {
      buildScheduleForCommunity: jest.fn().mockResolvedValue({
        collectableMarketKey: 'austin',
        safeIntervalDays: 7,
        terms: [{ term: 'brisket' }],
        sortPlan: [{ sort: 'new' }],
      }),
    };
    const keywordOrchestrator = {
      enqueueKeywordSearchJob: jest.fn().mockResolvedValue(undefined),
      enqueueHotSpikeJobs: jest.fn().mockResolvedValue(0),
    };
    const service = new CollectionSchedulerService(
      prisma as never,
      logger as never,
      chronologicalScheduler as never,
      keywordScheduler as never,
      keywordOrchestrator as never,
    );
    return {
      service,
      prisma,
      logger,
      chronologicalScheduler,
      keywordScheduler,
      keywordOrchestrator,
    };
  };

  const init = async (h: ReturnType<typeof build>) => {
    process.env.COLLECTION_SCHEDULER_ENABLED = 'true';
    delete process.env.COLLECTION_SCHEDULER_CYCLE_BUDGET;
    await h.service.onModuleInit();
  };

  afterEach(() => {
    delete process.env.COLLECTION_SCHEDULER_ENABLED;
    delete process.env.COLLECTION_SCHEDULER_CYCLE_BUDGET;
  });

  it('self-provisions the global hot-spike cadence row on init (type-list disease net)', async () => {
    const h = build();
    await init(h);
    expect(h.prisma.collectionSchedule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          community_workKind: {
            community: '__global__',
            workKind: 'on_demand_hot_spike',
          },
        },
      }),
    );
  });

  it('does not provision or plan when disabled', async () => {
    const h = build();
    process.env.COLLECTION_SCHEDULER_ENABLED = 'false';
    await h.service.onModuleInit();
    expect(h.prisma.collectionSchedule.upsert).not.toHaveBeenCalled();
  });

  it('dispatches due rows and advances cadence WITHOUT a metadata patch (single-writer law)', async () => {
    const h = build();
    await init(h);
    h.prisma.collectionSchedule.findMany.mockResolvedValue([makeRow()]);

    const result = await h.service.planAndDispatch();

    expect(result).toEqual({ dispatched: 1, deferred: 0 });
    expect(
      h.chronologicalScheduler.scheduleChronologicalCollection,
    ).toHaveBeenCalledWith('austinfood', {
      dedupeKey: String(new Date('2026-07-08T00:00:00Z').getTime()),
    });
    const updateCalls = h.prisma.collectionSchedule.update.mock
      .calls as unknown as Array<
      [{ data: { metadata?: unknown; nextDueAt: Date } }]
    >;
    const updateArg = updateCalls[0][0];
    expect(updateArg.data.metadata).toBeUndefined();
    expect(updateArg.data.nextDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('defers rows over the cycle budget instead of dispatching them', async () => {
    const h = build();
    process.env.COLLECTION_SCHEDULER_ENABLED = 'true';
    process.env.COLLECTION_SCHEDULER_CYCLE_BUDGET = '2';
    await h.service.onModuleInit();
    h.prisma.collectionSchedule.findMany.mockResolvedValue([
      makeRow(),
      makeRow({ community: 'atlanta', workKind: 'keyword' }),
    ]);

    const result = await h.service.planAndDispatch();

    expect(result).toEqual({ dispatched: 1, deferred: 1 });
    expect(
      h.keywordOrchestrator.enqueueKeywordSearchJob,
    ).not.toHaveBeenCalled();
  });

  it('screams on unknown workKind and never advances its row', async () => {
    const h = build();
    await init(h);
    h.prisma.collectionSchedule.findMany.mockResolvedValue([
      makeRow({ workKind: 'mystery_kind' }),
    ]);

    const result = await h.service.planAndDispatch();

    expect(result).toEqual({ dispatched: 0, deferred: 0 });
    expect(h.prisma.collectionSchedule.update).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith(
      'Unknown workKind in collection_schedules',
      expect.objectContaining({ workKind: 'mystery_kind' }),
    );
  });

  it('skips keyword enqueue when no terms are due but still advances cadence', async () => {
    const h = build();
    await init(h);
    h.keywordScheduler.buildScheduleForCommunity.mockResolvedValue({
      collectableMarketKey: 'austin',
      safeIntervalDays: 7,
      terms: [],
      sortPlan: [{ sort: 'new' }],
    });
    h.prisma.collectionSchedule.findMany.mockResolvedValue([
      makeRow({ workKind: 'keyword' }),
    ]);

    const result = await h.service.planAndDispatch();

    expect(result).toEqual({ dispatched: 1, deferred: 0 });
    expect(
      h.keywordOrchestrator.enqueueKeywordSearchJob,
    ).not.toHaveBeenCalled();
    expect(h.prisma.collectionSchedule.update).toHaveBeenCalled();
  });

  it('passes a deterministic tick jobId to keyword dispatch (duplicate-dispatch dedupe)', async () => {
    const h = build();
    await init(h);
    h.prisma.collectionSchedule.findMany.mockResolvedValue([
      makeRow({ workKind: 'keyword' }),
    ]);

    await h.service.planAndDispatch();

    expect(h.keywordOrchestrator.enqueueKeywordSearchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: `scheduled-austinfood-${new Date('2026-07-08T00:00:00Z').getTime()}`,
        source: 'scheduled',
      }),
    );
  });

  it('leaves a row due when dispatch throws (retry next cycle)', async () => {
    const h = build();
    await init(h);
    h.chronologicalScheduler.scheduleChronologicalCollection.mockRejectedValue(
      new Error('queue down'),
    );
    h.prisma.collectionSchedule.findMany.mockResolvedValue([makeRow()]);

    const result = await h.service.planAndDispatch();

    expect(result).toEqual({ dispatched: 0, deferred: 0 });
    expect(h.prisma.collectionSchedule.update).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith(
      'Dispatch failed; row remains due',
      expect.anything(),
    );
  });
});
