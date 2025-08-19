import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';
import { LoggerService } from '../../../shared';

describe('CollectionJobSchedulerService', () => {
  let service: CollectionJobSchedulerService;
  let mockQueue: jest.Mocked<Queue>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockQueueMethods = {
      add: jest.fn(),
      getJob: jest.fn(),
      getJobs: jest.fn(),
      clean: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      empty: jest.fn(),
      close: jest.fn(),
    };

    const mockPrismaMethods = {
      subreddit: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
        CollectionJobSchedulerService,
        {
          provide: getQueueToken('chronological-collection'),
          useValue: mockQueueMethods,
        },
        {
          provide: 'PrismaService',
          useValue: mockPrismaMethods,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('default-value'),
          },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerMethods,
        },
      ],
    }).compile();

    service = module.get<CollectionJobSchedulerService>(
      CollectionJobSchedulerService,
    );
    mockQueue = module.get(getQueueToken('chronological-collection'));
    mockLogger = module.get(LoggerService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize scheduling for configured subreddits on module init', async () => {
      await service.onModuleInit();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing collection job scheduler',
        expect.any(Object),
      );
    });
  });

  describe('scheduleChronologicalCollection', () => {
    it('should schedule chronological collection job successfully', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobId = await service.scheduleChronologicalCollection('austinfood');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-chronological-collection',
        expect.objectContaining({
          subreddit: 'austinfood',
          jobId: expect.stringContaining('chronological-austinfood-'),
          triggeredBy: 'scheduled',
          options: {
            limit: 1000,
            retryCount: 0,
          },
        }),
        expect.objectContaining({
          removeOnComplete: 10,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          delay: 0,
          priority: 0,
          jobId: expect.stringContaining('chronological-austinfood-'),
        }),
      );

      expect(jobId).toMatch(/^chronological-austinfood-\d+$/);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chronological collection job scheduled successfully',
        expect.any(Object),
      );
    });

    it('should handle scheduling failures gracefully', async () => {
      const error = new Error('Queue connection failed');
      mockQueue.add.mockRejectedValue(error);

      await expect(
        service.scheduleChronologicalCollection('austinfood'),
      ).rejects.toThrow('Failed to schedule chronological job');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to schedule chronological collection job',
        expect.any(Object),
      );
    });

    it('should schedule with custom options', async () => {
      const mockJob = { id: 'bull-job-456' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobId = await service.scheduleChronologicalCollection('FoodNYC', {
        delay: 3600000, // 1 hour
        priority: 5,
        triggeredBy: 'manual',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-chronological-collection',
        expect.objectContaining({
          subreddit: 'FoodNYC',
          triggeredBy: 'manual',
        }),
        expect.objectContaining({
          delay: 3600000,
          priority: 5,
        }),
      );
    });
  });

  describe('scheduleManualCollection', () => {
    it('should schedule manual collection with higher priority', async () => {
      const mockJob = { id: 'bull-job-789' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobId = await service.scheduleManualCollection('austinfood', {
        priority: 15,
        limit: 50,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-chronological-collection',
        expect.objectContaining({
          triggeredBy: 'manual',
        }),
        expect.objectContaining({
          priority: 15, // Uses provided priority
        }),
      );
    });
  });

  describe('job status management', () => {
    it('should track scheduled jobs', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobId = await service.scheduleChronologicalCollection('austinfood');
      const scheduledJobs = service.getScheduledJobs();

      expect(scheduledJobs).toHaveLength(1);
      expect(scheduledJobs[0]).toMatchObject({
        jobId,
        jobType: 'chronological',
        subreddit: 'austinfood',
        status: 'scheduled',
        attempts: 0,
      });
    });

    it('should update job status correctly', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const jobId = await service.scheduleChronologicalCollection('austinfood');

      service.updateJobStatus(jobId, 'running', { attempts: 1 });
      const job = service.getJobInfo(jobId);

      expect(job).toMatchObject({
        status: 'running',
        attempts: 1,
      });
    });

    it('should handle unknown job updates gracefully', () => {
      const consoleSpy = jest.spyOn(mockLogger, 'warn');

      service.updateJobStatus('unknown-job', 'running');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to update status for unknown job',
        expect.any(Object),
      );
    });
  });

  describe('job cleanup', () => {
    it('should clean up old completed jobs', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      // Schedule and complete a job
      const jobId = await service.scheduleChronologicalCollection('austinfood');
      service.updateJobStatus(jobId, 'completed');

      // Mock old timestamp
      const scheduledJobs = service.getScheduledJobs();
      scheduledJobs[0].scheduledTime = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ); // 25 hours ago

      const cleanedCount = service.cleanupOldJobs(24);

      expect(cleanedCount).toBe(1);
      expect(service.getScheduledJobs()).toHaveLength(0);
    });

    it('should not clean up recent jobs', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      // Schedule a recent job
      const jobId = await service.scheduleChronologicalCollection('austinfood');
      service.updateJobStatus(jobId, 'completed');

      const cleanedCount = service.cleanupOldJobs(24);

      expect(cleanedCount).toBe(0);
      expect(service.getScheduledJobs()).toHaveLength(1);
    });
  });

  describe('graceful shutdown', () => {
    it('should stop scheduling gracefully', async () => {
      await service.stopScheduling();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopping collection job scheduler',
        expect.any(Object),
      );
    });

    it('should wait for running jobs during shutdown', async () => {
      const mockJob = { id: 'bull-job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      // Schedule and start a job
      const jobId = await service.scheduleChronologicalCollection('austinfood');
      service.updateJobStatus(jobId, 'running');

      // Mock completing the job after a short delay
      setTimeout(() => {
        service.updateJobStatus(jobId, 'completed');
      }, 100);

      await service.stopScheduling();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Waiting for running jobs to complete',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('should handle queue connection errors', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis connection lost'));

      await expect(
        service.scheduleChronologicalCollection('austinfood'),
      ).rejects.toThrow('Failed to schedule chronological job');
    });

    it('should handle invalid subreddit configurations', async () => {
      await expect(
        service.scheduleChronologicalCollection(''),
      ).rejects.toThrow();
    });
  });

  describe('scheduling coordination', () => {
    it('should check for due collections and schedule jobs', async () => {
      mockQueue.add.mockResolvedValue({ id: 'bull-job-123' } as any);

      // Trigger the private checkAndScheduleJobs method via onModuleInit
      await service.onModuleInit();

      // Wait for the async scheduling to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle empty due collections', async () => {
      await service.onModuleInit();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
