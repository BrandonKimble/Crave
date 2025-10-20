import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditBatchProcessingService } from './reddit-batch-processing.service';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

@Processor('chronological-batch-processing-queue')
@Injectable()
export class ChronologicalBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly batchProcessingService: RedditBatchProcessingService,
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

    this.logger.info('Starting chronological batch processing', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
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
      this.logger.info(
        'Chronological batch processing completed successfully',
        {
          correlationId,
          batchId,
          parentJobId,
          subreddit,
          processingTimeMs: processingTime,
          mentionsExtracted: result.metrics.mentionsExtracted,
          entitiesCreated: result.metrics.entitiesCreated,
          connectionsCreated: result.metrics.connectionsCreated,
        },
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Chronological batch processing failed', {
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
          postsProcessed: postIds.length,
          mentionsExtracted: 0,
          entitiesCreated: 0,
          connectionsCreated: 0,
          processingTimeMs: processingTime,
          llmProcessingTimeMs: 0,
          dbProcessingTimeMs: 0,
        },
        completedAt: new Date(),
      };
    }
  }
}
