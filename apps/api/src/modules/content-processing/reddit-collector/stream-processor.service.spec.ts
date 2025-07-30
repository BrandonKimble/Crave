import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StreamProcessorService } from './stream-processor.service';
import { LoggerService } from '../../../shared';
// import { StreamProcessorException } from './stream-processor.exceptions';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import * as fs from 'fs/promises';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/unbound-method */
// Reason: Test file with complex mock patterns and test data generation

describe('StreamProcessorService', () => {
  let service: StreamProcessorService;
  let configService: ConfigService;
  let loggerService: LoggerService;
  let zstdDecompressor: SystemZstdDecompressor;

  // Test file paths
  const testDataDir = path.join(__dirname, '../../../../test-data');
  const testZstdFile = path.join(testDataDir, 'test.zst');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamProcessorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                'pushshift.batchSize': 100,
                'pushshift.processingTimeout': 30000,
                'pushshift.validation.enabled': true,
                'pushshift.validation.sampleLines': 5,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: SystemZstdDecompressor,
          useValue: {
            streamDecompressFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StreamProcessorService>(StreamProcessorService);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
    zstdDecompressor = module.get<SystemZstdDecompressor>(
      SystemZstdDecompressor,
    );

    // Create test data directory
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Configuration tests removed as getConfig method no longer exists
  // Configuration is now handled internally in the constructor

  describe('validateSetup', () => {
    it('should validate setup successfully', async () => {
      const result = service.validateSetup();
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect configuration issues', async () => {
      // Mock invalid configuration
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'pushshift.batchSize') return -1;
          if (key === 'pushshift.processingTimeout') return 0;
          return defaultValue;
        });

      // Create new service instance with invalid config
      const mockZstdDecompressor = {
        streamDecompressFile: jest.fn(),
      } as unknown as SystemZstdDecompressor;

      const invalidService = new StreamProcessorService(
        configService,
        loggerService,
        mockZstdDecompressor,
      );
      const result = invalidService.validateSetup();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid batch size configuration');
      expect(result.issues).toContain(
        'Invalid processing timeout configuration',
      );
    });
  });

  describe('processZstdNdjsonFile', () => {
    // beforeEach removed - using mocked SystemZstdDecompressor instead of creating real compressed files

    it('should process valid zstd ndjson file successfully', async () => {
      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      const validator = (data: unknown): data is any => {
        return typeof data === 'object' && data !== null && 'id' in data;
      };

      // Mock SystemZstdDecompressor to simulate processing 3 lines

      const mockStreamDecompressFile =
        zstdDecompressor.streamDecompressFile as jest.MockedFunction<
          typeof zstdDecompressor.streamDecompressFile
        >;
      mockStreamDecompressFile.mockImplementation(
        async (
          filePath: string,
          processorFn: (data: any, lineNumber: number) => Promise<void>,
          options?: any,
        ) => {
          // Simulate processing 3 lines of test data
          await processorFn(
            { id: '1', content: 'test line 1', valid: true },
            1,
          );
          await processorFn(
            { id: '2', content: 'test line 2', valid: true },
            2,
          );
          await processorFn(
            { id: '3', content: 'test line 3', valid: true },
            3,
          );

          return {
            totalLines: 3,
            validLines: 3,
            errorLines: 0,
            processingTime: 100,
            memoryUsage: { initial: 1000, peak: 1500, final: 1200 },
          };
        },
      );

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
        validator,
      );

      expect(result.success).toBe(true);
      expect(result.metrics.totalLines).toBe(3);
      expect(result.metrics.validLines).toBe(3);
      expect(result.metrics.errorLines).toBe(0);
      expect(processedItems).toHaveLength(3);
      expect(processedItems[0].item.id).toBe('1');
      expect(processedItems[1].lineNumber).toBe(2);
    });

    it('should handle validation failures', async () => {
      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      // Validator that rejects all items
      const validator = (data: unknown): data is any => false;

      // Mock SystemZstdDecompressor - validator rejects all, so validLines will be 0

      const mockStreamDecompressFile =
        zstdDecompressor.streamDecompressFile as jest.MockedFunction<
          typeof zstdDecompressor.streamDecompressFile
        >;
      mockStreamDecompressFile.mockImplementation(
        async (
          filePath: string,
          processorFn: (data: any, lineNumber: number) => Promise<void>,
          options?: any,
        ) => {
          // SystemZstdDecompressor will handle validation and not call processor for invalid items
          return {
            totalLines: 3,
            validLines: 0,
            errorLines: 3,
            processingTime: 100,
            memoryUsage: { initial: 1000, peak: 1500, final: 1200 },
          };
        },
      );

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
        validator,
      );

      expect(result.success).toBe(true);
      expect(result.metrics.totalLines).toBe(3);
      expect(result.metrics.validLines).toBe(0);
      expect(result.metrics.errorLines).toBe(3);
      expect(processedItems).toHaveLength(0);
      expect(result.errors).toHaveLength(0); // SystemZstdDecompressor handles errors internally
    });

    it('should handle JSON parse errors', async () => {
      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      // Mock SystemZstdDecompressor to simulate processing with JSON parse errors

      const mockStreamDecompressFile =
        zstdDecompressor.streamDecompressFile as jest.MockedFunction<
          typeof zstdDecompressor.streamDecompressFile
        >;
      mockStreamDecompressFile.mockImplementation(
        async (
          filePath: string,
          processorFn: (data: any, lineNumber: number) => Promise<void>,
          options?: any,
        ) => {
          // Only process the valid JSON line
          await processorFn({ valid: 'json' }, 2);

          return {
            totalLines: 3,
            validLines: 1,
            errorLines: 2,
            processingTime: 100,
            memoryUsage: { initial: 1000, peak: 1500, final: 1200 },
          };
        },
      );

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
      );

      expect(result.success).toBe(true);
      expect(result.metrics.totalLines).toBe(3);
      expect(result.metrics.validLines).toBe(1);
      expect(result.metrics.errorLines).toBe(2);
      expect(processedItems).toHaveLength(1);
      expect(result.errors).toHaveLength(0); // SystemZstdDecompressor handles errors internally
    });

    it('should handle file not found error', async () => {
      const nonExistentFile = path.join(testDataDir, 'nonexistent.zst');
      const processor = async (_item: unknown, _lineNumber: number) => {};

      // Mock SystemZstdDecompressor to throw an error for missing file

      const mockStreamDecompressFile =
        zstdDecompressor.streamDecompressFile as jest.MockedFunction<
          typeof zstdDecompressor.streamDecompressFile
        >;
      mockStreamDecompressFile.mockRejectedValue(new Error('File not found'));

      const result = await service.processZstdNdjsonFile(
        nonExistentFile,
        processor,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Processing failed');
    });

    it.skip('should handle empty files', async () => {
      await fs.writeFile(testZstdFile, Buffer.alloc(0));

      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      // This should throw an error due to invalid zstd format
      await expect(
        service.processZstdNdjsonFile(testZstdFile, processor),
      ).rejects.toThrow();
    });

    it.skip('should process batches correctly', async () => {
      // Create larger test data to test batching
      const testData = Array.from({ length: 250 }, (_, i) => ({
        id: String(i + 1),
        content: `test line ${i + 1}`,
      }));

      const ndjsonData = testData
        .map((item) => JSON.stringify(item))
        .join('\n');
      // const compressedData = await compress(Buffer.from(ndjsonData, 'utf8'));
      // await fs.writeFile(testZstdFile, compressedData);

      const processedItems: any[] = [];
      const batchSizes: number[] = [];
      let currentBatch: any[] = [];

      const processor = async (item: any, lineNumber: number) => {
        currentBatch.push({ item, lineNumber });
        processedItems.push({ item, lineNumber });

        // Track when batches are processed (approximate)
        if (currentBatch.length >= 100) {
          batchSizes.push(currentBatch.length);
          currentBatch = [];
        }
      };

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
      );

      expect(result.success).toBe(true);
      expect(result.metrics.totalLines).toBe(250);
      expect(result.metrics.validLines).toBe(250);
      expect(processedItems).toHaveLength(250);
    });

    it('should track memory usage', async () => {
      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      // Mock SystemZstdDecompressor for memory usage tracking test

      const mockStreamDecompressFile =
        zstdDecompressor.streamDecompressFile as jest.MockedFunction<
          typeof zstdDecompressor.streamDecompressFile
        >;
      mockStreamDecompressFile.mockImplementation(
        async (
          filePath: string,
          processorFn: (data: any, lineNumber: number) => Promise<void>,
          options?: any,
        ) => {
          // Simulate processing a few lines for memory tracking
          await processorFn({ id: '1', content: 'test line 1' }, 1);
          await processorFn({ id: '2', content: 'test line 2' }, 2);

          return {
            totalLines: 2,
            validLines: 2,
            errorLines: 0,
            processingTime: 50,
            memoryUsage: { initial: 1000000, peak: 1500000, final: 1200000 },
          };
        },
      );

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
      );

      expect(result.metrics.memoryUsage.initial).toBeGreaterThan(0);
      expect(result.metrics.memoryUsage.peak).toBeGreaterThanOrEqual(
        result.metrics.memoryUsage.initial,
      );
      expect(result.metrics.memoryUsage.final).toBeGreaterThan(0);
      expect(result.metrics.averageLineProcessingTime).toBeGreaterThanOrEqual(
        0,
      );
    });
  });
});
