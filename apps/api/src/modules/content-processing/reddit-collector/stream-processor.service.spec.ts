import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StreamProcessorService } from './stream-processor.service';
import { LoggerService } from '../../../shared';
import { StreamProcessorException } from './stream-processor.exceptions';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { compress } from '@mongodb-js/zstd';

describe('StreamProcessorService', () => {
  let service: StreamProcessorService;
  let configService: ConfigService;
  let loggerService: LoggerService;

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
      ],
    }).compile();

    service = module.get<StreamProcessorService>(StreamProcessorService);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);

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

  describe('configuration', () => {
    it('should load configuration correctly', () => {
      const config = service.getConfig();
      expect(config.batchSize).toBe(100);
      expect(config.processingTimeout).toBe(30000);
      expect(config.validation.enabled).toBe(true);
      expect(config.validation.sampleLines).toBe(5);
    });
  });

  describe('validateSetup', () => {
    it('should validate setup successfully', async () => {
      const result = await service.validateSetup();
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
      const invalidService = new StreamProcessorService(
        configService,
        loggerService,
      );
      const result = await invalidService.validateSetup();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid batch size configuration');
      expect(result.issues).toContain(
        'Invalid processing timeout configuration',
      );
    });
  });

  describe('processZstdNdjsonFile', () => {
    beforeEach(async () => {
      // Create test data
      const testData = [
        { id: '1', content: 'test line 1', valid: true },
        { id: '2', content: 'test line 2', valid: true },
        { id: '3', content: 'test line 3', valid: true },
      ];

      const ndjsonData = testData
        .map((item) => JSON.stringify(item))
        .join('\n');
      const compressedData = await compress(Buffer.from(ndjsonData, 'utf8'));

      await fs.writeFile(testZstdFile, compressedData);
    });

    it('should process valid zstd ndjson file successfully', async () => {
      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      const validator = (data: unknown): data is any => {
        return typeof data === 'object' && data !== null && 'id' in data;
      };

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
      expect(result.errors).toHaveLength(3);
    });

    it('should handle JSON parse errors', async () => {
      // Create file with invalid JSON
      const invalidData =
        'invalid json line\n{"valid": "json"}\nanother invalid line';
      const compressedData = await compress(Buffer.from(invalidData, 'utf8'));
      await fs.writeFile(testZstdFile, compressedData);

      const processedItems: any[] = [];
      const processor = async (item: any, lineNumber: number) => {
        processedItems.push({ item, lineNumber });
      };

      const result = await service.processZstdNdjsonFile(
        testZstdFile,
        processor,
      );

      expect(result.success).toBe(true);
      expect(result.metrics.totalLines).toBe(3);
      expect(result.metrics.validLines).toBe(1);
      expect(result.metrics.errorLines).toBe(2);
      expect(processedItems).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
    });

    it('should handle file not found error', async () => {
      const nonExistentFile = path.join(testDataDir, 'nonexistent.zst');
      const processor = async (item: any, lineNumber: number) => {};

      await expect(
        service.processZstdNdjsonFile(nonExistentFile, processor),
      ).rejects.toThrow(StreamProcessorException);
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
      const compressedData = await compress(Buffer.from(ndjsonData, 'utf8'));
      await fs.writeFile(testZstdFile, compressedData);

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
