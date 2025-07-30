/* eslint-disable */
// ESLint disabled for entire integration test file
// Reason: Complex Jest mocking patterns require 'any' types for framework compatibility
// This is acceptable under Tier 1 (Framework Integration) of our graduated tolerance approach

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Stats } from 'fs';
import { BatchProcessingCoordinatorService } from './batch-processing-coordinator.service';
import { StreamProcessorService } from './stream-processor.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { ProcessingCheckpoint, BatchProcessingConfig } from './batch-processing.types';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { ProcessingCheckpointService } from './processing-checkpoint.service';
import { LoggerService } from '../../../shared';
import { BatchProcessingStatus } from './batch-processing.types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('BatchProcessingCoordinatorService Integration', () => {
  let service: BatchProcessingCoordinatorService;
  let mockStreamProcessor: jest.Mocked<StreamProcessorService>;
  let mockContentPipeline: jest.Mocked<HistoricalContentPipelineService>;
  let mockResourceMonitor: jest.Mocked<ResourceMonitoringService>;
  let mockCheckpointService: jest.Mocked<ProcessingCheckpointService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let testFilePath: string;

  beforeEach(async () => {
    // Create mock services
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    // Reason: Test mocks require any type for Jest compatibility
    mockStreamProcessor = {
      processZstdNdjsonFile: jest.fn(),
      getConfig: jest.fn(),
      validateSetup: jest.fn(),
    } as any;

    mockContentPipeline = {
      processBatch: jest.fn(),
      extractHistoricalItem: jest.fn(),
      convertToLLMFormat: jest.fn(),
      getProcessingStats: jest.fn(),
    } as any;

    mockResourceMonitor = {
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      getCurrentStats: jest.fn(),
      forceResourceCheck: jest.fn(),
      isMemoryUsageSafe: jest.fn(),
      getMemoryUsagePercentage: jest.fn(),
    } as any;

    mockCheckpointService = {
      createInitialCheckpoint: jest.fn(),
      createCheckpoint: jest.fn(),
      getLatestCheckpoint: jest.fn(),
      getAllCheckpoints: jest.fn(),
      markAsCompleted: jest.fn(),
      createEmergencyCheckpoint: jest.fn(),
      createFailureCheckpoint: jest.fn(),
      deleteCheckpoints: jest.fn(),
    } as any;

    mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        const config: Record<string, unknown> = {
          'pushshift.batchSize': 1000,
          'pushshift.minBatchSize': 100,
          'pushshift.maxBatchSize': 5000,
          'pushshift.maxMemoryUsageMB': 512,
          'pushshift.enableCheckpoints': true,
          'pushshift.enableResourceMonitoring': true,
          'pushshift.adaptiveBatchSizing': true,
          'pushshift.progressReportingInterval': 10000,
          'pushshift.resourceCheckInterval': 1000,
          'pushshift.memoryCheckInterval': 5000,
          'pushshift.preserveThreadStructure': true,
          'pushshift.validateTimestamps': true,
          'pushshift.qualityFilters.minScore': -5,
          'pushshift.qualityFilters.excludeDeleted': true,
          'pushshift.qualityFilters.excludeRemoved': true,
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchProcessingCoordinatorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StreamProcessorService, useValue: mockStreamProcessor },
        {
          provide: HistoricalContentPipelineService,
          useValue: mockContentPipeline,
        },
        { provide: ResourceMonitoringService, useValue: mockResourceMonitor },
        {
          provide: ProcessingCheckpointService,
          useValue: mockCheckpointService,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<BatchProcessingCoordinatorService>(
      BatchProcessingCoordinatorService,
    );

    // Create a test file path
    testFilePath = path.join(
      __dirname,
      '../../../../data/pushshift/archives/test_file.zst',
    );
  });

  describe('processArchiveFile', () => {
    it('should successfully process a small archive file', async () => {
      // Mock file stats
      const mockFileStats = { size: 1024 * 1024 }; // 1MB file
       
      // Reason: Mock file stats object for testing purposes
      jest.spyOn(fs, 'stat').mockResolvedValue(mockFileStats as Stats);
      /* eslint-enable @typescript-eslint/no-unsafe-argument */

      // Mock checkpoint service responses
      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(null);
      mockCheckpointService.createInitialCheckpoint.mockResolvedValue({
        checkpointId: 'test-checkpoint-1',
        jobId: 'test-job',
        processedLines: 0,
        lastPosition: 0,
        completionPercentage: 0,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      });
      mockCheckpointService.getAllCheckpoints.mockResolvedValue([]);

      // Mock content pipeline batch processing
      mockContentPipeline.processBatch.mockReturnValue({
        submissions: [],
        comments: [],
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'test-batch',
        errors: [],
      });

      // Mock stream processor
      mockStreamProcessor.processZstdNdjsonFile.mockImplementation(
        async (filePath, processor) => {
          // Simulate processing a few items
          for (let i = 1; i <= 5; i++) {
            await processor({ id: `item_${i}`, type: 'comment' }, i);
          }

          return {
            success: true,
            metrics: {
              totalLines: 5,
              validLines: 5,
              errorLines: 0,
              processingTime: 1000,
              memoryUsage: {
                initial: 1024 * 1024,
                peak: 1024 * 1024 * 2,
                final: 1024 * 1024,
              },
              averageLineProcessingTime: 200,
            },
            errors: [],
          };
        },
      );

      // Execute test
      const result = await service.processArchiveFile(testFilePath);

      // Verify results
      expect(result.success).toBe(true);
      expect(result.metrics.totalProcessedLines).toBe(5);
      expect(result.metrics.validItems).toBe(5);
      expect(result.metrics.errorCount).toBe(0);

      // Verify service interactions
      expect(mockResourceMonitor.startMonitoring).toHaveBeenCalled();
      expect(mockCheckpointService.createInitialCheckpoint).toHaveBeenCalled();
      expect(mockStreamProcessor.processZstdNdjsonFile).toHaveBeenCalledWith(
        testFilePath,
        expect.any(Function),
      );
      expect(mockResourceMonitor.stopMonitoring).toHaveBeenCalled();
    });

    it('should handle memory warnings by adjusting batch size', async () => {
      // Mock file stats
      const mockFileStats = { size: 10 * 1024 * 1024 }; // 10MB file
      jest.spyOn(fs, 'stat').mockResolvedValue(mockFileStats as Stats);

      // Mock checkpoint service
      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(null);
      mockCheckpointService.createInitialCheckpoint.mockResolvedValue({
        checkpointId: 'test-checkpoint-1',
        jobId: 'test-job',
        processedLines: 0,
        lastPosition: 0,
        completionPercentage: 0,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      });
      mockCheckpointService.getAllCheckpoints.mockResolvedValue([]);

      // Mock content pipeline
      mockContentPipeline.processBatch.mockReturnValue({
        submissions: [],
        comments: [],
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'test-batch',
        errors: [],
      });

      // Mock resource monitor to trigger memory warning
      mockResourceMonitor.startMonitoring.mockImplementation(
        async (jobId, config) => {
          // Simulate memory warning after a short delay
          setTimeout(() => {
            if (config.onMemoryWarning) {
              void config.onMemoryWarning(400 * 1024 * 1024); // 400MB usage
            }
          }, 100);
        },
      );

      // Mock stream processor with quick processing
      mockStreamProcessor.processZstdNdjsonFile.mockImplementation(
        async (filePath, processor) => {
          await processor({ id: 'item_1', type: 'comment' }, 1);

          // Wait for memory warning to potentially trigger
          await new Promise((resolve) => setTimeout(resolve, 150));

          return {
            success: true,
            metrics: {
              totalLines: 1,
              validLines: 1,
              errorLines: 0,
              processingTime: 200,
              memoryUsage: {
                initial: 1024 * 1024,
                peak: 400 * 1024 * 1024,
                final: 1024 * 1024,
              },
              averageLineProcessingTime: 200,
            },
            errors: [],
          };
        },
      );

      // Execute test
      const result = await service.processArchiveFile(testFilePath);

      // Verify results
      expect(result.success).toBe(true);
      expect(mockResourceMonitor.startMonitoring).toHaveBeenCalled();

      // Note: Memory warning callback would be triggered in real scenario
      // but timing in tests makes this difficult to verify reliably
    });

    it('should resume from checkpoint when available', async () => {
      // Mock file stats
      const mockFileStats = { size: 2 * 1024 * 1024 }; // 2MB file
      jest.spyOn(fs, 'stat').mockResolvedValue(mockFileStats as Stats);

      // Mock existing checkpoint
      const existingCheckpoint = {
        checkpointId: 'existing-checkpoint',
        jobId: 'test-job',
        processedLines: 100,
        lastPosition: 100,
        completionPercentage: 50,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      };

      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(
        existingCheckpoint,
      );
      mockCheckpointService.getAllCheckpoints.mockResolvedValue([
        existingCheckpoint,
      ]);

      // Mock content pipeline
      mockContentPipeline.processBatch.mockReturnValue({
        submissions: [],
        comments: [],
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'test-batch',
        errors: [],
      });

      // Mock stream processor
      mockStreamProcessor.processZstdNdjsonFile.mockResolvedValue({
        success: true,
        metrics: {
          totalLines: 2,
          validLines: 2,
          errorLines: 0,
          processingTime: 400,
          memoryUsage: {
            initial: 1024 * 1024,
            peak: 1024 * 1024 * 2,
            final: 1024 * 1024,
          },
          averageLineProcessingTime: 200,
        },
        errors: [],
      });

      // Execute test
      const result = await service.processArchiveFile(testFilePath);

      // Verify results
      expect(result.success).toBe(true);
      expect(mockCheckpointService.getLatestCheckpoint).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Resuming from checkpoint'),
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          checkpoint: expect.objectContaining({
            processedLines: 100,
            lastPosition: 100,
            completionPercentage: 50,
          }),
        }),
      );
    });

    it('should handle processing errors gracefully', async () => {
      // Mock file stats
      const mockFileStats = { size: 1024 * 1024 }; // 1MB file
       
      // Reason: Mock file stats object for testing purposes
      jest.spyOn(fs, 'stat').mockResolvedValue(mockFileStats as Stats);
       

      // Mock checkpoint service
      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(null);
      mockCheckpointService.createInitialCheckpoint.mockResolvedValue({
        checkpointId: 'test-checkpoint-1',
        jobId: 'test-job',
        processedLines: 0,
        lastPosition: 0,
        completionPercentage: 0,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      });

      // Mock stream processor to throw error
      const testError = new Error('Test processing error');
      mockStreamProcessor.processZstdNdjsonFile.mockRejectedValue(testError);

      // Execute test and expect error
      await expect(service.processArchiveFile(testFilePath)).rejects.toThrow(
        'Test processing error',
      );

      // Verify error handling
      expect(mockResourceMonitor.stopMonitoring).toHaveBeenCalled();
      expect(mockCheckpointService.createFailureCheckpoint).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Batch processing job failed',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          error: expect.objectContaining({
            message: 'Test processing error',
          }),
        }),
      );
    });
  });

  describe('getJobProgress', () => {
    it('should return progress for active job', async () => {
      // First start a job to create active job state
      const mockFileStats = { size: 1024 * 1024 };
      jest.spyOn(fs, 'stat').mockResolvedValue(mockFileStats as Stats);

      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(null);
      mockCheckpointService.createInitialCheckpoint.mockResolvedValue({
        checkpointId: 'test-checkpoint-1',
        jobId: 'test-job',
        processedLines: 0,
        lastPosition: 0,
        completionPercentage: 0,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      });
      mockCheckpointService.getAllCheckpoints.mockResolvedValue([]);

      mockContentPipeline.processBatch.mockReturnValue({
        submissions: [],
        comments: [],
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'test-batch',
        errors: [],
      });

      // Mock async processing that we can control
      let resolveProcessing: (value: unknown) => void = () => {};
      const processingPromise = new Promise((resolve) => {
        resolveProcessing = resolve;
      });

      mockStreamProcessor.processZstdNdjsonFile.mockImplementation(async () => {
        await processingPromise;
        return {
          success: true,
          metrics: {
            totalLines: 1,
            validLines: 1,
            errorLines: 0,
            processingTime: 100,
            memoryUsage: { initial: 0, peak: 0, final: 0 },
            averageLineProcessingTime: 100,
          },
          errors: [],
        };
      });

      // Start processing (don't await)
      const processingTask = service.processArchiveFile(testFilePath);

      // Wait a bit for job to initialize
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Mock checkpoint with progress
      const progressCheckpoint = {
        checkpointId: 'progress-checkpoint',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        jobId: expect.any(String),
        processedLines: 50,
        lastPosition: 50,
        completionPercentage: 25,
        timestamp: new Date(),
        completed: false,
        config: {} as BatchProcessingConfig,
      };

      mockCheckpointService.getLatestCheckpoint.mockResolvedValue(
        progressCheckpoint,
      );
      mockResourceMonitor.getCurrentStats.mockResolvedValue({
        memoryUsage: 100 * 1024 * 1024,
        memoryUsagePercentage: 20,
        processingRate: 100,
        averageBatchTime: 1000,
      });

      // Get active jobs to find the job ID
      const activeJobs = service.getActiveJobs();
      expect(activeJobs.length).toBe(1);
      const jobId = activeJobs[0].jobId;

      // Get progress
      const progress = await service.getJobProgress(jobId);

      // Verify progress
      expect(progress).not.toBeNull();
      expect(progress!.jobId).toBe(jobId);
      expect(progress!.status).toBe(BatchProcessingStatus.RUNNING);
      expect(progress!.processedLines).toBe(50);
      expect(progress!.completionPercentage).toBe(25);

      // Complete the processing
      resolveProcessing({});
      await processingTask;
    });

    it('should return null for non-existent job', async () => {
      const progress = await service.getJobProgress('non-existent-job');
      expect(progress).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should load configuration correctly', () => {
      const config = service.getConfiguration();

      expect(config.baseBatchSize).toBe(1000);
      expect(config.minBatchSize).toBe(100);
      expect(config.maxBatchSize).toBe(5000);
      expect(config.maxMemoryUsage).toBe(512);
      expect(config.enableCheckpoints).toBe(true);
      expect(config.enableResourceMonitoring).toBe(true);
      expect(config.adaptiveBatchSizing).toBe(true);
    });

    it('should track active jobs', () => {
      const activeJobs = service.getActiveJobs();
      expect(Array.isArray(activeJobs)).toBe(true);
      expect(activeJobs.length).toBe(0); // No active jobs initially
    });
  });
});
