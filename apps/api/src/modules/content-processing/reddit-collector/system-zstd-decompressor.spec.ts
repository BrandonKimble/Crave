import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import { LoggerService } from '../../../shared';
import {
  isRedditComment,
  RedditComment,
  CommentProcessor,
  FileStats,
} from './reddit-data.types';
import * as path from 'path';
import { promises as fs } from 'fs';

// Test data interfaces
interface ProcessedTestItem {
  lineNumber: number;
  id: string;
  author: string;
  subreddit: string;
  bodyLength: number;
}

describe('SystemZstdDecompressor - Large File Test', () => {
  let decompressor: SystemZstdDecompressor;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      http: jest.fn(),
      database: jest.fn(),
      performance: jest.fn(),
      audit: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    decompressor = new SystemZstdDecompressor(mockLogger);
  });

  it('should stream process actual large austinfood comments file', async () => {
    const testFilePath = path.resolve(
      __dirname,
      '../../../../data/pushshift/archives/austinfood/austinfood_comments.zst',
    );

    const processedItems: ProcessedTestItem[] = [];
    const maxTestItems = 1000; // Process only first 1000 items for testing

    const processor: CommentProcessor = (
      comment: RedditComment,
      lineNumber: number,
    ) => {
      if (processedItems.length < maxTestItems) {
        processedItems.push({
          lineNumber,
          id: comment.id,
          author: comment.author,
          subreddit: comment.subreddit,
          bodyLength: comment.body?.length || 0,
        });
      }
    };

    console.log('🚀 Starting large file streaming test...');
    console.log(`📄 File: ${testFilePath}`);

    const result = await decompressor.streamDecompressFile(
      testFilePath,
      processor,
      {
        validator: isRedditComment,
        maxLines: maxTestItems,
        timeout: 60000,
      },
    );

    console.log('\n📊 STREAMING PERFORMANCE RESULTS:');
    console.log(`⏱️  Processing time: ${result.processingTime}ms`);
    console.log(
      `📝 Total lines processed: ${result.totalLines.toLocaleString()}`,
    );
    console.log(`✅ Valid lines: ${result.validLines.toLocaleString()}`);
    console.log(`❌ Error lines: ${result.errorLines.toLocaleString()}`);
    console.log(
      `🚀 Throughput: ${Math.round(
        result.totalLines / (result.processingTime / 1000),
      ).toLocaleString()} lines/second`,
    );
    console.log(`💾 Memory usage:`);
    console.log(
      `   Initial: ${Math.round(result.memoryUsage.initial / 1024 / 1024)}MB`,
    );
    console.log(
      `   Peak: ${Math.round(result.memoryUsage.peak / 1024 / 1024)}MB`,
    );
    console.log(
      `   Final: ${Math.round(result.memoryUsage.final / 1024 / 1024)}MB`,
    );
    console.log(`🎯 Items collected: ${processedItems.length}`);

    if (processedItems.length > 0) {
      console.log('\n📄 Sample processed items:');
      console.log('First item:', {
        lineNumber: processedItems[0].lineNumber,
        id: processedItems[0].id,
        author: processedItems[0].author,
        subreddit: processedItems[0].subreddit,
        bodyLength: processedItems[0].bodyLength,
      });

      if (processedItems.length > 1) {
        console.log('Last item:', {
          lineNumber: processedItems[processedItems.length - 1].lineNumber,
          id: processedItems[processedItems.length - 1].id,
          author: processedItems[processedItems.length - 1].author,
          subreddit: processedItems[processedItems.length - 1].subreddit,
          bodyLength: processedItems[processedItems.length - 1].bodyLength,
        });
      }
    }

    // Assertions
    expect(result.totalLines).toBeGreaterThan(0);
    expect(result.validLines).toBeGreaterThan(0);
    expect(result.processingTime).toBeGreaterThan(0);
    expect(processedItems.length).toBeGreaterThan(0);
    expect(processedItems.length).toBeLessThanOrEqual(maxTestItems);

    // Verify all processed items are valid Reddit comments
    processedItems.forEach((item) => {
      expect(item.subreddit).toBe('austinfood');
      expect(item.id).toBeDefined();
      expect(item.lineNumber).toBeGreaterThan(0);
    });

    // Memory efficiency check (should use much less memory than file size)
    const initialMemoryMB = Math.round(
      result.memoryUsage.initial / 1024 / 1024,
    );
    const peakMemoryMB = Math.round(result.memoryUsage.peak / 1024 / 1024);
    const streamingOverheadMB = peakMemoryMB - initialMemoryMB;

    console.log(`\n✨ Memory efficiency analysis:`);
    console.log(`   Initial memory: ${initialMemoryMB}MB (test environment)`);
    console.log(`   Peak memory: ${peakMemoryMB}MB`);
    console.log(`   Streaming overhead: ${streamingOverheadMB}MB`);
    console.log(`   File would be ~722MB if loaded entirely into memory`);

    // The streaming overhead should be minimal (much less than the full file size)
    expect(streamingOverheadMB).toBeLessThan(50); // Streaming should add <50MB overhead
  }, 120000); // 2 minute timeout

  it('should validate system zstd availability', async () => {
    const validation = await decompressor.validateSystemZstd();

    console.log('\n🔧 System zstd validation:', validation);

    expect(validation.available).toBe(true);
    expect(validation.version).toBeDefined();
  });

  it('should handle file size validation', async () => {
    const testFilePath = path.resolve(
      __dirname,
      '../../../../data/pushshift/archives/austinfood/austinfood_comments.zst',
    );

    const stats: FileStats = (await fs.stat(testFilePath)) as FileStats;
    const fileSizeMB = stats.size / (1024 * 1024);

    console.log(`\n📏 File validation:`);
    console.log(`   Compressed size: ${Math.round(fileSizeMB * 100) / 100}MB`);
    console.log(`   System zstd: Ready for processing`);

    expect(fileSizeMB).toBeGreaterThan(0);
  });
});
