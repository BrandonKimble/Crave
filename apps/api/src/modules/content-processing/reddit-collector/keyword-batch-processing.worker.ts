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
 * Keyword Batch Processing Worker (Stub)
 *
 * Extensible worker for processing keyword-search collection batches.
 * Pseudocode only for now – wired for future implementation.
 *
 * TODO: REFACTOR OPPORTUNITY - Common LLM Processing Pipeline
 * Once implemented, this worker will likely share steps 2-5 with other collection
 * workers (filter/transform, chunk, LLM processing, UnifiedProcessingService).
 * The key difference: Keyword workers will get posts via keyword search APIs,
 * then feed into the same LLM pipeline as chronological workers.
 * Consider extracting shared processing method once all workers are complete.
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

    this.logger.info('Processing keyword batch', {
      correlationId,
      batchId: batch.batchId,
      subreddit: batch.subreddit,
      batch: `${batch.batchNumber}/${batch.totalBatches}`,
      posts: batch.postIds?.length ?? 0,
    });

    try {
      const result = await this.redditBatchProcessingService.processBatch(
        batch,
        correlationId,
      );
      return result;
    } catch (error) {
      this.logger.error('Keyword batch processing failed', {
        correlationId,
        batchId: batch.batchId,
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
