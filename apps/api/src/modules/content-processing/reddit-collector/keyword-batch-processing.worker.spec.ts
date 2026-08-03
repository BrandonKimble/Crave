/**
 * §12.4 honest-outcome law for the keyword batch worker (F454): a REAL error
 * THROWS; legitimate non-error verdicts (covered-skip, governance not-now)
 * complete. `buildNoopResult` used to return a success:false verdict for a
 * misrouted batch — Bull marked it COMPLETED and its posts were dropped.
 */
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { Job, Queue } from 'bull';
import { KeywordBatchProcessingWorker } from './keyword-batch-processing.worker';
import { RedditGovernanceDenialError } from '../../external-integrations/reddit/reddit.exceptions';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

describe('KeywordBatchProcessingWorker (§12.4 honest outcomes)', () => {
  const makeJobData = (): BatchJob =>
    ({
      batchId: 'batch-1',
      parentJobId: 'parent-1',
      collectionType: 'keyword',
      subreddit: 'austinfood',
      batchNumber: 1,
      totalBatches: 2,
      createdAt: new Date('2026-07-20T00:00:00Z'),
      postIds: ['t3_a', 't3_b'],
    }) as unknown as BatchJob;

  const makeJob = (data: BatchJob): Job<BatchJob> =>
    ({
      data,
      progress: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Job<BatchJob>;

  const makeWorker = (processBatch: jest.Mock) => {
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const worker = new KeywordBatchProcessingWorker(
      logger as never,
      { processBatch } as never,
      { add: queueAdd } as unknown as Queue<BatchJob>,
    );
    worker.onModuleInit();
    return { worker, queueAdd, logger };
  };

  it('THROWS on a real processing error (never a completed success:false result)', async () => {
    const { worker, queueAdd } = makeWorker(
      jest.fn().mockRejectedValue(new Error('keyword extraction exploded')),
    );

    await expect(
      worker.processKeywordBatch(makeJob(makeJobData())),
    ).rejects.toThrow('keyword extraction exploded');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('THROWS on a misrouted batch — no success:false noop verdict', async () => {
    const { worker } = makeWorker(jest.fn());
    const data = { ...makeJobData(), collectionType: 'archive' } as BatchJob;

    await expect(worker.processKeywordBatch(makeJob(data))).rejects.toThrow(
      /Batch Routing/,
    );
  });

  it('completes (returns) on a legitimate service verdict — e.g. a covered-skip result', async () => {
    const skipResult: BatchProcessingResult = {
      batchId: 'batch-1',
      parentJobId: 'parent-1',
      collectionType: 'keyword',
      success: true,
      metrics: {
        postsProcessed: 0,
        mentionsExtracted: 0,
        entitiesCreated: 0,
        connectionsCreated: 0,
        processingTimeMs: 5,
        llmProcessingTimeMs: 0,
        dbProcessingTimeMs: 0,
      },
      completedAt: new Date(),
      details: { warnings: ['Skipped batch: already covered'] },
    };
    const { worker } = makeWorker(jest.fn().mockResolvedValue(skipResult));

    const result = await worker.processKeywordBatch(makeJob(makeJobData()));
    expect(result.success).toBe(true);
  });

  it('governance denial stays a typed not-now: completed + whole batch requeued after the retry hint', async () => {
    const { worker, queueAdd } = makeWorker(
      jest
        .fn()
        .mockRejectedValue(new RedditGovernanceDenialError('not now', 30_000)),
    );

    const result = await worker.processKeywordBatch(makeJob(makeJobData()));
    expect(result.success).toBe(true);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const requeueOpts = (queueAdd.mock.calls[0] as unknown[])[2];
    expect(requeueOpts).toMatchObject({ delay: 30_000 });
  });
});
