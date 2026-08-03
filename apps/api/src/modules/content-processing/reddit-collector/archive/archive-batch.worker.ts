import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import {
  BatchJob,
  BatchProcessingResult,
} from '../batch-processing-queue.types';
import { RedditBatchProcessingService } from '../reddit-batch-processing.service';

@Processor('archive-batch-processing-queue')
@Injectable()
export class ArchiveBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly batchProcessingService: RedditBatchProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ArchiveBatchProcessingWorker');
  }

  @Process({ name: 'process-archive-batch', concurrency: 1 })
  async processArchiveBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();
    const {
      batchId,
      parentJobId,
      collectionType,
      subreddit,
      llmPosts = [],
      batchNumber,
      totalBatches,
    } = job.data;

    if (collectionType !== 'archive') {
      throw new Error(
        `This worker only handles archive batches, got: ${collectionType}`,
      );
    }

    if (!llmPosts.length) {
      throw new Error(
        `Archive batch ${batchId} missing pre-transformed posts for processing`,
      );
    }

    this.logger.info('Collection batch started', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
      collectionType,
      posts: llmPosts.length,
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

      // §12.4 liar purge (F454): this catch used to RETURN {success:false} —
      // Bull marked the job COMPLETED, no retry ran, and the failure vanished
      // into an always-green queue. A failed batch is a REAL job failure.
      // Workers return VERDICTS or THROW; there is no third outcome.
      throw error;
    }
  }
}
