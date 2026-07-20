// p-limit is ESM-only; jest's CJS transform chokes on it when the batch
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { RedditBatchProcessingService } from './reddit-batch-processing.service';
import { RedditGovernanceDenialError } from '../../external-integrations/reddit/reddit.exceptions';
import type { BatchJob } from './batch-processing-queue.types';

/**
 * §10 batch-side specs: a covered-skip batch COMMITS the parent's staged
 * cursor (coverage already proven) and counts itself for the expectedBatches
 * reconciler; a governance denial mid-batch aborts the remaining requests
 * (typed not-now propagates, no per-post silent drops).
 */

function build() {
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const redditService = {
    getCompletePostWithComments: jest.fn(),
    fetchRecentCommentIds: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue(undefined) };
  const prismaService = {
    processedSource: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const marketRegistry = { resolveMarketKeyForCommunity: jest.fn() };
  const rescoreCoordinator = { markDirty: jest.fn().mockResolvedValue(true) };
  const extractionPipelineService = { processPosts: jest.fn() };
  const sourceRegistry = {
    findRedditSourceByHandle: jest.fn().mockResolvedValue({
      sourceId: 'src-1',
      engineId: null,
      anchorPlaceId: null,
    }),
    commitPendingWindow: jest.fn().mockResolvedValue(true),
  };
  const collectionEvidence = {
    recordSkippedBatch: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RedditBatchProcessingService(
    logger as never,
    redditService as never,
    configService as never,
    prismaService as never,
    marketRegistry as never,
    rescoreCoordinator as never,
    extractionPipelineService as never,
    sourceRegistry as never,
    collectionEvidence as never,
  );
  service.onModuleInit();
  return {
    service,
    redditService,
    prismaService,
    sourceRegistry,
    collectionEvidence,
  };
}

function chronologicalJob(postIds: string[]): BatchJob {
  return {
    batchId: 'job-1-batch-1',
    parentJobId: 'job-1',
    collectionType: 'chronological',
    subreddit: 'austinfood',
    postIds,
    batchNumber: 1,
    totalBatches: 1,
    createdAt: new Date(),
  } as BatchJob;
}

describe('RedditBatchProcessingService (§10 batch-side window proof)', () => {
  it('a fully covered-skip batch commits the pending window + records the skip for the reconciler', async () => {
    const h = build();
    // Every candidate freshly processed → freshness gate skips them all.
    h.prismaService.processedSource.findMany.mockResolvedValue([
      { sourceId: 't3_p1', processedAt: new Date() },
    ]);
    const result = await h.service.processBatch(
      chronologicalJob(['p1']),
      'corr-1',
    );
    expect(result.success).toBe(true);
    expect(result.metrics.postsProcessed).toBe(0);
    expect(h.collectionEvidence.recordSkippedBatch).toHaveBeenCalledWith(
      'collection:job-1',
    );
    expect(h.sourceRegistry.commitPendingWindow).toHaveBeenCalledWith(
      'src-1',
      'chronological',
      'job-1',
    );
  });

  it('a governance denial mid-batch ABORTS the remaining requests (typed not-now propagates)', async () => {
    const h = build();
    h.redditService.getCompletePostWithComments
      .mockResolvedValueOnce({ rawResponse: [], attribution: { postUrl: '' } })
      .mockRejectedValueOnce(new RedditGovernanceDenialError('not now', 500));
    await expect(
      h.service.processBatch(chronologicalJob(['p1', 'p2', 'p3']), 'corr-1'),
    ).rejects.toBeInstanceOf(RedditGovernanceDenialError);
    // p3 was never fetched — the abort is clean, not a silent per-post drop.
    expect(h.redditService.getCompletePostWithComments).toHaveBeenCalledTimes(
      2,
    );
    // And nothing committed the window for an aborted batch.
    expect(h.sourceRegistry.commitPendingWindow).not.toHaveBeenCalled();
  });
});
