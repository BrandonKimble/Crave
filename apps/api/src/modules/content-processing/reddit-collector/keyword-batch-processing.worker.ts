import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';
import { RedditBatchProcessingService } from './reddit-batch-processing.service';

/**
 * Keyword Batch Processing Worker
 *
 * Processes keyword-search collection batches via the shared batch processor.
 *
 * TODO: REFACTOR OPPORTUNITY - Common LLM Processing Pipeline
 * This worker should eventually share steps 2-5 with other collection workers
 * (filter/transform, chunk, LLM processing, UnifiedProcessingService).
 * The key difference: Keyword workers get posts via keyword search APIs and
 * feed into the same LLM pipeline as chronological workers.
 */
@Processor('keyword-batch-processing-queue')
@Injectable()
export class KeywordBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly redditBatchProcessingService: RedditBatchProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordBatchProcessingWorker');
  }

  // Concurrency kept at 1 to avoid exceeding LLM rate limits once implemented
  @Process({ name: 'process-keyword-batch', concurrency: 1 })
  async processKeywordBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const batch = job.data;

    if (batch.collectionType !== 'keyword') {
      return this.buildNoopResult(
        batch,
        0,
        batch.postIds?.length ?? 0,
        'Unsupported collection type',
      );
    }

    this.logger.info('Collection batch started', {
      correlationId,
      batchId: batch.batchId,
      subreddit: batch.subreddit,
      collectionType: batch.collectionType,
      batch: `${batch.batchNumber}/${batch.totalBatches}`,
      posts: batch.postIds?.length ?? 0,
    });

    try {
      const result = await this.redditBatchProcessingService.processBatch(
        batch,
        correlationId,
      );
      this.logger.info('Collection batch completed', {
        correlationId,
        batchId: batch.batchId,
        collectionType: batch.collectionType,
        subreddit: batch.subreddit,
        postsProcessed: result.metrics.postsProcessed,
        mentionsExtracted: result.metrics.mentionsExtracted,
      });
      return result;
    } catch (error) {
      this.logger.error('Collection batch failed', {
        correlationId,
        batchId: batch.batchId,
        collectionType: batch.collectionType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildNoopResult(
    job: BatchJob,
    duration: number,
    postCount: number,
    reason = 'Unsupported collection type',
  ): BatchProcessingResult {
    return {
      batchId: job.batchId,
      parentJobId: job.parentJobId,
      collectionType: job.collectionType,
      success: false,
      error: reason,
      metrics: {
        postsProcessed: postCount,
        mentionsExtracted: 0,
        entitiesCreated: 0,
        connectionsCreated: 0,
        processingTimeMs: duration,
        llmProcessingTimeMs: 0,
        dbProcessingTimeMs: 0,
      },
      completedAt: new Date(),
    };
  }
}
