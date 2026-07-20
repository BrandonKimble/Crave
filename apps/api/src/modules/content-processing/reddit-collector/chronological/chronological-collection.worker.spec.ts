import { ChronologicalCollectionWorker } from './chronological-collection.worker';
import { RedditGovernanceDenialError } from '../../../external-integrations/reddit/reddit.exceptions';

/**
 * §10 advance-at-extraction specs (the cursor law):
 *  - a non-empty fetch STAGES the window + registers expected fan-out and
 *    NEVER moves the cursor at fetch (the extraction-run write commits it);
 *  - a legit-zero fetch advances immediately (nothing to await);
 *  - a governance denial mid-dispatch re-arms the lane due, cleanly;
 *  - a fetch that never overlapped the cursor records a C4 coverage gap.
 */

const CURSOR_ISO = '2026-07-18T00:00:00.000Z';

function fetchResult(
  posts: Array<Record<string, unknown>>,
  overlapConfirmed: boolean | undefined = true,
) {
  return {
    data: posts,
    metadata: {
      totalRetrieved: posts.length,
      rateLimitStatus: {},
      costIncurred: 0,
      ...(overlapConfirmed === undefined ? {} : { overlapConfirmed }),
    },
    performance: { responseTime: 5, apiCallsUsed: 1, rateLimitHit: false },
  };
}

function build(options: {
  posts?: Array<Record<string, unknown>>;
  overlapConfirmed?: boolean;
  fetchError?: Error;
}) {
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const redditService = {
    getChronologicalPosts: options.fetchError
      ? jest.fn().mockRejectedValue(options.fetchError)
      : jest
          .fn()
          .mockResolvedValue(
            fetchResult(options.posts ?? [], options.overlapConfirmed),
          ),
  };
  const sourceRegistry = {
    findRedditSourceByHandle: jest.fn().mockResolvedValue({
      sourceId: 'src-1',
      engineId: 'engine-1',
      anchorPlaceId: null,
    }),
    getLane: jest.fn().mockResolvedValue({
      state: { lastProcessedAt: CURSOR_ISO },
    }),
    mergeLaneState: jest.fn().mockResolvedValue(undefined),
    stagePendingWindow: jest.fn().mockResolvedValue(undefined),
    recordLaneOutput: jest.fn().mockResolvedValue(undefined),
    markLaneDue: jest.fn().mockResolvedValue(undefined),
  };
  const governance = { pools: { recordActualPair: jest.fn() } };
  const collectionEvidence = {
    registerExpectedFanOut: jest.fn().mockResolvedValue(undefined),
  };
  const batchQueue = { add: jest.fn().mockResolvedValue({ id: 'bull-1' }) };
  const worker = new ChronologicalCollectionWorker(
    logger as never,
    {} as never,
    redditService as never,
    sourceRegistry as never,
    governance as never,
    collectionEvidence as never,
    batchQueue as never,
  );
  worker.onModuleInit();
  const job = {
    data: {
      subreddit: 'austinfood',
      jobId: 'job-1',
      triggeredBy: 'scheduled' as const,
      sourceId: 'src-1',
      declaredRequests: 10,
      options: {},
    },
    log: jest.fn().mockResolvedValue(undefined),
  };
  return {
    worker,
    job,
    logger,
    sourceRegistry,
    collectionEvidence,
    governance,
    batchQueue,
  };
}

describe('ChronologicalCollectionWorker (§10 cursor law)', () => {
  it('a non-empty fetch STAGES the window and registers fan-out — the cursor does NOT move at fetch', async () => {
    const posts = [{ id: 'p1', created_utc: 1_800_000_000 }];
    const h = build({ posts });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    expect(h.collectionEvidence.registerExpectedFanOut).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: 'collection:job-1',
        sourceId: 'src-1',
        lane: 'chronological',
        expectedBatches: 1,
      }),
    );
    expect(h.sourceRegistry.stagePendingWindow).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      expect.objectContaining({ parentJobId: 'job-1', expectedBatches: 1 }),
    );
    // The one forbidden write: lastProcessedAt at fetch time.
    const cursorWrites = h.sourceRegistry.mergeLaneState.mock.calls.filter(
      ([, , patch]: [string, string, Record<string, unknown>]) =>
        'lastProcessedAt' in patch,
    );
    expect(cursorWrites).toHaveLength(0);
    // Staging happens BEFORE any batch is enqueued (a batch may commit
    // immediately).
    expect(
      h.sourceRegistry.stagePendingWindow.mock.invocationCallOrder[0],
    ).toBeLessThan(h.batchQueue.add.mock.invocationCallOrder[0]);
  });

  it('a legit-zero fetch advances the cursor immediately (window observed empty — nothing to await)', async () => {
    const h = build({ posts: [] });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    expect(h.sourceRegistry.mergeLaneState).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      expect.objectContaining({
        lastProcessedAt: expect.any(String) as unknown,
      }),
    );
    expect(h.sourceRegistry.stagePendingWindow).not.toHaveBeenCalled();
    // Legit-zero still writes the output heartbeat.
    expect(h.sourceRegistry.recordLaneOutput).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      0,
    );
  });

  it('a governance denial mid-dispatch re-arms the lane due, with zero error branding (§12.3)', async () => {
    const h = build({
      fetchError: new RedditGovernanceDenialError('not now', 1000),
    });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result).toMatchObject({
      success: true,
      deferredByGovernance: true,
      postsProcessed: 0,
    });
    expect(h.sourceRegistry.markLaneDue).toHaveBeenCalledWith(
      'src-1',
      'chronological',
    );
    expect(h.logger.error).not.toHaveBeenCalled();
    expect(h.sourceRegistry.mergeLaneState).not.toHaveBeenCalled();
  });

  it('a real fetch failure still THROWS (§12.4: no success:false liars)', async () => {
    const h = build({ fetchError: new Error('reddit down') });
    await expect(
      h.worker.processChronologicalCollection(h.job as never),
    ).rejects.toThrow('reddit down');
  });

  it('a fetch that never overlapped the cursor records the §10 C4 coverage gap (RED fact)', async () => {
    const posts = [{ id: 'p1', created_utc: 1_800_000_000 }];
    const h = build({ posts, overlapConfirmed: false });
    await h.worker.processChronologicalCollection(h.job as never);
    expect(h.sourceRegistry.mergeLaneState).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      expect.objectContaining({
        coverageGap: expect.objectContaining({
          detectedAt: expect.any(String) as unknown,
        }) as unknown,
      }),
    );
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('coverage gap'),
      expect.anything(),
    );
  });
});
