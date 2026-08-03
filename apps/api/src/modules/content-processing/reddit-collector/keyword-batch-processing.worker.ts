import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';
import { RedditBatchProcessingService } from './reddit-batch-processing.service';
import { RedditGovernanceDenialError } from '../../external-integrations/reddit/reddit.exceptions';
import { BatchRoutingException } from './unified-processing.exceptions';

/** §16: K3-shaped operational bound — requeue delay for a governance-denied
 *  batch when the denial carries no retryAfter (one minute window roll). */
const GOVERNANCE_REQUEUE_DELAY_MS = 60_000;

/**
 * Keyword Batch Processing Worker
 *
 * Processes keyword-search collection batches via the shared batch processor.
 */
@Processor('keyword-batch-processing-queue')
@Injectable()
export class KeywordBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly redditBatchProcessingService: RedditBatchProcessingService,
    @InjectQueue('keyword-batch-processing-queue')
    private readonly batchQueue: Queue<BatchJob>,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordBatchProcessingWorker');
  }

  // Concurrency kept at 1 to avoid exceeding LLM rate limits once implemented
  @Process({ name: 'process-keyword-batch', concurrency: 1 })
  async processKeywordBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const batch = job.data;
    const cycleId = batch.cycleId ?? CorrelationUtils.generateCorrelationId();

    return CorrelationUtils.runWithContext(
      {
        correlationId: cycleId,
        startTime: Date.now(),
      },
      async () => {
        if (batch.collectionType !== 'keyword') {
          // §12.4 (F454): this used to return a success:false noop — Bull
          // marked the misrouted batch COMPLETED and its posts were dropped
          // silently. Workers return VERDICTS or THROW.
          throw new BatchRoutingException(
            `keyword worker received a '${batch.collectionType}' batch`,
            undefined,
            {
              batchId: batch.batchId,
              parentJobId: batch.parentJobId,
              collectionType: batch.collectionType,
              postCount: batch.postIds?.length ?? 0,
            },
          );
        }

        this.logger.info('Collection batch started', {
          cycleId,
          correlationId: cycleId,
          batchId: batch.batchId,
          subreddit: batch.subreddit,
          collectionType: batch.collectionType,
          batch: `${batch.batchNumber}/${batch.totalBatches}`,
          posts: batch.postIds?.length ?? 0,
        });

        try {
          const result = await this.redditBatchProcessingService.processBatch(
            batch,
            cycleId,
          );
          this.logger.info('Collection batch completed', {
            cycleId,
            correlationId: cycleId,
            batchId: batch.batchId,
            collectionType: batch.collectionType,
            subreddit: batch.subreddit,
            postsProcessed: result.metrics.postsProcessed,
            mentionsExtracted: result.metrics.mentionsExtracted,
          });
          return result;
        } catch (error) {
          if (error instanceof RedditGovernanceDenialError) {
            // §12.3 typed not-now mid-batch: requeue the whole batch under a
            // new jobId after the governor's retry hint — the work item
            // stays due, with zero error branding.
            const delay = Math.max(
              error.retryAfterMs ?? GOVERNANCE_REQUEUE_DELAY_MS,
              1_000,
            );
            await this.batchQueue.add('process-keyword-batch', batch, {
              jobId: `${batch.batchId}-gov-${Date.now()}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              delay,
            });
            this.logger.info(
              'Collection batch deferred by governance (requeued)',
              {
                cycleId,
                correlationId: cycleId,
                batchId: batch.batchId,
                subreddit: batch.subreddit,
                requeueDelayMs: delay,
              },
            );
            return {
              batchId: batch.batchId,
              parentJobId: batch.parentJobId,
              collectionType: batch.collectionType,
              success: true,
              metrics: {
                postsProcessed: 0,
                mentionsExtracted: 0,
                entitiesCreated: 0,
                connectionsCreated: 0,
                processingTimeMs: 0,
                llmProcessingTimeMs: 0,
                dbProcessingTimeMs: 0,
              },
              completedAt: new Date(),
              details: {
                warnings: [
                  'governance not-now: batch requeued (typed deferral)',
                ],
              },
            };
          }
          this.logger.error('Collection batch failed', {
            cycleId,
            correlationId: cycleId,
            batchId: batch.batchId,
            collectionType: batch.collectionType,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    );
  }
}
