import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';

interface ScheduledEnqueueSummary {
  subreddit: string;
  entityCount: number;
}

@Injectable()
export class KeywordSearchMetricsService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly counters = {
    onDemandEnqueued: 0,
    scheduledEnqueued: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
  };

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordSearchMetrics');
  }

  recordOnDemandEnqueue(options: {
    reasonKey: string;
    subredditCount: number;
    subreddits: string[];
    entityCount: number;
    keywords: string[];
  }): void {
    this.counters.onDemandEnqueued += options.subredditCount;
    this.logger.info('Queued on-demand keyword searches', {
      reasonKey: options.reasonKey,
      subredditCount: options.subredditCount,
      subreddits: options.subreddits,
      entityCount: options.entityCount,
      keywords: options.keywords.slice(0, 10),
      totalOnDemandQueued: this.counters.onDemandEnqueued,
    });
  }

  recordScheduledEnqueue(enqueuedJobs: ScheduledEnqueueSummary[]): void {
    if (!enqueuedJobs.length) {
      return;
    }

    this.counters.scheduledEnqueued += enqueuedJobs.length;
    this.logger.info('Enqueued scheduled keyword searches', {
      totalScheduledJobs: enqueuedJobs.length,
      subreddits: enqueuedJobs.map((job) => job.subreddit),
      totalEntities: enqueuedJobs.reduce(
        (sum, job) => sum + job.entityCount,
        0,
      ),
      cumulativeScheduledJobs: this.counters.scheduledEnqueued,
    });
  }

  recordJobCompletion(options: {
    source: string;
    subreddit: string;
    processedEntities: number;
  }): void {
    this.counters.jobsCompleted += 1;
    this.logger.info('Keyword search job completed', {
      source: options.source,
      subreddit: options.subreddit,
      processedEntities: options.processedEntities,
      jobsCompleted: this.counters.jobsCompleted,
    });
  }

  recordJobFailure(options: {
    source: string;
    subreddit: string;
    error: string;
  }): void {
    this.counters.jobsFailed += 1;
    this.logger.warn('Keyword search job failed', {
      source: options.source,
      subreddit: options.subreddit,
      error: options.error,
      jobsFailed: this.counters.jobsFailed,
    });
  }

  snapshotCounters(): Record<string, number> {
    return { ...this.counters };
  }
}
