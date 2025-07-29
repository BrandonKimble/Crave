#!/usr/bin/env ts-node

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/await-thenable */
// Reason: Development utility script with test data handling

/**
 * Show Real Archive Output
 * Displays actual formatted output from real Pushshift archive data
 * to demonstrate the data transformation pipeline.
 */

import * as fs from 'fs/promises';
import { LoggerService } from '../../../shared';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { StreamProcessorService } from './stream-processor.service';
import { HistoricalProcessingConfig } from './historical-content-pipeline.types';
import { isRedditSubmission, isRedditComment } from './reddit-data.types';

// Mock logger for script
const mockLogger = {
  logger: {} as any,
  setContext: () => mockLogger,
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  http: () => {},
  database: () => {},
  performance: () => {},
  audit: () => {},
  child: () => ({}) as any,
} as unknown as LoggerService;

async function showRealOutput(): Promise<void> {
  console.log('🔍 Showing Real Archive Data Processing Output\n');

  try {
    // Initialize services
    const redditDataExtractor = new RedditDataExtractorService(mockLogger);
    const service = new HistoricalContentPipelineService(
      redditDataExtractor,
      mockLogger,
    );
    const streamProcessor = new StreamProcessorService(
      { get: () => undefined } as any,
      mockLogger,
    );

    // Adjusted configuration based on real data discovery (timestamps from 2012)
    const config: HistoricalProcessingConfig = {
      batchSize: 5,
      preserveThreads: true,
      validateTimestamps: true,
      timestampRange: {
        start: 1325376000, // 2012-01-01 (adjusted for real archive data)
        end: 1672531200, // 2023-01-01
      },
      qualityFilters: {
        minScore: 1,
        excludeDeleted: true,
        excludeRemoved: true,
      },
    };

    // Check if archive files exist
    const submissionsPath =
      '/Users/brandonkimble/crave-search/apps/api/data/pushshift/archives/austinfood/austinfood_submissions.zst';
    const commentsPath =
      '/Users/brandonkimble/crave-search/apps/api/data/pushshift/archives/austinfood/austinfood_comments.zst';

    try {
      await fs.access(submissionsPath);
    } catch {
      console.log('❌ Archive files not found. Please download them first.');
      return;
    }

    console.log('📄 REAL SUBMISSION DATA PROCESSING\n');
    console.log('═'.repeat(80));

    // Collect sample submission data
    const submissionSample: any[] = [];

    await streamProcessor.processZstdNdjsonFile(
      submissionsPath,
      async (item: any, lineNumber: number) => {
        if (submissionSample.length < 3) {
          submissionSample.push(item);
        }

        if (submissionSample.length >= 3) {
          return; // Stop after collecting samples
        }
      },
      (data: unknown): data is any => {
        return isRedditSubmission(data);
      },
    );

    if (submissionSample.length > 0) {
      console.log('📋 1. RAW REDDIT SUBMISSION FROM PUSHSHIFT ARCHIVE:');
      console.log('-'.repeat(60));
      console.log(JSON.stringify(submissionSample[0], null, 2));

      console.log('\n📋 2. PROCESSED SUBMISSION (After Pipeline Extraction):');
      console.log('-'.repeat(60));

      const submissionsBatch = await service.processBatch(
        submissionSample,
        config,
      );

      if (submissionsBatch.submissions.length > 0) {
        console.log(JSON.stringify(submissionsBatch.submissions[0], null, 2));

        console.log('\n📋 3. LLM-READY FORMAT (Final Output):');
        console.log('-'.repeat(60));

        const llmInput = await service.convertToLLMFormat(
          submissionsBatch,
          false,
        );

        if (llmInput.posts.length > 0) {
          console.log(JSON.stringify(llmInput.posts[0], null, 2));
        }
      } else {
        console.log(
          '❌ No submissions extracted - all were filtered out by validation',
        );
      }

      console.log('\n📊 PROCESSING STATS:');
      console.log('-'.repeat(60));
      console.log(`Total processed: ${submissionsBatch.totalProcessed}`);
      console.log(`Valid items: ${submissionsBatch.validItems}`);
      console.log(`Invalid items: ${submissionsBatch.invalidItems}`);
      console.log(
        `Submissions extracted: ${submissionsBatch.submissions.length}`,
      );
      console.log(`Comments extracted: ${submissionsBatch.comments.length}`);
      console.log(`Errors: ${submissionsBatch.errors.length}`);

      if (submissionsBatch.errors.length > 0) {
        console.log('\n❌ VALIDATION ERRORS (Why items were filtered):');
        console.log('-'.repeat(60));
        submissionsBatch.errors.forEach((error, idx) => {
          console.log(`${idx + 1}. Line ${error.lineNumber}: ${error.message}`);
        });
      }
    }

    console.log('\n✅ Real archive output demonstration complete!');
  } catch (error) {
    console.error('❌ Failed to show real output:', error);
  }
}

// Run the script
if (require.main === module) {
  showRealOutput()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { showRealOutput };
