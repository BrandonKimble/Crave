import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  ArchiveEnqueueOptions,
  ArchiveProcessedFileSummary,
  ArchiveIngestionService,
} from './archive-ingestion.service';

export type ArchiveCollectionTrigger =
  | 'manual'
  | 'test_pipeline'
  | 'backfill'
  | 'migration';

export interface ArchiveCollectionJobData {
  jobId: string;
  subreddit: string;
  triggeredBy?: ArchiveCollectionTrigger;
  options?: ArchiveEnqueueOptions;
}

export interface ArchiveCollectionJobResult {
  success: boolean;
  jobId: string;
  subreddit: string;
  triggeredBy: ArchiveCollectionTrigger;
  batchesEnqueued: number;
  postsQueued: number;
  processingTimeMs: number;
  parentBatchJobId: string;
  filesProcessed: ArchiveProcessedFileSummary[];
  completedAt: Date;
}

@Processor('archive-collection')
@Injectable()
export class ArchiveCollectionWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly archiveIngestionService: ArchiveIngestionService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ArchiveCollectionWorker');
  }

  @Process('execute-archive-collection')
  async processArchiveCollection(
    job: Job<ArchiveCollectionJobData>,
  ): Promise<ArchiveCollectionJobResult> {
    const { subreddit, jobId, options = {}, triggeredBy = 'manual' } = job.data;
    const correlationId = CorrelationUtils.generateCorrelationId();
    const startTime = Date.now();

    this.logger.info('Processing archive collection job', {
      correlationId,
      jobId,
      subreddit,
      triggeredBy,
      options,
    });

    await job.log(
      `Preparing archive collection for r/${subreddit} (triggered by: ${triggeredBy})`,
    );

    try {
      const enqueueResult = await this.archiveIngestionService.enqueueArchiveBatches(
        subreddit,
        options,
      );

      await job.log(
        `Enqueued ${enqueueResult.batchesEnqueued} archive batches (${enqueueResult.postsQueued} posts) with parent batch job ${enqueueResult.parentJobId}`,
      );

      this.logger.info('Archive collection job completed', {
        correlationId,
        jobId,
        subreddit,
        batchesEnqueued: enqueueResult.batchesEnqueued,
        postsQueued: enqueueResult.postsQueued,
        parentBatchJobId: enqueueResult.parentJobId,
      });

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        jobId,
        subreddit,
        triggeredBy,
        batchesEnqueued: enqueueResult.batchesEnqueued,
        postsQueued: enqueueResult.postsQueued,
        processingTimeMs,
        parentBatchJobId: enqueueResult.parentJobId,
        filesProcessed: enqueueResult.filesProcessed,
        completedAt: new Date(),
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Archive collection job failed', error, {
        correlationId,
        jobId,
        subreddit,
      });

      await job.log(`Archive collection failed: ${errorMessage}`);

      throw error instanceof Error ? error : new Error(errorMessage);
    } finally {
      job.progress(100).catch(() => {
        // Ignore progress reporting errors
      });
    }
  }
}
