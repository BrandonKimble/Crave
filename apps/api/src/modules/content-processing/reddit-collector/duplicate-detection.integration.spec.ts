/**
 * Duplicate Detection Integration Tests
 *
 * End-to-end integration tests for duplicate detection with DataMergeService
 * and processing pipeline as specified in PRD sections 5.1.2 and 6.1.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataMergeService, ApiContentBatch } from './data-merge.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { LoggerService } from '../../../shared';
import { DataSourceType } from './data-merge.types';
import { HistoricalContentBatch } from './historical-content-pipeline.types';

describe('Duplicate Detection Integration', () => {
  let dataMergeService: DataMergeService;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
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
    } as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMergeService,
        DuplicateDetectionService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    dataMergeService = module.get<DataMergeService>(DataMergeService);
    module.get<DuplicateDetectionService>(DuplicateDetectionService);
  });

  describe('DataMergeService with Duplicate Detection', () => {
    it('should filter duplicates during temporal merge process', () => {
      const archiveData: HistoricalContentBatch = {
        submissions: [
          {
            id: 'post123',
            title: 'Great tacos at Torchys',
            author: 'foodlover',
            subreddit: 'austinfood',
            created_utc: 1640995200, // 2022-01-01 00:00:00 UTC
            score: 25,
            url: 'https://reddit.com/r/austinfood/post123',
            num_comments: 5,
            permalink: '/r/austinfood/comments/post123',
          },
          {
            id: 'post456',
            title: 'BBQ recommendations',
            author: 'texasbbq',
            subreddit: 'austinfood',
            created_utc: 1641081600, // 2022-01-02 00:00:00 UTC
            score: 40,
            url: 'https://reddit.com/r/austinfood/post456',
            num_comments: 12,
            permalink: '/r/austinfood/comments/post456',
          },
        ],
        comments: [
          {
            id: 'comment789',
            body: 'Torchys is amazing, try the trailer park taco',
            author: 'tacofan',
            created_utc: 1640996400, // 2022-01-01 00:20:00 UTC
            score: 15,
            subreddit: 'austinfood',
            link_id: 't3_post123',
            permalink: '/r/austinfood/comments/post123/_/comment789',
          },
        ],
        batchId: 'archive-batch-1',
        totalProcessed: 3,
        validItems: 3,
        invalidItems: 0,
        processingTime: 1000,
        errors: [],
      };

      const apiData: ApiContentBatch = {
        posts: [
          {
            id: 'post123', // Duplicate of archive data
            title: 'Great tacos at Torchys',
            author: 'foodlover',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 25,
            url: 'https://reddit.com/r/austinfood/post123',
            permalink: '/r/austinfood/comments/post123',
          },
          {
            id: 'post789',
            title: 'New restaurant downtown',
            author: 'downtowner',
            subreddit: 'austinfood',
            created_utc: 1641168000, // 2022-01-03 00:00:00 UTC
            score: 18,
            url: 'https://reddit.com/r/austinfood/post789',
            permalink: '/r/austinfood/comments/post789',
          },
        ],
        comments: [
          {
            id: 'comment789', // Duplicate of archive data
            body: 'Torchys is amazing, try the trailer park taco',
            author: 'tacofan',
            created_utc: 1640996400,
            score: 15,
            subreddit: 'austinfood',
            link_id: 't3_post123',
            permalink: '/r/austinfood/comments/post123/_/comment789',
          },
          {
            id: 'comment999',
            body: 'I love BBQ, any recommendations?',
            author: 'bbqnewbie',
            created_utc: 1641082800, // 2022-01-02 00:20:00 UTC
            score: 8,
            subreddit: 'austinfood',
            link_id: 't3_post456',
            permalink: '/r/austinfood/comments/post456/_/comment999',
          },
        ],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'api-batch-1',
      };

      const result = dataMergeService.mergeTemporalData(archiveData, apiData);

      // Should have filtered out duplicates
      expect(result.totalItems).toBe(5); // 2 unique posts + 2 unique comments + 1 from API not in archive
      expect(result.processingStats.duplicatesDetected).toBe(2); // 1 duplicate post + 1 duplicate comment
      expect(result.processingStats.duplicateAnalysis).toBeDefined();
      expect(
        result.processingStats.duplicateAnalysis?.duplicateRate,
      ).toBeCloseTo(28.57, 1); // 2 duplicates out of 7 total items

      // Verify submissions and comments are properly separated
      expect(result.submissions).toHaveLength(3); // 2 from archive + 1 unique from API
      expect(result.comments).toHaveLength(2); // 1 from archive + 1 unique from API

      // Verify source breakdown reflects deduplicated data
      expect(result.sourceBreakdown[DataSourceType.PUSHSHIFT_ARCHIVE]).toBe(3); // 2 posts + 1 comment from archive
      expect(
        result.sourceBreakdown[DataSourceType.REDDIT_API_CHRONOLOGICAL],
      ).toBe(2); // 1 post + 1 comment from API (unique items only)
    });

    it('should handle complex overlap patterns across multiple sources', () => {
      const archiveData: HistoricalContentBatch = {
        submissions: [
          {
            id: 'post100',
            title: 'Austin food scene review',
            author: 'foodcritic',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 50,
            url: 'https://reddit.com/r/austinfood/post100',
            num_comments: 20,
            permalink: '/r/austinfood/comments/post100',
          },
        ],
        comments: [],
        batchId: 'archive-batch-complex',
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 500,
        errors: [],
      };

      const apiData: ApiContentBatch = {
        posts: [
          {
            id: 'post100', // Duplicate from archive
            title: 'Austin food scene review',
            author: 'foodcritic',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 50,
            url: 'https://reddit.com/r/austinfood/post100',
            permalink: '/r/austinfood/comments/post100',
          },
          {
            id: 'post200',
            title: 'Best breakfast spots',
            author: 'brunchfan',
            subreddit: 'austinfood',
            created_utc: 1641081600,
            score: 35,
            url: 'https://reddit.com/r/austinfood/post200',
            permalink: '/r/austinfood/comments/post200',
          },
        ],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_KEYWORD_SEARCH,
        collectionTimestamp: new Date(),
        batchId: 'api-batch-complex',
      };

      const result = dataMergeService.mergeTemporalData(archiveData, apiData);

      // Verify comprehensive duplicate analysis
      expect(
        result.processingStats.duplicateAnalysis?.sourceOverlapAnalysis,
      ).toBeDefined();
      const overlapAnalysis =
        result.processingStats.duplicateAnalysis!.sourceOverlapAnalysis;

      expect(overlapAnalysis.overlapMatrix).toHaveProperty(
        'PUSHSHIFT_ARCHIVE→REDDIT_API_KEYWORD_SEARCH',
      );
      expect(overlapAnalysis.commonOverlapPatterns).toHaveLength(1);
      expect(overlapAnalysis.commonOverlapPatterns[0].sources).toEqual([
        'PUSHSHIFT_ARCHIVE',
        'REDDIT_API_KEYWORD_SEARCH',
      ]);
    });

    it('should maintain temporal ordering after duplicate filtering', () => {
      const archiveData: HistoricalContentBatch = {
        submissions: [
          {
            id: 'post_old',
            title: 'Old post',
            author: 'olduser',
            subreddit: 'austinfood',
            created_utc: 1640995200, // Older timestamp
            score: 10,
            url: 'https://reddit.com/r/austinfood/post_old',
            num_comments: 1,
            permalink: '/r/austinfood/comments/post_old',
          },
          {
            id: 'post_new',
            title: 'New post',
            author: 'newuser',
            subreddit: 'austinfood',
            created_utc: 1641168000, // Newer timestamp
            score: 20,
            url: 'https://reddit.com/r/austinfood/post_new',
            num_comments: 5,
            permalink: '/r/austinfood/comments/post_new',
          },
        ],
        comments: [],
        batchId: 'temporal-archive',
        totalProcessed: 2,
        validItems: 2,
        invalidItems: 0,
        processingTime: 800,
        errors: [],
      };

      const apiData: ApiContentBatch = {
        posts: [
          {
            id: 'post_middle',
            title: 'Middle post',
            author: 'middleuser',
            subreddit: 'austinfood',
            created_utc: 1641081600, // Middle timestamp
            score: 15,
            url: 'https://reddit.com/r/austinfood/post_middle',
            permalink: '/r/austinfood/comments/post_middle',
          },
        ],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'temporal-api',
      };

      const result = dataMergeService.mergeTemporalData(archiveData, apiData);

      // Verify temporal ordering is maintained
      expect(result.submissions).toHaveLength(3);
      expect(result.submissions[0].created_utc).toBeLessThan(
        result.submissions[1].created_utc,
      );
      expect(result.submissions[1].created_utc).toBeLessThan(
        result.submissions[2].created_utc,
      );

      // Verify all three posts are present (no duplicates)
      expect(result.submissions.map((s) => s.id)).toEqual([
        'post_old',
        'post_middle',
        'post_new',
      ]);
    });

    it('should generate accurate LLM input with filtered data', () => {
      const archiveData: HistoricalContentBatch = {
        submissions: [
          {
            id: 'llm_post',
            title: 'Best tacos in Austin',
            author: 'tacoenthusiast',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 100,
            url: 'https://reddit.com/r/austinfood/llm_post',
            num_comments: 50,
            selftext: 'Looking for authentic taco recommendations',
            permalink: '/r/austinfood/comments/llm_post',
          },
        ],
        comments: [
          {
            id: 'llm_comment',
            body: 'Try Suerte for amazing tacos',
            author: 'localfoodie',
            created_utc: 1640996400,
            score: 25,
            subreddit: 'austinfood',
            link_id: 't3_llm_post',
            permalink: '/r/austinfood/comments/llm_post/_/llm_comment',
          },
        ],
        batchId: 'llm-test-archive',
        totalProcessed: 2,
        validItems: 2,
        invalidItems: 0,
        processingTime: 600,
        errors: [],
      };

      const apiData: ApiContentBatch = {
        posts: [
          {
            id: 'llm_post', // Duplicate - should be filtered
            title: 'Best tacos in Austin',
            author: 'tacoenthusiast',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 100,
            url: 'https://reddit.com/r/austinfood/llm_post',
            selftext: 'Looking for authentic taco recommendations',
            permalink: '/r/austinfood/comments/llm_post',
          },
        ],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'llm-test-api',
      };

      const mergeBatch = dataMergeService.mergeTemporalData(
        archiveData,
        apiData,
      );
      const llmInput = dataMergeService.convertToLLMInput(mergeBatch);

      // Verify LLM input structure
      expect(llmInput.posts).toHaveLength(1); // Duplicate filtered out
      expect(llmInput.comments).toHaveLength(1);
      expect(llmInput.posts[0].post_id).toBe('llm_post');
      expect(llmInput.posts[0].title).toBe('Best tacos in Austin');
      expect(llmInput.comments[0].comment_id).toBe('llm_comment');
      expect(llmInput.comments[0].content).toBe('Try Suerte for amazing tacos');

      // Verify source metadata includes duplicate analysis
      expect(llmInput.sourceMetadata.batchId).toBe(mergeBatch.batchId);
      expect(llmInput.sourceMetadata.sourceBreakdown).toBeDefined();
      expect(llmInput.sourceMetadata.temporalRange).toBeDefined();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large datasets efficiently', () => {
      const largeArchiveData: HistoricalContentBatch = {
        submissions: Array.from({ length: 1000 }, (_, i) => ({
          id: `archive_post_${i}`,
          title: `Archive post ${i}`,
          author: `user${i}`,
          subreddit: 'austinfood',
          created_utc: 1640995200 + i * 60,
          score: i + 10,
          url: `https://reddit.com/r/austinfood/archive_post_${i}`,
          num_comments: i % 10,
          permalink: `/r/austinfood/comments/archive_post_${i}`,
        })),
        comments: [],
        batchId: 'large-archive-batch',
        totalProcessed: 1000,
        validItems: 1000,
        invalidItems: 0,
        processingTime: 5000,
        errors: [],
      };

      const largeApiData: ApiContentBatch = {
        posts: Array.from({ length: 500 }, (_, i) => ({
          id: i < 250 ? `archive_post_${i}` : `api_post_${i}`, // First 250 are duplicates
          title: i < 250 ? `Archive post ${i}` : `API post ${i}`,
          author: i < 250 ? `user${i}` : `apiuser${i}`,
          subreddit: 'austinfood',
          created_utc: 1640995200 + i * 60,
          score: i + 5,
          url: `https://reddit.com/r/austinfood/${i < 250 ? 'archive' : 'api'}_post_${i}`,
          permalink: `/r/austinfood/comments/${i < 250 ? 'archive' : 'api'}_post_${i}`,
        })),
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'large-api-batch',
      };

      const startTime = Date.now();
      const result = dataMergeService.mergeTemporalData(
        largeArchiveData,
        largeApiData,
        {
          validateTimestamps: false, // Disable validation for large dataset test
        },
      );
      const processingTime = Date.now() - startTime;

      // Performance expectations
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.totalItems).toBe(1250); // 1000 archive + 250 unique API items
      expect(result.processingStats.duplicatesDetected).toBe(250); // 250 duplicates
      expect(
        result.processingStats.duplicateAnalysis?.duplicateRate,
      ).toBeCloseTo(16.67, 1); // 250/1500 * 100

      // Memory usage validation (approximate)
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      expect(memoryUsage).toBeLessThan(500); // Should use less than 500MB
    });

    it('should handle edge case with malformed timestamps gracefully', () => {
      // This test verifies the service handles edge cases in the processing pipeline
      const archiveData: HistoricalContentBatch = {
        submissions: [
          {
            id: 'valid_post',
            title: 'Valid post',
            author: 'validuser',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 10,
            url: 'https://reddit.com/r/austinfood/valid_post',
            num_comments: 1,
            permalink: '/r/austinfood/comments/valid_post',
          },
        ],
        comments: [],
        batchId: 'edge-case-archive',
        totalProcessed: 1,
        validItems: 1,
        invalidItems: 0,
        processingTime: 200,
        errors: [],
      };

      const apiData: ApiContentBatch = {
        posts: [
          {
            id: 'another_valid_post',
            title: 'Another valid post',
            author: 'anotheruser',
            subreddit: 'austinfood',
            created_utc: 1641081600,
            score: 15,
            url: 'https://reddit.com/r/austinfood/another_valid_post',
            permalink: '/r/austinfood/comments/another_valid_post',
          },
        ],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'edge-case-api',
      };

      expect(() => {
        const result = dataMergeService.mergeTemporalData(archiveData, apiData);
        expect(result.totalItems).toBe(2);
        expect(result.processingStats.duplicatesDetected).toBe(0);
      }).not.toThrow();
    });
  });
});
