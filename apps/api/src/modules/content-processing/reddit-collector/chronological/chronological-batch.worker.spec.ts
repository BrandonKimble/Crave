/**
 * §12.4 honest-outcome law for the chronological batch worker: a REAL error
 * THROWS (Bull retries, then fails the job visibly); legitimate non-error
 * verdicts (service-level covered-skip, governance not-now) complete. The
 * pre-fix behavior — returning success:false on real errors — was an
 * always-green liar: Bull marked the job "completed" and nothing downstream
 * read the flag.
 */
// p-limit is ESM-only; jest's CJS transform chokes on it when the worker's
// import chain pulls in llm-concurrent-processing. Stub it — this spec never
// runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { Job, Queue } from 'bull';
import { ChronologicalBatchProcessingWorker } from './chronological-batch.worker';
import { RedditGovernanceDenialError } from '../../../external-integrations/reddit/reddit.exceptions';
import {
  BatchJob,
  BatchProcessingResult,
} from '../batch-processing-queue.types';

describe('ChronologicalBatchProcessingWorker (§12.4 honest outcomes)', () => {
  const makeJobData = (): BatchJob => ({
    batchId: 'batch-1',
    parentJobId: 'parent-1',
    collectionType: 'chronological',
    subreddit: 'austinfood',
    batchNumber: 1,
    totalBatches: 2,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    postIds: ['t3_a', 't3_b'],
    options: { depth: 2 },
  });

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
    const worker = new ChronologicalBatchProcessingWorker(
      logger as never,
      { processBatch } as never,
      { add: queueAdd } as unknown as Queue<BatchJob>,
    );
    worker.onModuleInit();
    return { worker, queueAdd, logger };
  };

  it('THROWS on a real processing error (Bull retries / fails visibly — never a completed success:false result)', async () => {
    const boom = new Error('extraction pipeline exploded');
    const { worker, queueAdd } = makeWorker(jest.fn().mockRejectedValue(boom));

    await expect(
      worker.processChronologicalBatch(makeJob(makeJobData())),
    ).rejects.toThrow('extraction pipeline exploded');
    // A real error is never silently requeued as if it were a deferral.
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('completes (returns) on a legitimate service verdict — e.g. a covered-skip result', async () => {
    const skipResult: BatchProcessingResult = {
      batchId: 'batch-1',
      parentJobId: 'parent-1',
      collectionType: 'chronological',
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
      details: { warnings: ['Skipped batch: no eligible posts after gating'] },
    };
    const { worker } = makeWorker(jest.fn().mockResolvedValue(skipResult));

    const result = await worker.processChronologicalBatch(
      makeJob(makeJobData()),
    );
    expect(result.success).toBe(true);
  });

  it('governance denial stays a typed not-now: completed + whole batch requeued after the retry hint', async () => {
    const { worker, queueAdd } = makeWorker(
      jest
        .fn()
        .mockRejectedValue(new RedditGovernanceDenialError('not now', 30_000)),
    );

    const result = await worker.processChronologicalBatch(
      makeJob(makeJobData()),
    );
    expect(result.success).toBe(true);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const requeueOpts = (queueAdd.mock.calls[0] as unknown[])[2];
    expect(requeueOpts).toMatchObject({ delay: 30_000 });
  });
});
