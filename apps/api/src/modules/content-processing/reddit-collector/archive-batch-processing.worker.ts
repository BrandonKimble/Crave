import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

/**
 * Archive Batch Processing Worker (Stub)
 *
 * Extensible worker for processing archive collection batches.
 * Stub implementation for future archive processing integration.
 */
@Processor('archive-batch-processing-queue')
@Injectable()
export class ArchiveBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ArchiveBatchProcessingWorker');
  }

  // Concurrency kept at 1 to avoid exceeding LLM rate limits once implemented
  @Process({ name: 'process-archive-batch', concurrency: 1 })
  async processArchiveBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const start = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();
    const {
      batchId,
      collectionType,
      subreddit,
      postIds,
      batchNumber,
      totalBatches,
    } = job.data;

    if (collectionType !== 'archive') {
      return {
        batchId,
        parentJobId: job.data.parentJobId,
        collectionType,
        success: false,
        error: `Unsupported collectionType for this worker, expected 'archive': ${collectionType}`,
        metrics: {
          postsProcessed: 0,
          mentionsExtracted: 0,
          entitiesCreated: 0,
          connectionsCreated: 0,
          processingTimeMs: Date.now() - start,
          llmProcessingTimeMs: 0,
          dbProcessingTimeMs: 0,
        },
        completedAt: new Date(),
      };
    }

    this.logger.info('Stub archive batch received', {
      correlationId,
      batchId,
      subreddit,
      batch: `${batchNumber}/${totalBatches}`,
      posts: postIds.length,
    });

    // PSEUDOCODE for future implementation:
    // 1) Merge Pushshift archive slice + API posts (DataMergeService)
    // 2) Build LLM input, run chunking + LLM (Chronological pipeline reuse)
    // 3) Pass mentions to UnifiedProcessingService.processLLMOutput
    // 4) Return BatchProcessingResult

    return {
      batchId,
      parentJobId: job.data.parentJobId,
      collectionType: 'archive',
      success: false,
      error: 'Archive batch processing not implemented yet',
      metrics: {
        postsProcessed: postIds.length,
        mentionsExtracted: 0,
        entitiesCreated: 0,
        connectionsCreated: 0,
        processingTimeMs: Date.now() - start,
        llmProcessingTimeMs: 0,
        dbProcessingTimeMs: 0,
      },
      completedAt: new Date(),
      details: { warnings: ['Stub worker – no-op execution'] },
    };
  }
}
