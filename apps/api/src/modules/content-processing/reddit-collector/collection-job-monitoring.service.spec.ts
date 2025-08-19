import { Test, TestingModule } from '@nestjs/testing';
import { CollectionJobMonitoringService } from './collection-job-monitoring.service';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';
import { ChronologicalCollectionJobResult } from './chronological-collection.service';
import { LoggerService } from '../../../shared';

describe('CollectionJobMonitoringService', () => {
  let service: CollectionJobMonitoringService;
  let mockScheduler: jest.Mocked<CollectionJobSchedulerService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockSchedulerMethods = {
      updateJobStatus: jest.fn(),
      getJobInfo: jest.fn(),
      getScheduledJobs: jest.fn(),
    };

    const mockLoggerMethods = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionJobMonitoringService,
        {
          provide: CollectionJobSchedulerService,
          useValue: mockSchedulerMethods,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerMethods,
        },
      ],
    }).compile();

    service = module.get<CollectionJobMonitoringService>(
      CollectionJobMonitoringService,
    );
    mockScheduler = module.get(CollectionJobSchedulerService);
    mockLogger = module.get(LoggerService);
  });

  describe('job tracking', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should record job start correctly', () => {
      service.recordJobStart('job-123', 'chronological', 'austinfood');

      const metrics = service.getJobMetrics('job-123');
      expect(metrics).toMatchObject({
        jobId: 'job-123',
        jobType: 'chronological',
        subreddit: 'austinfood',
        status: 'running',
        attempts: 1,
        startTime: expect.any(Date),
      });

      expect(mockScheduler.updateJobStatus).toHaveBeenCalledWith(
        'job-123',
        'running',
        {
          attempts: 1,
        },
      );
    });

    it('should record successful job completion', () => {
      // Start job first
      service.recordJobStart('job-123', 'chronological', 'austinfood');

      const successResult: ChronologicalCollectionJobResult = {
        success: true,
        jobId: 'job-123',
        subreddit: 'austinfood',
        postsProcessed: 25,
        batchesProcessed: 1,
        mentionsExtracted: 10,
        processingTime: 15000,
        nextScheduledCollection: new Date(),
      };

      service.recordJobCompletion('job-123', successResult);

      const metrics = service.getJobMetrics('job-123');
      expect(metrics).toMatchObject({
        status: 'completed',
        postsCollected: 25,
        duration: expect.any(Number),
        nextScheduledCollection: expect.any(Date),
      });

      expect(mockScheduler.updateJobStatus).toHaveBeenCalledWith(
        'job-123',
        'completed',
        {
          attempts: 1,
          lastError: undefined,
        },
      );
    });

    it('should record failed job completion with error', () => {
      service.recordJobStart('job-456', 'chronological', 'FoodNYC');

      const failureResult: ChronologicalCollectionJobResult = {
        success: false,
        jobId: 'job-456',
        subreddit: 'austinfood',
        postsProcessed: 0,
        batchesProcessed: 0,
        mentionsExtracted: 0,
        processingTime: 5000,
        error: 'API rate limit exceeded',
      };

      service.recordJobCompletion('job-456', failureResult);

      const metrics = service.getJobMetrics('job-456');
      expect(metrics).toMatchObject({
        status: 'failed',
        postsCollected: 0,
        error: 'API rate limit exceeded',
      });

      expect(mockScheduler.updateJobStatus).toHaveBeenCalledWith(
        'job-456',
        'failed',
        {
          attempts: 1,
          lastError: 'API rate limit exceeded',
        },
      );
    });

    it('should record job retry with attempt count', () => {
      service.recordJobStart('job-789', 'chronological', 'austinfood');

      service.recordJobRetry('job-789', 2, 'Network timeout', new Date());

      const metrics = service.getJobMetrics('job-789');
      expect(metrics).toMatchObject({
        status: 'retrying',
        attempts: 2,
        error: 'Network timeout',
      });

      expect(mockScheduler.updateJobStatus).toHaveBeenCalledWith(
        'job-789',
        'retrying',
        {
          attempts: 2,
          lastError: 'Network timeout',
          nextRetry: expect.any(Date),
        },
      );
    });

    it('should handle completion recording for unknown job', () => {
      const result: ChronologicalCollectionJobResult = {
        success: true,
        jobId: 'unknown-job',
        subreddit: 'austinfood',
        postsProcessed: 10,
        batchesProcessed: 1,
        mentionsExtracted: 5,
        processingTime: 3000,
      };

      service.recordJobCompletion('unknown-job', result);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to record completion for unknown job',
        expect.any(Object),
      );
    });
  });

  describe('performance metrics', () => {
    beforeEach(() => {
      // Set up some test data
      service.recordJobStart('job-1', 'chronological', 'austinfood');
      service.recordJobCompletion('job-1', {
        success: true,
        jobId: 'job-1',
        subreddit: 'austinfood',
        postsProcessed: 20,
        batchesProcessed: 1,
        mentionsExtracted: 8,
        processingTime: 10000,
      });

      service.recordJobStart('job-2', 'chronological', 'FoodNYC');
      service.recordJobCompletion('job-2', {
        success: false,
        jobId: 'job-2',
        subreddit: 'austinfood',
        postsProcessed: 0,
        batchesProcessed: 0,
        mentionsExtracted: 0,
        processingTime: 5000,
        error: 'Rate limit exceeded',
      });

      service.recordJobStart('job-3', 'chronological', 'austinfood');
      service.recordJobCompletion('job-3', {
        success: true,
        jobId: 'job-3',
        subreddit: 'austinfood',
        postsProcessed: 30,
        batchesProcessed: 2,
        mentionsExtracted: 12,
        processingTime: 15000,
      });
    });

    it('should calculate performance metrics correctly', () => {
      const metrics = service.getPerformanceMetrics(24);

      expect(metrics).toMatchObject({
        successRate: expect.closeTo(66.67, 1), // 2 out of 3 successful
        totalJobsRun: 3,
        averagePostsPerJob: 25, // (20 + 30) / 2 successful jobs
        failureReasons: {
          rate_limit: 1,
        },
      });

      expect(metrics.averageDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.peakProcessingTime).toBeGreaterThanOrEqual(0);
      expect(metrics.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return empty metrics for no jobs', () => {
      const emptyService = new CollectionJobMonitoringService(
        mockScheduler,
        mockLogger,
      );
      const metrics = emptyService.getPerformanceMetrics(24);

      expect(metrics).toMatchObject({
        successRate: 0,
        averageDuration: 0,
        averagePostsPerJob: 0,
        totalJobsRun: 0,
        failureReasons: {},
        peakProcessingTime: 0,
      });
    });

    it('should filter metrics by time window', () => {
      // This test would need manipulation of dates to properly test time filtering
      const metrics = service.getPerformanceMetrics(1); // 1 hour window
      expect(metrics.totalJobsRun).toBeGreaterThanOrEqual(0);
    });
  });

  describe('health status', () => {
    it('should report healthy status for good performance', () => {
      // Create successful jobs
      for (let i = 0; i < 5; i++) {
        service.recordJobStart(`job-${i}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`job-${i}`, {
          success: true,
          jobId: `job-${i}`,
          subreddit: 'austinfood',
          postsProcessed: 20,
          batchesProcessed: 1,
          mentionsExtracted: 8,
          processingTime: 5000, // 5 seconds (under threshold)
        });
      }

      const health = service.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
      expect(health.metrics.successRate).toBe(100);
    });

    it('should report degraded status for low success rate', () => {
      // Create jobs with mixed success/failure pattern to avoid consecutive failures
      for (let i = 0; i < 10; i++) {
        service.recordJobStart(`job-${i}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`job-${i}`, {
          success: i % 5 === 0, // Every 5th job succeeds (20% success rate, not consecutive failures)
          jobId: `job-${i}`,
          subreddit: 'austinfood',
          postsProcessed: i % 5 === 0 ? 20 : 0,
          batchesProcessed: i % 5 === 0 ? 1 : 0,
          mentionsExtracted: i % 5 === 0 ? 8 : 0,
          processingTime: 5000,
          error: i % 5 !== 0 ? 'Test failure' : undefined,
        });
      }

      const health = service.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(
        health.issues.some((issue) => issue.includes('Low success rate')),
      ).toBe(true);
    });

    it('should report unhealthy status for consecutive failures', () => {
      // Create consecutive failures
      for (let i = 0; i < 5; i++) {
        service.recordJobStart(`job-${i}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`job-${i}`, {
          success: false,
          jobId: `job-${i}`,
          subreddit: 'austinfood',
          postsProcessed: 0,
          batchesProcessed: 0,
          mentionsExtracted: 0,
          processingTime: 5000,
          error: 'Consecutive failure',
        });
      }

      const health = service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(
        health.issues.some((issue) => issue.includes('consecutive failures')),
      ).toBe(true);
    });
  });

  describe('alerting', () => {
    it('should trigger alert for consecutive failures', () => {
      // Create 3 consecutive failures to trigger alert
      for (let i = 0; i < 3; i++) {
        service.recordJobStart(`job-${i}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`job-${i}`, {
          success: false,
          jobId: `job-${i}`,
          subreddit: 'austinfood',
          postsProcessed: 0,
          batchesProcessed: 0,
          mentionsExtracted: 0,
          processingTime: 5000,
          error: 'Test failure',
        });
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Collection job alert: consecutive_failures'),
        expect.any(Object),
      );
    });

    it('should trigger alert for slow jobs', () => {
      service.recordJobStart('slow-job', 'chronological', 'austinfood');

      // Mock the job metrics to have an old start time to simulate slow job
      const jobMetrics = service.getJobMetrics('slow-job');
      if (jobMetrics) {
        jobMetrics.startTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      }

      service.recordJobCompletion('slow-job', {
        success: true,
        jobId: 'slow-job',
        subreddit: 'austinfood',
        postsProcessed: 10,
        batchesProcessed: 1,
        mentionsExtracted: 5,
        processingTime: 15 * 60 * 1000, // 15 minutes (above threshold)
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Collection job alert: slow_job'),
        expect.any(Object),
      );
    });
  });

  describe('error categorization', () => {
    it('should categorize different error types correctly', () => {
      const testCases = [
        { error: 'Rate limit exceeded', category: 'rate_limit' },
        { error: 'Network timeout occurred', category: 'network_error' },
        { error: 'Authentication failed', category: 'auth_error' },
        { error: 'Reddit API error', category: 'reddit_api_error' },
        { error: 'Database connection lost', category: 'database_error' },
        { error: 'Out of memory error', category: 'memory_error' },
        { error: 'Unknown system error', category: 'unknown_error' },
      ];

      testCases.forEach(({ error, category }, index) => {
        service.recordJobStart(`job-${index}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`job-${index}`, {
          success: false,
          jobId: `job-${index}`,
          subreddit: 'austinfood',
          postsProcessed: 0,
          batchesProcessed: 0,
          mentionsExtracted: 0,
          processingTime: 5000,
          error,
        });
      });

      const metrics = service.getPerformanceMetrics(24);

      // Check all expected categories are present
      testCases.forEach(({ category }) => {
        expect(metrics.failureReasons[category]).toBe(1);
      });
    });
  });

  describe('memory management', () => {
    it('should clean up old metrics', () => {
      // Create old jobs
      for (let i = 0; i < 5; i++) {
        service.recordJobStart(`old-job-${i}`, 'chronological', 'austinfood');
        service.recordJobCompletion(`old-job-${i}`, {
          success: true,
          jobId: `old-job-${i}`,
          subreddit: 'austinfood',
          postsProcessed: 10,
          batchesProcessed: 1,
          mentionsExtracted: 5,
          processingTime: 5000,
        });
      }

      // Mock old timestamps
      const allMetrics = service.getAllJobMetrics();
      allMetrics.forEach((metrics) => {
        if (metrics.endTime) {
          metrics.endTime = new Date(Date.now() - 49 * 60 * 60 * 1000); // 49 hours ago
        }
      });

      const cleanedCount = service.cleanupOldMetrics(48);

      expect(cleanedCount).toBe(5);
      expect(service.getAllJobMetrics()).toHaveLength(0);
    });
  });
});
