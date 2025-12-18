import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job, JobCounts } from 'bull';
import { Counter, Gauge, Histogram } from 'prom-client';
import { LoggerService } from '../../../shared';
import { MetricsService } from '../../metrics/metrics.service';

type QueueEntry = {
  name: string;
  queue: Queue;
};

@Injectable()
export class BullQueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private logger!: LoggerService;
  private snapshotTimer?: NodeJS.Timeout;
  private readonly listenerCleanup: Array<() => void> = [];

  private queueDepthGauge!: Gauge<string>;
  private jobCounter!: Counter<string>;
  private jobWaitHistogram!: Histogram<string>;
  private jobProcessingHistogram!: Histogram<string>;

  constructor(
    @InjectQueue('chronological-collection')
    private readonly chronologicalCollectionQueue: Queue,
    @InjectQueue('volume-tracking') private readonly volumeTrackingQueue: Queue,
    @InjectQueue('chronological-batch-processing-queue')
    private readonly chronologicalBatchQueue: Queue,
    @InjectQueue('keyword-batch-processing-queue')
    private readonly keywordBatchQueue: Queue,
    @InjectQueue('keyword-search-execution')
    private readonly keywordSearchExecutionQueue: Queue,
    @InjectQueue('archive-batch-processing-queue')
    private readonly archiveBatchQueue: Queue,
    @InjectQueue('archive-collection')
    private readonly archiveCollectionQueue: Queue,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('BullQueueMetrics');

    this.queueDepthGauge = this.metricsService.getGauge({
      name: 'bull_queue_jobs',
      help: 'Current Bull queue job counts by queue and status',
      labelNames: ['queue', 'status'],
    });

    this.jobCounter = this.metricsService.getCounter({
      name: 'bull_jobs_total',
      help: 'Total Bull jobs completed/failed',
      labelNames: ['queue', 'job_name', 'result'],
    });

    this.jobWaitHistogram = this.metricsService.getHistogram({
      name: 'bull_job_wait_seconds',
      help: 'Time jobs spent waiting before being processed (seconds)',
      labelNames: ['queue', 'job_name'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    });

    this.jobProcessingHistogram = this.metricsService.getHistogram({
      name: 'bull_job_processing_seconds',
      help: 'Time jobs spent processing once active (seconds)',
      labelNames: ['queue', 'job_name', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
    });

    const queues = this.getQueues();
    for (const entry of queues) {
      this.registerQueueListeners(entry);
    }

    void this.snapshotQueueDepth();
    this.snapshotTimer = setInterval(() => {
      void this.snapshotQueueDepth();
    }, 15000);
  }

  onModuleDestroy(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
    for (const cleanup of this.listenerCleanup) {
      cleanup();
    }
    this.listenerCleanup.length = 0;
  }

  private getQueues(): QueueEntry[] {
    return [
      {
        name: 'chronological-collection',
        queue: this.chronologicalCollectionQueue,
      },
      { name: 'volume-tracking', queue: this.volumeTrackingQueue },
      {
        name: 'chronological-batch-processing-queue',
        queue: this.chronologicalBatchQueue,
      },
      { name: 'keyword-batch-processing-queue', queue: this.keywordBatchQueue },
      {
        name: 'keyword-search-execution',
        queue: this.keywordSearchExecutionQueue,
      },
      { name: 'archive-batch-processing-queue', queue: this.archiveBatchQueue },
      { name: 'archive-collection', queue: this.archiveCollectionQueue },
    ];
  }

  private registerQueueListeners(entry: QueueEntry): void {
    const queueName = entry.name;
    const queue = entry.queue;

    const onActive = (job: Job) => {
      const processedOn =
        typeof job.processedOn === 'number' ? job.processedOn : Date.now();
      const createdOn =
        typeof job.timestamp === 'number' ? job.timestamp : processedOn;
      const waitSeconds = Math.max(0, processedOn - createdOn) / 1000;
      this.jobWaitHistogram.observe(
        { queue: queueName, job_name: job.name || 'unknown' },
        waitSeconds,
      );
    };

    const onCompleted = (job: Job) => {
      this.recordJobResult(queueName, job, 'completed');
    };

    const onFailed = (job: Job) => {
      this.recordJobResult(queueName, job, 'failed');
    };

    queue.on('active', onActive);
    queue.on('completed', onCompleted);
    queue.on('failed', onFailed);

    this.listenerCleanup.push(() => {
      queue.off('active', onActive);
      queue.off('completed', onCompleted);
      queue.off('failed', onFailed);
    });
  }

  private recordJobResult(queueName: string, job: Job, result: string): void {
    const jobName = job.name || 'unknown';
    this.jobCounter.inc({ queue: queueName, job_name: jobName, result });

    const processedOn =
      typeof job.processedOn === 'number' ? job.processedOn : undefined;
    const finishedOn =
      typeof job.finishedOn === 'number' ? job.finishedOn : Date.now();
    const base = processedOn ?? finishedOn;
    const processingSeconds = Math.max(0, finishedOn - base) / 1000;
    this.jobProcessingHistogram.observe(
      { queue: queueName, job_name: jobName, result },
      processingSeconds,
    );
  }

  private async snapshotQueueDepth(): Promise<void> {
    const statuses: Array<keyof JobCounts> = [
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    ];

    try {
      const queues = this.getQueues();
      const countsByQueue = await Promise.all(
        queues.map(async (entry) => ({
          queue: entry.name,
          counts: await entry.queue.getJobCounts(),
        })),
      );

      for (const { queue, counts } of countsByQueue) {
        for (const status of statuses) {
          const value = counts[status] ?? 0;
          this.queueDepthGauge.set({ queue, status }, value);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to snapshot Bull queue depth', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
