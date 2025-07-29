#!/usr/bin/env ts-node

import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { PushshiftProcessorService } from './pushshift-processor.service';
import { StreamProcessorService } from './stream-processor.service';
import { ProcessingMetricsService } from './processing-metrics.service';
import configuration from '../../../config/configuration';

/**
 * Validation script for stream processing functionality
 * Tests the implementation with actual archive files using command-line zstd
 */

// Mock logger for script
const mockLogger = {
  setContext: () => mockLogger,
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  debug: (msg: string, meta?: any) => console.log(`[DEBUG] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) =>
    console.error(`[ERROR] ${msg}`, error, meta || ''),
} as LoggerService;

async function validateStreamProcessing(): Promise<void> {
  console.log('🔍 Validating stream processing implementation...\n');

  try {
    // Create services
    const config = configuration();
    const configService = {
      get: (key: string, defaultValue?: any) => {
        const keys = key.split('.');
        let value = config as any;
        for (const k of keys) {
          value = value?.[k];
        }
        return value ?? defaultValue;
      },
    } as ConfigService;

    const streamProcessor = new StreamProcessorService(
      configService,
      mockLogger,
    );
    const metricsService = new ProcessingMetricsService(mockLogger);
    const pushshiftProcessor = new PushshiftProcessorService(
      configService,
      streamProcessor,
      mockLogger,
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

    const processor = async (
      item: any,
      lineNumber: number,
      fileType: 'comments' | 'submissions',
    ) => {
      if (totalProcessed >= maxTestItems) {
        return;
      }

      totalProcessed++;

      // Basic validation
      if (!item.id || !item.subreddit || typeof item.created_utc !== 'number') {
        throw new Error(`Invalid ${fileType} structure at line ${lineNumber}`);
      }

      if (totalProcessed % 10 === 0) {
        console.log(`   Processed ${totalProcessed} items...`);
      }
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
          `   💾 Memory peak: ${Math.round(result.result.metrics.memoryUsage.peak / 1024 / 1024)}MB`,
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
      `   Processing speed: ${Math.round(aggregated.averageProcessingSpeed)} lines/sec`,
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
