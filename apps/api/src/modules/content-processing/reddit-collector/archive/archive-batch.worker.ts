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

    this.logger.info('Starting archive batch processing', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
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
      this.logger.info('Archive batch processing completed successfully', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
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

      this.logger.error('Archive batch processing failed', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
        processingTimeMs: processingTime,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        batchId,
        parentJobId,
        collectionType,
        success: false,
        error: errorMessage,
        metrics: {
          postsProcessed: llmPosts.length,
          mentionsExtracted: 0,
          entitiesCreated: 0,
          connectionsCreated: 0,
          processingTimeMs: processingTime,
          llmProcessingTimeMs: 0,
          dbProcessingTimeMs: 0,
        },
        completedAt: new Date(),
        details: {
          warnings: ['Archive batch processing failed prior to persistence'],
        },
      };
    }
  }
}
