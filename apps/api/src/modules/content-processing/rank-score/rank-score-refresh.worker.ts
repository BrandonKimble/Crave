import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../../shared';
import { RankScoreService } from './rank-score.service';
import { RankScoreRefreshJobData } from './rank-score-refresh.types';

const JOB_NAME = 'refresh-rank-scores';

@Processor('rank-score-refresh')
export class RankScoreRefreshWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly rankScoreService: RankScoreService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RankScoreRefreshWorker');
  }

  @Process(JOB_NAME)
  async handleRefresh(job: Job<RankScoreRefreshJobData>): Promise<void> {
    const locationKey = job.data?.locationKey?.trim().toLowerCase();
    if (!locationKey) {
      this.logger.warn('Rank score refresh job missing location key', {
        jobId: job.id,
        data: job.data,
      });
      return;
    }

    this.logger.info('Processing rank score refresh', {
      jobId: job.id,
      locationKey,
      source: job.data?.source,
    });

    await this.rankScoreService.refreshRankScoresForLocations([locationKey]);
  }
}
