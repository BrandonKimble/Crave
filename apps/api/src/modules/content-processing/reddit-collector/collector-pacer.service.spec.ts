import { CollectorPacerService } from './collector-pacer.service';
import type { CollectorLane } from './collector-source-registry.service';

/**
 * §10/§14.3 pacer specs: due lanes dispatch in normalized-lateness order;
 * a pool denial is a typed "not now" (lane stays due, never advances, never
 * errors); dispatched lanes advance by cadence; lane state rides into the
 * dispatch (cursor, heavy-sort watermark); the two floor fractions reach the
 * keyword dispatch through selection.
 */

const NOW = new Date('2026-07-19T12:00:00Z');

function makeLane(overrides: Partial<CollectorLane> = {}): CollectorLane {
  return {
    sourceId: 'src-1',
    lane: 'chronological',
    enabled: true,
    cadenceDays: 1,
    latenessToleranceDays: 1,
    dueAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    lastRanAt: null,
    state: {},
    lastOutputDocs: null,
    outputDocsBaseline: null,
    platform: 'reddit',
    handle: 'austinfood',
    anchorPlaceId: 'place-austin',
    engineId: 'engine-austin',
    ...overrides,
  };
}

function build(options: { lanes?: CollectorLane[]; admit?: boolean } = {}) {
  const prisma = {
    collectionCommunity: {
      findFirst: jest.fn().mockResolvedValue({ safeIntervalDays: 12 }),
    },
  };
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const registry = {
    listDueLanes: jest.fn().mockResolvedValue(options.lanes ?? []),
    advanceLane: jest.fn().mockResolvedValue(undefined),
    getEngine: jest.fn().mockResolvedValue({
      engineId: 'engine-austin',
      name: 'region-us-tx-austin',
      memberPlaceIds: ['place-austin'],
    }),
    territoryPlaceIds: jest
      .fn()
      .mockResolvedValue(['place-austin', 'place-hyde-park']),
  };
  const reservations: Array<{ declared: number; workClass: string }> = [];
  const governance = {
    pools: {
      reserve: jest.fn((_pool: string, declared: number, workClass: string) => {
        reservations.push({ declared, workClass });
        return options.admit === false
          ? { admitted: false, reason: 'exhausted', retryAfterMs: 1000 }
          : {
              admitted: true,
              reservationId: `res-${reservations.length}`,
              poolName: 'reddit.requests',
              declared,
            };
      }),
      reconcile: jest.fn(),
    },
  };
  const chronologicalScheduler = {
    scheduleChronologicalCollection: jest.fn().mockResolvedValue('job-id'),
  };
  const sliceSelection = {
    selectTermsForSource: jest.fn().mockResolvedValue({
      source: {},
      windowDays: 30,
      maxTerms: 25,
      floors: { unmet: 5, explore: 2 },
      terms: [{ term: 'brisket', normalizedTerm: 'brisket', slice: 'demand' }],
      stats: {},
    }),
  };
  const keywordOrchestrator = {
    enqueueKeywordSearchJob: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CollectorPacerService(
    prisma as never,
    logger as never,
    registry as never,
    governance as never,
    chronologicalScheduler as never,
    sliceSelection as never,
    keywordOrchestrator as never,
  );
  service.onModuleInit();
  return {
    service,
    prisma,
    logger,
    registry,
    governance,
    reservations,
    chronologicalScheduler,
    sliceSelection,
    keywordOrchestrator,
  };
}

describe('CollectorPacerService', () => {
  it('dispatches due lanes and advances each by its own cadence', async () => {
    const lanes = [
      makeLane({ sourceId: 'src-1', lane: 'chronological' }),
      makeLane({
        sourceId: 'src-1',
        lane: 'keyword',
        cadenceDays: 7,
        latenessToleranceDays: 7,
      }),
    ];
    const h = build({ lanes });
    const result = await h.service.tick(NOW);
    expect(result).toEqual({ dispatched: 2, denied: 0 });
    expect(h.registry.advanceLane).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      NOW,
    );
    expect(h.registry.advanceLane).toHaveBeenCalledWith(
      'src-1',
      'keyword',
      NOW,
    );
  });

  it('pool denial is a typed not-now: lane stays due, no advance, no error', async () => {
    const h = build({ lanes: [makeLane()], admit: false });
    const result = await h.service.tick(NOW);
    expect(result).toEqual({ dispatched: 0, denied: 1 });
    expect(h.registry.advanceLane).not.toHaveBeenCalled();
    expect(
      h.chronologicalScheduler.scheduleChronologicalCollection,
    ).not.toHaveBeenCalled();
    // Never an error outcome (§12.3): denial logs a warn, not an error.
    expect(h.logger.error).not.toHaveBeenCalled();
  });

  it('chronological dispatch carries the lane-row cursor + source identity + declared estimate', async () => {
    const cursor = '2026-07-18T00:00:00.000Z';
    const h = build({
      lanes: [makeLane({ state: { lastProcessedAt: cursor } })],
    });
    await h.service.tick(NOW);
    expect(
      h.chronologicalScheduler.scheduleChronologicalCollection,
    ).toHaveBeenCalledWith(
      'austinfood',
      expect.objectContaining({
        sourceId: 'src-1',
        declaredRequests: expect.any(Number) as number,
        lastProcessedTimestamp: Math.floor(Date.parse(cursor) / 1000),
        dedupeKey: expect.any(String) as string,
      }),
    );
    // The dispatch was an enumerated draw on the reddit pool.
    expect(h.reservations).toEqual([
      expect.objectContaining({ workClass: 'collector.chronological' }),
    ]);
    expect(h.governance.pools.reconcile).toHaveBeenCalled();
  });

  it('keyword dispatch selects per SOURCE with the derived engine territory and stamps engine identity', async () => {
    const h = build({
      lanes: [
        makeLane({
          lane: 'keyword',
          cadenceDays: 7,
          latenessToleranceDays: 7,
          state: { lastTopRelevanceRunAt: '2026-07-01T00:00:00.000Z' },
        }),
      ],
    });
    await h.service.tick(NOW);
    expect(h.sliceSelection.selectTermsForSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'src-1',
        handle: 'austinfood',
        engineId: 'engine-austin',
        engineName: 'region-us-tx-austin',
        territoryPlaceIds: ['place-austin', 'place-hyde-park'],
        safeIntervalDays: 12,
      }),
    );
    expect(h.keywordOrchestrator.enqueueKeywordSearchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'src-1',
        engineId: 'engine-austin',
        collectableMarketKey: 'region-us-tx-austin',
        declaredRequests: expect.any(Number) as number,
        source: 'scheduled',
      }),
    );
  });

  it('keyword lane with no due terms is a legit outcome: cadence advances, nothing enqueued, no pool draw', async () => {
    const h = build({
      lanes: [
        makeLane({ lane: 'keyword', cadenceDays: 7, latenessToleranceDays: 7 }),
      ],
    });
    h.sliceSelection.selectTermsForSource.mockResolvedValue({
      terms: [],
      floors: { unmet: 5, explore: 2 },
      stats: {},
    });
    const result = await h.service.tick(NOW);
    expect(result.dispatched).toBe(1);
    expect(
      h.keywordOrchestrator.enqueueKeywordSearchJob,
    ).not.toHaveBeenCalled();
    expect(h.reservations).toEqual([]);
    expect(h.registry.advanceLane).toHaveBeenCalledWith(
      'src-1',
      'keyword',
      NOW,
    );
  });

  it('a lane on an unknown platform never silently routes or advances', async () => {
    const h = build({
      lanes: [makeLane({ platform: 'poll_surface', handle: 'poll:x' })],
    });
    const result = await h.service.tick(NOW);
    expect(result.dispatched).toBe(0);
    expect(h.registry.advanceLane).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith(
      'Lane for unknown collection platform',
      expect.objectContaining({ platform: 'poll_surface' }),
    );
  });

  it('a dispatch failure leaves the lane due (retried next tick), loudly', async () => {
    const h = build({ lanes: [makeLane()] });
    h.chronologicalScheduler.scheduleChronologicalCollection.mockRejectedValue(
      new Error('bull down'),
    );
    const result = await h.service.tick(NOW);
    expect(result.dispatched).toBe(0);
    expect(h.registry.advanceLane).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith(
      'Lane dispatch failed; lane remains due',
      expect.objectContaining({ handle: 'austinfood' }),
    );
  });
});
