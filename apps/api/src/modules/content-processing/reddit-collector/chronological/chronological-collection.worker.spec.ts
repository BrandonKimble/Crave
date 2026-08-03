import { ChronologicalCollectionWorker } from './chronological-collection.worker';
import {
  RedditApiError,
  RedditGovernanceDenialError,
} from '../../../external-integrations/reddit/reddit.exceptions';

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

/** Raw Reddit thread response for the orphan-parent fetch path. */
function rawThreadResponse(postFullname: string) {
  return [
    {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              name: postFullname,
              title: 'Old thread',
              selftext: 'Original body',
              subreddit: 'austinfood',
              author: 'op',
              score: 3,
              created_utc: 1_700_000_000,
            },
          },
        ],
      },
    },
    { data: { children: [] } },
  ];
}

function build(options: {
  posts?: Array<Record<string, unknown>>;
  overlapConfirmed?: boolean;
  fetchError?: Error;
  orphanParents?: string[];
  judgedParents?: string[];
  parentFetch?: 'ok' | 'gone' | Error;
}) {
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const parentFetch = options.parentFetch ?? 'ok';
  const redditService = {
    getChronologicalPosts: options.fetchError
      ? jest.fn().mockRejectedValue(options.fetchError)
      : jest
          .fn()
          .mockResolvedValue(
            fetchResult(options.posts ?? [], options.overlapConfirmed),
          ),
    getCompletePostWithComments: jest.fn(
      (subreddit: string, baseId: string) => {
        if (parentFetch instanceof Error) {
          return Promise.reject(parentFetch);
        }
        return Promise.resolve({
          rawResponse:
            parentFetch === 'gone' ? [] : rawThreadResponse(`t3_${baseId}`),
          metadata: { retrievalMethod: 'raw', rateLimitStatus: {} },
          performance: {
            responseTime: 5,
            apiCallsUsed: 1,
            rateLimitHit: false,
          },
          attribution: { postUrl: `/r/${subreddit}/comments/${baseId}` },
        });
      },
    ),
  };
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        (options.orphanParents ?? []).map((id) => ({ parent_source_id: id })),
      ),
    collectionRelevanceVerdict: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.judgedParents ?? []).map((id) => ({ postId: id })),
        ),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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
    clearCoverageGapIfRecovered: jest.fn().mockResolvedValue(false),
  };
  const governance = { pools: { recordActualPair: jest.fn() } };
  const collectionEvidence = {
    registerExpectedFanOut: jest.fn().mockResolvedValue(undefined),
  };
  const batchQueue = { add: jest.fn().mockResolvedValue({ id: 'bull-1' }) };
  const worker = new ChronologicalCollectionWorker(
    logger as never,
    prisma as never,
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
    prisma,
    redditService,
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
    // The set path never attempts a clear.
    expect(h.sourceRegistry.clearCoverageGapIfRecovered).not.toHaveBeenCalled();
  });

  it('an OVERLAPPING fetch offers its reach for the derived gap clear (F456 — the latch has a release)', async () => {
    const OLDEST_UTC = 1_800_000_000;
    const posts = [
      { id: 'p1', created_utc: 1_800_000_500 },
      { id: 'p2', created_utc: OLDEST_UTC },
    ];
    const h = build({ posts, overlapConfirmed: true });
    await h.worker.processChronologicalCollection(h.job as never);
    // The reach offered is the OLDEST post actually fetched — a fact, not an
    // assertion that the gap is closed. The registry decides.
    expect(h.sourceRegistry.clearCoverageGapIfRecovered).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      new Date(OLDEST_UTC * 1000),
    );
    // And an overlapping fetch never RECORDS a gap.
    const gapWrites = h.sourceRegistry.mergeLaneState.mock.calls.filter(
      ([, , patch]: [string, string, Record<string, unknown>]) =>
        'coverageGap' in patch,
    );
    expect(gapWrites).toHaveLength(0);
  });
});

describe('ChronologicalCollectionWorker (§10 orphan-parent self-healing sweep)', () => {
  it('an orphan comment triggers a parent fetch and the parent rides a NORMAL batch toward gating', async () => {
    const posts = [{ id: 'p1', created_utc: 1_800_000_000 }];
    const h = build({ posts, orphanParents: ['t3_old1'] });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    // Parent fetched by id through the existing chokepoint (base id, no t3_).
    expect(h.redditService.getCompletePostWithComments).toHaveBeenCalledWith(
      'austinfood',
      'old1',
      { depth: 50 },
    );
    // Healing batch enqueued with pre-transformed llmPosts — the normal batch
    // path persists + gates it (no parallel gating machinery).
    const healingCall = h.batchQueue.add.mock.calls.find(
      ([, data]: [string, { batchId: string }]) =>
        data.batchId === 'job-1-orphan-parents',
    ) as [string, { llmPosts: Array<{ id: string }> }];
    expect(healingCall).toBeDefined();
    expect(healingCall[1].llmPosts).toHaveLength(1);
    expect(healingCall[1].llmPosts[0].id).toBe('t3_old1');
    // The healing batch counts in the §10 fan-out (1 listing batch + 1 heal).
    expect(h.collectionEvidence.registerExpectedFanOut).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBatches: 2 }),
    );
    expect(result.batchesProcessed).toBe(2);
  });

  it('the sweep runs even on a legit-zero tick (pre-existing orphans heal without new posts)', async () => {
    const h = build({ posts: [], orphanParents: ['t3_old1'] });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    expect(h.redditService.getCompletePostWithComments).toHaveBeenCalled();
    expect(h.collectionEvidence.registerExpectedFanOut).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBatches: 1 }),
    );
    expect(h.batchQueue.add).toHaveBeenCalledTimes(1);
  });

  it('an unfetchable parent (404) gets the keep=false parent_unfetchable tombstone verdict', async () => {
    const h = build({
      posts: [{ id: 'p1', created_utc: 1_800_000_000 }],
      orphanParents: ['t3_gone1'],
      parentFetch: new RedditApiError('not found', 404),
    });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    expect(h.prisma.collectionRelevanceVerdict.createMany).toHaveBeenCalledWith(
      {
        data: [
          expect.objectContaining({
            platform: 'reddit',
            postId: 't3_gone1',
            keep: false,
            reason: 'parent_unfetchable',
          }),
        ],
        skipDuplicates: true,
      },
    );
    // Nothing healed → no healing batch.
    expect(result.batchesProcessed).toBe(1);
  });

  it('a fetch that answers without a post payload is also tombstoned (parent deleted)', async () => {
    const h = build({
      posts: [{ id: 'p1', created_utc: 1_800_000_000 }],
      orphanParents: ['t3_gone2'],
      parentFetch: 'gone',
    });
    await h.worker.processChronologicalCollection(h.job as never);
    expect(h.prisma.collectionRelevanceVerdict.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ postId: 't3_gone2', keep: false })],
      }),
    );
  });

  it('a tombstoned parent is NOT retried on the next tick (verdict filter excludes it)', async () => {
    const h = build({
      posts: [{ id: 'p1', created_utc: 1_800_000_000 }],
      orphanParents: ['t3_gone1'],
      judgedParents: ['t3_gone1'],
    });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(h.redditService.getCompletePostWithComments).not.toHaveBeenCalled();
    expect(
      h.prisma.collectionRelevanceVerdict.createMany,
    ).not.toHaveBeenCalled();
    expect(result.batchesProcessed).toBe(1);
  });

  it('the sweep is a strict no-op when no orphans exist', async () => {
    const h = build({ posts: [{ id: 'p1', created_utc: 1_800_000_000 }] });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(h.redditService.getCompletePostWithComments).not.toHaveBeenCalled();
    expect(h.collectionEvidence.registerExpectedFanOut).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBatches: 1 }),
    );
    expect(result.batchesProcessed).toBe(1);
  });

  it('a transient parent-fetch failure leaves the orphan for the next tick (no tombstone, no fabrication)', async () => {
    const h = build({
      posts: [{ id: 'p1', created_utc: 1_800_000_000 }],
      orphanParents: ['t3_flaky'],
      parentFetch: new Error('socket hang up'),
    });
    const result = await h.worker.processChronologicalCollection(
      h.job as never,
    );
    expect(result.success).toBe(true);
    expect(
      h.prisma.collectionRelevanceVerdict.createMany,
    ).not.toHaveBeenCalled();
    expect(result.batchesProcessed).toBe(1);
  });
});
