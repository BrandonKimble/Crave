import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { MetricsService } from '../../metrics/metrics.service';
import { Counter, Histogram, Gauge } from 'prom-client';
import { JobCounts } from 'bull';

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

  private onDemandCounter!: Counter<string>;
  private onDemandEntitiesHistogram!: Histogram<string>;
  private scheduledCounter!: Counter<string>;
  private scheduledEntitiesHistogram!: Histogram<string>;
  private jobCompletionCounter!: Counter<string>;
  private jobFailureCounter!: Counter<string>;
  private queueDepthGauge!: Gauge<string>;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('KeywordSearchMetrics');
    this.onDemandCounter = this.metricsService.getCounter({
      name: 'keyword_on_demand_enqueues_total',
      help: 'Total on-demand keyword search jobs enqueued',
      labelNames: ['subreddit'],
    });
    this.onDemandEntitiesHistogram = this.metricsService.getHistogram({
      name: 'keyword_on_demand_entity_count',
      help: 'Entity count per on-demand keyword search job',
      labelNames: ['subreddit'],
      buckets: [1, 2, 3, 5, 8, 10],
    });
    this.scheduledCounter = this.metricsService.getCounter({
      name: 'keyword_scheduled_jobs_enqueued_total',
      help: 'Total scheduled keyword search jobs enqueued',
      labelNames: ['subreddit'],
    });
    this.scheduledEntitiesHistogram = this.metricsService.getHistogram({
      name: 'keyword_scheduled_entity_count',
      help: 'Entity count per scheduled keyword search job',
      labelNames: ['subreddit'],
      buckets: [1, 5, 10, 15, 25, 40],
    });
    this.jobCompletionCounter = this.metricsService.getCounter({
      name: 'keyword_jobs_completed_total',
      help: 'Total keyword search jobs completed successfully',
      labelNames: ['source', 'subreddit'],
    });
    this.jobFailureCounter = this.metricsService.getCounter({
      name: 'keyword_jobs_failed_total',
      help: 'Total keyword search jobs that failed',
      labelNames: ['source', 'subreddit'],
    });
    this.queueDepthGauge = this.metricsService.getGauge({
      name: 'keyword_queue_jobs',
      help: 'Current Bull queue job counts by status',
      labelNames: ['queue', 'status'],
    });
  }

  recordOnDemandEnqueue(options: {
    reasonKey: string;
    subredditCount: number;
    subreddits: string[];
    entityCount: number;
    keywords: string[];
  }): void {
    this.counters.onDemandEnqueued += options.subredditCount;

    options.subreddits.forEach((subreddit) => {
      this.onDemandCounter.inc({ subreddit });
      this.onDemandEntitiesHistogram.observe(
        { subreddit },
        options.entityCount,
      );
    });

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

    enqueuedJobs.forEach((job) => {
      this.scheduledCounter.inc({ subreddit: job.subreddit });
      this.scheduledEntitiesHistogram.observe(
        { subreddit: job.subreddit },
        job.entityCount,
      );
    });

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
    this.jobCompletionCounter.inc({
      source: options.source,
      subreddit: options.subreddit,
    });
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
    this.jobFailureCounter.inc({
      source: options.source,
      subreddit: options.subreddit,
    });
    this.logger.warn('Keyword search job failed', {
      source: options.source,
      subreddit: options.subreddit,
      error: { message: options.error },
      jobsFailed: this.counters.jobsFailed,
    });
  }

  snapshotCounters(): Record<string, number> {
    return { ...this.counters };
  }

  recordQueueSnapshot(queue: string, counts: JobCounts): void {
    const statuses: Array<keyof JobCounts> = [
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    ];

    statuses.forEach((status) => {
      const value = counts[status] ?? 0;
      this.queueDepthGauge.set({ queue, status }, value);
    });
  }
}
