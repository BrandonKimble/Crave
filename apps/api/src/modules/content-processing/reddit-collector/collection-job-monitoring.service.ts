import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { ChronologicalCollectionJobResult } from './chronological-collection.service';
import {
  ScheduledJobInfo,
  CollectionJobSchedulerService,
} from './collection-job-scheduler.service';
import { ScheduledCollectionExceptionFactory } from './scheduled-collection.exceptions';

export interface JobMetrics {
  jobId: string;
  jobType: 'chronological' | 'keyword-search';
  subreddit: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in milliseconds
  status: 'running' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  postsCollected?: number;
  error?: string;
  nextScheduledCollection?: Date;
}

export interface PerformanceMetrics {
  successRate: number; // percentage
  averageDuration: number; // in milliseconds
  averagePostsPerJob: number;
  totalJobsRun: number;
  failureReasons: Record<string, number>;
  peakProcessingTime: number;
  lastUpdated: Date;
}

export interface AlertConfig {
  enabled: boolean;
  failureThreshold: number; // consecutive failures before alert
  successRateThreshold: number; // minimum success rate percentage
  responseTimeThreshold: number; // maximum response time in ms
  alertCooldownMs: number; // minimum time between similar alerts
}

/**
 * Collection Job Monitoring Service
 *
 * Implements PRD Section 5.1.2: Job monitoring and alerting for collection job failures.
 * Tracks success rates, failure patterns, performance metrics, and provides alerting
 * capabilities for reliable data collection operations.
 *
 * Key responsibilities:
 * - Track job success rates and failure patterns
 * - Monitor collection performance and processing times
 * - Provide alerting for job failures and performance degradation
 * - Generate monitoring reports and health checks
 * - Track API usage patterns and rate limiting
 * - Monitor data collection continuity
 */
@Injectable()
export class CollectionJobMonitoringService implements OnModuleInit {
  private logger!: LoggerService;
  private jobMetrics = new Map<string, JobMetrics>();
  private performanceHistory: JobMetrics[] = [];
  private lastAlerts = new Map<string, Date>();

  // Default alert configuration
  private readonly alertConfig: AlertConfig = {
    enabled: true,
    failureThreshold: 3, // Alert after 3 consecutive failures
    successRateThreshold: 80, // Alert if success rate falls below 80%
    responseTimeThreshold: 10 * 60 * 1000, // Alert if job takes more than 10 minutes
    alertCooldownMs: 60 * 60 * 1000, // 1 hour cooldown between similar alerts
  };

  constructor(
    private readonly jobScheduler: CollectionJobSchedulerService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('CollectionJobMonitoring');
  }

  /**
   * Record job start
   */
  recordJobStart(
    jobId: string,
    jobType: 'chronological' | 'keyword-search',
    subreddit: string,
  ): void {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.debug('Recording job start', {
      correlationId,
      operation: 'record_job_start',
      jobId,
      jobType,
      subreddit,
    });

    const metrics: JobMetrics = {
      jobId,
      jobType,
      subreddit,
      startTime: new Date(),
      status: 'running',
      attempts: 1,
    };

    this.jobMetrics.set(jobId, metrics);

    // Update scheduler job status
    this.jobScheduler.updateJobStatus(jobId, 'running', { attempts: 1 });
  }

  /**
   * Record job completion
   */
  recordJobCompletion(
    jobId: string,
    result: ChronologicalCollectionJobResult,
  ): void {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const metrics = this.jobMetrics.get(jobId);

    if (!metrics) {
      this.logger.warn('Attempted to record completion for unknown job', {
        correlationId,
        jobId,
        result: {
          success: result.success,
          postsProcessed: result.postsProcessed,
          processingTime: result.processingTime,
        },
      });
      return;
    }

    // Update metrics
    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.status = result.success ? 'completed' : 'failed';
    metrics.postsCollected = result.postsProcessed;
    metrics.error = result.error;
    metrics.nextScheduledCollection = result.nextScheduledCollection;

    this.jobMetrics.set(jobId, metrics);

    // Add to performance history
    this.performanceHistory.push({ ...metrics });

    // Keep only last 1000 entries for performance
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }

    // Update scheduler job status
    this.jobScheduler.updateJobStatus(
      jobId,
      result.success ? 'completed' : 'failed',
      {
        attempts: metrics.attempts,
        lastError: result.error,
      },
    );

    this.logger.info('Job completion recorded', {
      correlationId,
      jobId,
      success: result.success,
      duration: metrics.duration,
      postsCollected: metrics.postsCollected,
      errorMessage: result.error || undefined,
    });

    // Check for alerting conditions
    this.checkAlertConditions(metrics);
  }

  /**
   * Record job retry
   */
  recordJobRetry(
    jobId: string,
    attemptNumber: number,
    error: string,
    nextRetryTime?: Date,
  ): void {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const metrics = this.jobMetrics.get(jobId);

    if (!metrics) {
      this.logger.warn('Attempted to record retry for unknown job', {
        correlationId,
        jobId,
        attemptNumber,
        errorMessage: String(error),
      });
      return;
    }

    metrics.attempts = attemptNumber;
    metrics.status = 'retrying';
    metrics.error = error;

    this.jobMetrics.set(jobId, metrics);

    // Update scheduler job status
    this.jobScheduler.updateJobStatus(jobId, 'retrying', {
      attempts: attemptNumber,
      lastError: error,
      nextRetry: nextRetryTime,
    });

    this.logger.info('Job retry recorded', {
      correlationId,
      jobId,
      attemptNumber,
      errorMessage: String(error),
      nextRetryTime,
    });
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(timeWindowHours = 24): PerformanceMetrics {
    const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
    const recentJobs = this.performanceHistory.filter(
      (job) => job.endTime && job.endTime > cutoffTime,
    );

    if (recentJobs.length === 0) {
      return {
        successRate: 0,
        averageDuration: 0,
        averagePostsPerJob: 0,
        totalJobsRun: 0,
        failureReasons: {},
        peakProcessingTime: 0,
        lastUpdated: new Date(),
      };
    }

    const successfulJobs = recentJobs.filter(
      (job) => job.status === 'completed',
    );
    const successRate = (successfulJobs.length / recentJobs.length) * 100;

    const totalDuration = recentJobs
      .filter((job) => job.duration)
      .reduce((sum, job) => sum + (job.duration || 0), 0);
    const averageDuration = totalDuration / recentJobs.length;

    const totalPosts = successfulJobs
      .filter((job) => job.postsCollected)
      .reduce((sum, job) => sum + (job.postsCollected || 0), 0);
    const averagePostsPerJob =
      successfulJobs.length > 0 ? totalPosts / successfulJobs.length : 0;

    const failureReasons: Record<string, number> = {};
    recentJobs
      .filter((job) => job.status === 'failed' && job.error)
      .forEach((job) => {
        const errorKey = this.categorizeError(job.error!);
        failureReasons[errorKey] = (failureReasons[errorKey] || 0) + 1;
      });

    const peakProcessingTime = Math.max(
      ...recentJobs.map((job) => job.duration || 0),
      0,
    );

    return {
      successRate,
      averageDuration,
      averagePostsPerJob,
      totalJobsRun: recentJobs.length,
      failureReasons,
      peakProcessingTime,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get job metrics by ID
   */
  getJobMetrics(jobId: string): JobMetrics | undefined {
    return this.jobMetrics.get(jobId);
  }

  /**
   * Get all current job metrics
   */
  getAllJobMetrics(): JobMetrics[] {
    return Array.from(this.jobMetrics.values());
  }

  /**
   * Get health status of collection jobs
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: PerformanceMetrics;
    issues: string[];
    runningJobs: number;
  } {
    const metrics = this.getPerformanceMetrics();
    const runningJobs = Array.from(this.jobMetrics.values()).filter(
      (job) => job.status === 'running',
    ).length;

    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check success rate
    if (metrics.successRate < this.alertConfig.successRateThreshold) {
      issues.push(`Low success rate: ${metrics.successRate.toFixed(1)}%`);
      status = 'degraded';
    }

    // Check response time
    if (metrics.averageDuration > this.alertConfig.responseTimeThreshold) {
      issues.push(
        `High response time: ${(metrics.averageDuration / 1000).toFixed(1)}s`,
      );
      status = 'degraded';
    }

    // Check for consecutive failures
    const recentFailures = this.getConsecutiveFailures();
    if (recentFailures >= this.alertConfig.failureThreshold) {
      issues.push(`${recentFailures} consecutive failures`);
      status = 'unhealthy';
    }

    // Check for stalled jobs
    const stalledJobs = this.detectStalledJobs();
    if (stalledJobs.length > 0) {
      issues.push(`${stalledJobs.length} stalled jobs detected`);
      if (stalledJobs.length > 2) {
        status = 'unhealthy';
      } else {
        status = 'degraded';
      }
    }

    return {
      status,
      metrics,
      issues,
      runningJobs,
    };
  }

  /**
   * Check for alerting conditions
   */
  private checkAlertConditions(metrics: JobMetrics): void {
    const correlationId = CorrelationUtils.generateCorrelationId();

    // Check for failure alerts
    if (metrics.status === 'failed') {
      const consecutiveFailures = this.getConsecutiveFailures();

      if (consecutiveFailures >= this.alertConfig.failureThreshold) {
        this.triggerAlert('consecutive_failures', {
          consecutiveFailures,
          lastJobId: metrics.jobId,
          lastError: metrics.error,
        });
      }
    }

    // Check for performance alerts
    if (
      metrics.duration &&
      metrics.duration > this.alertConfig.responseTimeThreshold
    ) {
      this.triggerAlert('slow_job', {
        jobId: metrics.jobId,
        duration: metrics.duration,
        threshold: this.alertConfig.responseTimeThreshold,
      });
    }

    // Check overall success rate
    const performanceMetrics = this.getPerformanceMetrics(1); // Last 1 hour
    if (
      performanceMetrics.successRate < this.alertConfig.successRateThreshold
    ) {
      this.triggerAlert('low_success_rate', {
        successRate: performanceMetrics.successRate,
        threshold: this.alertConfig.successRateThreshold,
        timeWindow: '1 hour',
      });
    }
  }

  /**
   * Trigger an alert (with cooldown)
   */
  private triggerAlert(alertType: string, context: Record<string, any>): void {
    const now = new Date();
    const lastAlert = this.lastAlerts.get(alertType);

    // Check cooldown
    if (
      lastAlert &&
      now.getTime() - lastAlert.getTime() < this.alertConfig.alertCooldownMs
    ) {
      return; // Still in cooldown period
    }

    this.lastAlerts.set(alertType, now);

    try {
      this.logger.error(`Collection job alert: ${alertType}`, {
        correlationId: CorrelationUtils.generateCorrelationId(),
        operation: 'job_alert',
        alertType,
        context,
        timestamp: now,
      });

      // Here we could integrate with external alerting systems:
      // - Send to Slack/Discord webhooks
      // - Send email notifications
      // - Update monitoring dashboards
      // - Create support tickets
      // - Send to PagerDuty/Opsgenie
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Failed to send alert', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        alertType,
        error: errorMessage,
        context,
      });

      throw ScheduledCollectionExceptionFactory.alertingFailed(
        alertType,
        errorMessage,
      );
    }
  }

  /**
   * Get number of consecutive failures
   */
  private getConsecutiveFailures(): number {
    const recentJobs = this.performanceHistory
      .slice(-10) // Last 10 jobs
      .filter((job) => job.endTime)
      .sort(
        (a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0),
      );

    let consecutiveFailures = 0;
    for (const job of recentJobs) {
      if (job.status === 'failed') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    return consecutiveFailures;
  }

  /**
   * Detect stalled jobs (running for too long)
   */
  private detectStalledJobs(maxRuntimeMinutes = 30): JobMetrics[] {
    const now = new Date();
    const maxRuntime = maxRuntimeMinutes * 60 * 1000;

    return Array.from(this.jobMetrics.values()).filter((job) => {
      if (job.status !== 'running') return false;

      const runtime = now.getTime() - job.startTime.getTime();
      return runtime > maxRuntime;
    });
  }

  /**
   * Categorize error for failure tracking
   */
  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('rate limit')) return 'rate_limit';
    if (lowerError.includes('network') || lowerError.includes('timeout'))
      return 'network_error';
    if (
      lowerError.includes('authentication') ||
      lowerError.includes('unauthorized')
    )
      return 'auth_error';
    if (lowerError.includes('reddit')) return 'reddit_api_error';
    if (lowerError.includes('database') || lowerError.includes('prisma'))
      return 'database_error';
    if (lowerError.includes('memory') || lowerError.includes('out of memory'))
      return 'memory_error';

    return 'unknown_error';
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  cleanupOldMetrics(retentionHours = 48): number {
    const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    // Clean up job metrics
    for (const [jobId, metrics] of this.jobMetrics.entries()) {
      if (
        metrics.endTime &&
        metrics.endTime < cutoffTime &&
        ['completed', 'failed'].includes(metrics.status)
      ) {
        this.jobMetrics.delete(jobId);
        cleanedCount++;
      }
    }

    // Clean up performance history
    this.performanceHistory = this.performanceHistory.filter(
      (job) => !job.endTime || job.endTime > cutoffTime,
    );

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up old job metrics', {
        correlationId: CorrelationUtils.generateCorrelationId(),
        operation: 'cleanup_metrics',
        cleanedCount,
        retentionHours,
      });
    }

    return cleanedCount;
  }
}
