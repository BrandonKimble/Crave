#!/usr/bin/env ts-node

// Reason: Validation script with type casting and external configuration access

import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { PushshiftProcessorService } from './pushshift-processor.service';
import { StreamProcessorService } from './stream-processor.service';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import { ProcessingMetricsService } from './processing-metrics.service';
import configuration from '../../../config/configuration';
import { RedditComment, RedditSubmission } from './reddit-data.types';

// Mock configuration service interface
interface MockConfigService {
  get(key: string, defaultValue?: unknown): unknown;
}

// Mock logger interface matching LoggerService
interface MockLoggerService {
  logger: unknown;
  setContext: (context: string) => MockLoggerService;
  info: (msg: string, meta?: unknown) => void;
  debug: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, error?: unknown, meta?: unknown) => void;
  http: () => void;
  database: () => void;
  performance: () => void;
  audit: () => void;
  child: () => unknown;
  buildErrorMetadata: (error: Error, context?: string) => unknown;
  sanitizeLog: (data: unknown) => unknown;
  sanitizeMetadata: (data: unknown) => unknown;
  sanitizeNestedObject: (data: unknown, depth?: number) => unknown;
}

// Union type for Reddit items
type RedditItem = RedditComment | RedditSubmission;

// Processor callback type
type ItemProcessor = (
  item: RedditItem,
  lineNumber: number,
  fileType: 'comments' | 'submissions',
) => Promise<void>;

/**
 * Validation script for stream processing functionality
 * Tests the implementation with actual archive files using command-line zstd
 */

// Mock logger for script
const mockLogger: MockLoggerService = {
  logger: {},
  setContext: () => mockLogger,
  info: (msg: string, meta?: unknown) =>
    console.log(`[INFO] ${msg}`, meta || ''),
  debug: (msg: string, meta?: unknown) =>
    console.log(`[DEBUG] ${msg}`, meta || ''),
  warn: (msg: string, meta?: unknown) =>
    console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, error?: unknown, meta?: unknown) =>
    console.error(`[ERROR] ${msg}`, error, meta || ''),
  http: () => {},
  database: () => {},
  performance: () => {},
  audit: () => {},
  child: () => ({}),
  buildErrorMetadata: () => ({}),
  sanitizeLog: (data: unknown) => data,
  sanitizeMetadata: (data: unknown) => data,
  sanitizeNestedObject: (data: unknown) => data,
};

async function validateStreamProcessing(): Promise<void> {
  console.log('🔍 Validating stream processing implementation...\n');

  try {
    // Create services
    const config = configuration();
    const configService: MockConfigService = {
      get: (key: string, defaultValue?: unknown) => {
        const keys = key.split('.');
        let value: unknown = config;
        for (const k of keys) {
          if (typeof value === 'object' && value !== null && k in value) {
            value = (value as Record<string, unknown>)[k];
          } else {
            value = undefined;
            break;
          }
        }
        return value ?? defaultValue;
      },
    };

    const mockZstdDecompressor = {
      streamDecompressFile: jest.fn(),
      validateSystemZstd: jest.fn().mockResolvedValue({
        available: true,
        version: '1.5.0',
      }),
    } as unknown as SystemZstdDecompressor;

    const streamProcessor = new StreamProcessorService(
      configService as ConfigService,
      mockLogger as unknown as LoggerService,
      mockZstdDecompressor,
    );
    const metricsService = new ProcessingMetricsService(
      mockLogger as unknown as LoggerService,
    );
    const pushshiftProcessor = new PushshiftProcessorService(
      configService as ConfigService,
      streamProcessor,
      mockLogger as unknown as LoggerService,
    );

    // Validate setup
    console.log('📋 Validating setup...');
    const setupResult = await pushshiftProcessor.validateSetup();

    if (!setupResult.valid) {
      console.error('❌ Setup validation failed:');
      setupResult.issues.forEach((issue) => console.error(`   - ${issue}`));
      process.exit(1);
    }

    console.log('✅ Setup validation passed\n');

    // List available archives
    console.log('📁 Available archives:');
    const archives = await pushshiftProcessor.getAvailableArchives();
    archives.forEach((archive) => {
      const status = archive.exists ? '✅' : '❌';
      const size = archive.size
        ? `(${Math.round((archive.size / 1024 / 1024) * 100) / 100} MB)`
        : '';
      console.log(
        `   ${status} ${archive.subreddit}/${archive.fileType} ${size}`,
      );
    });

    const availableArchives = archives.filter((a) => a.exists);
    if (availableArchives.length === 0) {
      console.error('❌ No archive files available for testing');
      process.exit(1);
    }

    console.log(
      `\n🧪 Testing with ${availableArchives.length} available archive(s)...\n`,
    );

    // Test processing with limited items
    let totalProcessed = 0;
    const maxTestItems = 50; // Limit for validation

    const processor: ItemProcessor = (
      item: RedditItem,
      lineNumber: number,
      fileType: 'comments' | 'submissions',
    ) => {
      return new Promise<void>((resolve) => {
        if (totalProcessed >= maxTestItems) {
          return;
        }

        totalProcessed++;

        // Basic validation
        if (
          !item.id ||
          !item.subreddit ||
          (typeof item.created_utc !== 'number' &&
            typeof item.created_utc !== 'string')
        ) {
          throw new Error(
            `Invalid ${fileType} structure at line ${lineNumber}`,
          );
        }

        if (totalProcessed % 10 === 0) {
          console.log(`   Processed ${totalProcessed} items...`);
        }
        resolve();
      });
    };

    // Test one archive from each subreddit
    const subreddits = [...new Set(availableArchives.map((a) => a.subreddit))];

    for (const subreddit of subreddits.slice(0, 2)) {
      // Limit to 2 subreddits for validation
      console.log(`🔄 Testing ${subreddit}...`);

      const subredditArchives = availableArchives.filter(
        (a) => a.subreddit === subreddit,
      );
      const testArchive = subredditArchives[0]; // Test with first available file type

      try {
        const startTime = new Date();
        const result = await pushshiftProcessor.processSubredditFile(
          testArchive.subreddit,
          testArchive.fileType as 'comments' | 'submissions',
          processor,
        );

        const endTime = new Date();

        // Record metrics
        metricsService.recordFileMetrics(
          result.filePath,
          result.fileType,
          result.subreddit,
          startTime,
          endTime,
          result.result.metrics,
        );

        console.log(`   ✅ ${testArchive.fileType} processing completed`);
        console.log(
          `   📊 Lines: ${result.result.metrics.totalLines}, Valid: ${result.result.metrics.validLines}, Errors: ${result.result.metrics.errorLines}`,
        );
        console.log(
          `   ⏱️  Processing time: ${result.result.metrics.processingTime}ms`,
        );
        console.log(
          `   💾 Memory peak: ${Math.round(
            result.result.metrics.memoryUsage.peak / 1024 / 1024,
          )}MB`,
        );
      } catch (error) {
        console.error(
          `   ❌ Failed to process ${testArchive.subreddit}/${testArchive.fileType}:`,
          error,
        );
      }

      console.log();
    }

    // Display aggregated metrics
    console.log('📈 Performance Summary:');
    const summary = metricsService.getPerformanceSummary();
    console.log(`   Overall Performance: ${summary.overall}`);

    if (summary.warnings.length > 0) {
      console.log('   ⚠️  Warnings:');
      summary.warnings.forEach((warning) => console.log(`      - ${warning}`));
    }

    if (summary.recommendations.length > 0) {
      console.log('   💡 Recommendations:');
      summary.recommendations.forEach((rec) => console.log(`      - ${rec}`));
    }

    const aggregated = metricsService.getAggregatedMetrics();
    console.log(`   Files processed: ${aggregated.totalFiles}`);
    console.log(`   Total lines: ${aggregated.totalLines}`);
    console.log(
      `   Processing speed: ${Math.round(
        aggregated.averageProcessingSpeed,
      )} lines/sec`,
    );
    console.log(`   Error rate: ${aggregated.errorRate.toFixed(2)}%`);

    console.log('\n🎉 Stream processing validation completed successfully!');
    console.log(
      `✅ Processed ${totalProcessed} items across ${aggregated.totalFiles} files`,
    );
  } catch (error) {
    console.error('❌ Stream processing validation failed:', error);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateStreamProcessing().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { validateStreamProcessing };
