/**
 * §12.4 honest-outcome law for the archive batch worker (F454): a REAL error
 * THROWS (Bull retries, then fails the job visibly); legitimate non-error
 * verdicts (service-level covered-skip) complete. The pre-fix catch arm
 * RETURNED {success:false} — Bull marked the job "completed", no retry ran,
 * and the failure vanished into an always-green queue.
 */
// p-limit is ESM-only; jest's CJS transform chokes on it when the worker's
// import chain pulls in llm-concurrent-processing. Stub it.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { Job } from 'bull';
import { ArchiveBatchProcessingWorker } from './archive-batch.worker';
import {
  BatchJob,
  BatchProcessingResult,
} from '../batch-processing-queue.types';

describe('ArchiveBatchProcessingWorker (§12.4 honest outcomes)', () => {
  const makeJobData = (): BatchJob =>
    ({
      batchId: 'batch-1',
      parentJobId: 'parent-1',
      collectionType: 'archive',
      subreddit: 'austinfood',
      batchNumber: 1,
      totalBatches: 2,
      createdAt: new Date('2026-07-20T00:00:00Z'),
      postIds: ['t3_a'],
      llmPosts: [{ id: 't3_a' }],
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
    const worker = new ArchiveBatchProcessingWorker(
      logger as never,
      {
        processBatch,
      } as never,
    );
    worker.onModuleInit();
    return { worker, logger };
  };

  it('THROWS on a real processing error (never a completed success:false result)', async () => {
    const boom = new Error('archive extraction exploded');
    const { worker } = makeWorker(jest.fn().mockRejectedValue(boom));

    await expect(
      worker.processArchiveBatch(makeJob(makeJobData())),
    ).rejects.toThrow('archive extraction exploded');
  });

  it('completes (returns) on a legitimate service verdict — e.g. a covered-skip result', async () => {
    const skipResult: BatchProcessingResult = {
      batchId: 'batch-1',
      parentJobId: 'parent-1',
      collectionType: 'archive',
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

    const result = await worker.processArchiveBatch(makeJob(makeJobData()));
    expect(result.success).toBe(true);
  });

  it('THROWS on a misrouted batch (wrong collection type)', async () => {
    const { worker } = makeWorker(jest.fn());
    const data = { ...makeJobData(), collectionType: 'keyword' } as BatchJob;

    await expect(worker.processArchiveBatch(makeJob(data))).rejects.toThrow(
      /only handles archive batches/,
    );
  });
});
