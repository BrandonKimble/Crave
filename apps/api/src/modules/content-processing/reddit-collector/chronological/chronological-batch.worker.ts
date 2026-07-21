import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { RedditBatchProcessingService } from '../reddit-batch-processing.service';
import { RedditGovernanceDenialError } from '../../../external-integrations/reddit/reddit.exceptions';
import {
  BatchJob,
  BatchProcessingResult,
} from '../batch-processing-queue.types';

/** §16: K3-shaped operational bound — requeue delay for a governance-denied
 *  batch when the denial carries no retryAfter (one minute window roll). */
const GOVERNANCE_REQUEUE_DELAY_MS = 60_000;

@Processor('chronological-batch-processing-queue')
@Injectable()
export class ChronologicalBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly batchProcessingService: RedditBatchProcessingService,
    @InjectQueue('chronological-batch-processing-queue')
    private readonly batchQueue: Queue<BatchJob>,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ChronologicalBatchProcessingWorker',
    );
  }

  @Process({ name: 'process-chronological-batch', concurrency: 1 })
  async processChronologicalBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();
    const {
      batchId,
      parentJobId,
      collectionType,
      subreddit,
      postIds = [],
      batchNumber,
      totalBatches,
    } = job.data;

    if (collectionType !== 'chronological') {
      throw new Error(
        `This worker only handles chronological batches, got: ${collectionType}`,
      );
    }

    this.logger.info('Collection batch started', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
      collectionType,
      postCount: postIds.length,
      progress: `${batchNumber}/${totalBatches}`,
    });

    try {
      const result = await this.batchProcessingService.processBatch(
        job.data,
        correlationId,
      );

      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.logger.info('Collection batch completed', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
        collectionType,
        processingTimeMs: processingTime,
        mentionsExtracted: result.metrics.mentionsExtracted,
        entitiesCreated: result.metrics.entitiesCreated,
        connectionsCreated: result.metrics.connectionsCreated,
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof RedditGovernanceDenialError) {
        // §12.3 typed not-now mid-batch: the remaining requests were aborted
        // cleanly; the batch STAYS DUE — requeued whole under a new jobId
        // (Bull dedupes the original id) after the governor's retry hint.
        // Never a failure, never a partial "success".
        const delay = Math.max(
          error.retryAfterMs ?? GOVERNANCE_REQUEUE_DELAY_MS,
          1_000,
        );
        await this.batchQueue.add('process-chronological-batch', job.data, {
          jobId: `${batchId}-gov-${Date.now()}`,
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay,
        });
        this.logger.info('Collection batch deferred by governance (requeued)', {
          correlationId,
          batchId,
          parentJobId,
          subreddit,
          requeueDelayMs: delay,
        });
        return {
          batchId,
          parentJobId,
          collectionType,
          success: true,
          metrics: {
            postsProcessed: 0,
            mentionsExtracted: 0,
            entitiesCreated: 0,
            connectionsCreated: 0,
            processingTimeMs: processingTime,
            llmProcessingTimeMs: 0,
            dbProcessingTimeMs: 0,
          },
          completedAt: new Date(),
          details: {
            warnings: ['governance not-now: batch requeued (typed deferral)'],
          },
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Collection batch failed', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
        collectionType,
        processingTimeMs: processingTime,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // §12.4 honest-outcome law: a REAL error must THROW so Bull retries and,
      // on exhaustion, marks the job FAILED — visibly. Returning a
      // success:false result here was an always-green liar (Bull records the
      // job "completed"; nothing downstream ever read the flag). Legitimate
      // non-error verdicts (covered-skip, governance not-now) return
      // completed results above; only genuine failures reach this throw.
      throw error;
    }
  }
}
