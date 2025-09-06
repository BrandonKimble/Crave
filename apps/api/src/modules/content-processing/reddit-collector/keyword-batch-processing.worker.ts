import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

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
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordBatchProcessingWorker');
  }

  // Concurrency kept at 1 to avoid exceeding LLM rate limits once implemented
  @Process({ name: 'process-keyword-batch', concurrency: 1 })
  async processKeywordBatch(
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

    if (collectionType !== 'keyword') {
      return {
        batchId,
        parentJobId: job.data.parentJobId,
        collectionType,
        success: false,
        error: `Unsupported collectionType for this worker: ${collectionType}`,
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

    this.logger.info('Stub keyword batch received', {
      correlationId,
      batchId,
      subreddit,
      batch: `${batchNumber}/${totalBatches}`,
      posts: postIds.length,
    });

    // PSEUDOCODE for future implementation:
    // 1) Retrieve full content for postIds (ContentRetrievalPipelineService)
    // 2) Chunk + run LLM (LLMChunkingService + LLMConcurrentProcessingService)
    // 3) Pass mentions to UnifiedProcessingService.processLLMOutput
    // 4) Return BatchProcessingResult

    return {
      batchId,
      parentJobId: job.data.parentJobId,
      collectionType: 'keyword',
      success: false,
      error: 'Keyword batch processing not implemented yet',
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
