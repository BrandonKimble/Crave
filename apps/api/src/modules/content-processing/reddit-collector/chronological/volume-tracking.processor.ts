import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { OnModuleInit, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import { SubredditVolumeTrackingService } from './subreddit-volume-tracking.service';

export interface VolumeTrackingJobData {
  jobId: string;
  triggeredBy: 'scheduled' | 'manual';
  sampleDays?: number;
}

export interface VolumeTrackingJobResult {
  success: boolean;
  jobId: string;
  subredditsProcessed: number;
  totalVolumesCalculated: number;
  processingTime: number;
  errors?: string[];
}

/**
 * Volume Tracking Processor
 *
 * Bull queue processor for calculating subreddit posting volumes.
 * Designed to run on schedule (daily/weekly) to keep volume data fresh.
 *
 * Key responsibilities:
 * - Process all active subreddits from database
 * - Calculate actual posting volumes from Reddit API
 * - Store results in database for use by collection scheduler
 * - Handle rate limiting and retry logic
 * - Provide comprehensive error handling and logging
 */
@Processor('volume-tracking')
export class VolumeTrackingProcessor implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('VolumeTrackingProcessor');
  }

  /**
   * Process volume tracking job
   * Calculates volumes for all active subreddits
   */
  @Process('calculate-volumes')
  async processVolumeCalculation(
    job: Job<VolumeTrackingJobData>,
  ): Promise<VolumeTrackingJobResult> {
    const startTime = Date.now();
    const { jobId, triggeredBy, sampleDays = 30 } = job.data;

    this.logger.info('Starting volume tracking job', {
      correlationId: CorrelationUtils.generateCorrelationId(),
      jobId,
      triggeredBy,
      sampleDays,
    });

    try {
      // Get volume tracking service from DI container
      const volumeTrackingService = this.moduleRef.get(
        SubredditVolumeTrackingService,
        { strict: false },
      );

      if (!volumeTrackingService) {
        throw new Error('SubredditVolumeTrackingService not available');
      }

      // Calculate volumes for all active subreddits
      const volumes =
        await volumeTrackingService.calculateAllActiveVolumes(sampleDays);

      const result: VolumeTrackingJobResult = {
        success: true,
        jobId,
        subredditsProcessed: volumes.length,
        totalVolumesCalculated: volumes.length,
        processingTime: Date.now() - startTime,
      };

      this.logger.info('Volume tracking job completed successfully', {
        jobId,
        subredditsProcessed: result.subredditsProcessed,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Volume tracking job failed', {
        jobId,
        error: errorMessage,
        processingTime: Date.now() - startTime,
      });

      const result: VolumeTrackingJobResult = {
        success: false,
        jobId,
        subredditsProcessed: 0,
        totalVolumesCalculated: 0,
        processingTime: Date.now() - startTime,
        errors: [errorMessage],
      };

      return result;
    }
  }
}
