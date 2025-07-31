/**
 * Data Merge Validation Test
 *
 * Simple validation test to confirm the merge service works correctly with realistic data
 * and properly integrates with the existing pipeline infrastructure.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataMergeService } from './data-merge.service';
import { LoggerService } from '../../../shared';
import { DataSourceType } from './data-merge.types';

describe('DataMergeService Production Validation', () => {
  let service: DataMergeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMergeService,
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

    service = module.get<DataMergeService>(DataMergeService);
  });

  describe('Core Functionality Validation', () => {
    it('should successfully merge realistic historical and API data', async () => {
      // Arrange - Create realistic test data
      const historicalBatch = {
        submissions: [
          {
            id: 'hist_1',
            title: 'Best tacos in Austin',
            author: 'austin_foodie',
            subreddit: 'austinfood',
            created_utc: 1609459200, // 2021-01-01
            score: 25,
            url: 'https://reddit.com/r/austinfood/comments/hist_1',
            num_comments: 12,
            selftext: 'Looking for authentic tacos...',
            permalink: '/r/austinfood/comments/hist_1/best_tacos/',
          },
        ],
        comments: [
          {
            id: 'hist_comment_1',
            body: 'Try Veracruz All Natural!',
            author: 'taco_expert',
            created_utc: 1609462800, // 1 hour later
            score: 15,
            subreddit: 'austinfood',
            link_id: 't3_hist_1',
            permalink: '/r/austinfood/comments/hist_1/_/hist_comment_1/',
          },
        ],
        totalProcessed: 2,
        validItems: 2,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'hist_validation_batch',
        errors: [],
      };

      const apiData = {
        posts: [
          {
            id: 'api_1',
            title: 'New BBQ spot opened',
            author: 'bbq_lover',
            subreddit: 'austinfood',
            created_utc: 1672531200, // 2023-01-01
            score: 30,
            url: 'https://reddit.com/r/austinfood/comments/api_1',
            permalink: '/r/austinfood/comments/api_1/new_bbq/',
          },
        ],
        comments: [
          {
            id: 'api_comment_1',
            body: 'The brisket is amazing!',
            author: 'bbq_fan',
            created_utc: 1672534800, // 1 hour later
            score: 20,
            subreddit: 'austinfood',
            link_id: 't3_api_1',
            permalink: '/r/austinfood/comments/api_1/_/api_comment_1/',
          },
        ],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'api_validation_batch',
      };

      // Act
      const result = service.mergeTemporalData(historicalBatch, apiData);

      // Assert - Basic functionality
      expect(result).toBeDefined();
      expect(result.totalItems).toBe(4); // 2 historical + 2 API
      expect(result.validItems).toBe(4);
      expect(result.invalidItems).toBe(0);

      // Assert - Temporal ordering
      const timestamps = result.mergedItems.map(
        (item) => item.normalizedTimestamp,
      );
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }

      // Assert - Source attribution
      const historicalItems = result.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType === DataSourceType.PUSHSHIFT_ARCHIVE,
      );
      const apiItems = result.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType ===
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );
      expect(historicalItems).toHaveLength(2);
      expect(apiItems).toHaveLength(2);

      // Assert - Data integrity
      result.mergedItems.forEach((item) => {
        expect(item.sourceMetadata.originalId).toBeDefined();
        expect(item.sourceMetadata.sourceType).toBeDefined();
        expect(item.normalizedTimestamp).toBeGreaterThan(0);
        expect(item.isValid).toBe(true);
      });

      // Assert - Performance
      expect(result.processingStats.mergeDurationMs).toBeLessThan(1000); // < 1 second
    });

    it('should convert merged data to LLM-compatible format', async () => {
      // Arrange
      const historicalBatch = {
        submissions: [
          {
            id: 'test_post',
            title: 'Test Food Post',
            author: 'test_user',
            subreddit: 'austinfood',
            created_utc: 1609459200,
            score: 10,
            url: 'https://reddit.com/test',
            num_comments: 1,
            permalink: '/r/austinfood/comments/test_post/',
          },
        ],
        comments: [
          {
            id: 'test_comment',
            body: 'Great food!',
            author: 'test_commenter',
            created_utc: 1609462800,
            score: 5,
            subreddit: 'austinfood',
            link_id: 't3_test_post',
            permalink: '/r/austinfood/comments/test_post/_/test_comment/',
          },
        ],
        totalProcessed: 2,
        validItems: 2,
        invalidItems: 0,
        processingTime: 50,
        batchId: 'llm_test_batch',
        errors: [],
      };

      const apiData = {
        posts: [],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'empty_api_batch',
      };

      // Act
      const mergeBatch = service.mergeTemporalData(
        historicalBatch,
        apiData,
      );
      const llmInput = service.convertToLLMInput(mergeBatch);

      // Assert - LLM format validation
      expect(llmInput.posts).toHaveLength(1);
      expect(llmInput.comments).toHaveLength(1);
      expect(llmInput.sourceMetadata).toBeDefined();

      // Verify post structure
      const post = llmInput.posts[0];
      expect(post.post_id).toBe('test_post');
      expect(post.title).toBe('Test Food Post');
      expect(post.subreddit).toBe('austinfood');
      expect(post.created_at).toBeDefined();
      expect(Date.parse(post.created_at)).toBeGreaterThan(0); // Valid ISO string

      // Verify comment structure
      const comment = llmInput.comments[0];
      expect(comment.comment_id).toBe('test_comment');
      expect(comment.content).toBe('Great food!');
      expect(comment.author).toBe('test_commenter');
      expect(comment.created_at).toBeDefined();
      expect(Date.parse(comment.created_at)).toBeGreaterThan(0); // Valid ISO string

      // Verify source metadata
      expect(llmInput.sourceMetadata.batchId).toBe(mergeBatch.batchId);
      expect(llmInput.sourceMetadata.sourceBreakdown).toEqual(
        mergeBatch.sourceBreakdown,
      );
    });

    it('should handle edge cases gracefully', async () => {
      // Test empty data
      const emptyHistorical = {
        submissions: [],
        comments: [],
        totalProcessed: 0,
        validItems: 0,
        invalidItems: 0,
        processingTime: 0,
        batchId: 'empty_batch',
        errors: [],
      };

      const emptyApi = {
        posts: [],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'empty_api',
      };

      const result = service.mergeTemporalData(emptyHistorical, emptyApi);
      expect(result.totalItems).toBe(0);
      expect(result.validItems).toBe(0);
      expect(result).toBeDefined();
    });
  });

  describe('Production Readiness Validation', () => {
    it('should demonstrate production-ready performance', async () => {
      // Create larger dataset to test performance
      const submissions = Array.from({ length: 50 }, (_, i) => ({
        id: `perf_post_${i}`,
        title: `Performance Test Post ${i}`,
        author: `user_${i}`,
        subreddit: 'austinfood',
        created_utc: 1609459200 + i * 3600, // Hourly posts
        score: Math.floor(Math.random() * 50) + 1,
        url: `https://reddit.com/r/austinfood/comments/perf_post_${i}`,
        num_comments: Math.floor(Math.random() * 20),
        permalink: `/r/austinfood/comments/perf_post_${i}/`,
      }));

      const comments = Array.from({ length: 100 }, (_, i) => ({
        id: `perf_comment_${i}`,
        body: `Performance test comment ${i}`,
        author: `commenter_${i}`,
        created_utc: 1609459200 + i * 1800, // Comments every 30 minutes
        score: Math.floor(Math.random() * 25) + 1,
        subreddit: 'austinfood',
        link_id: `t3_perf_post_${i % 50}`,
        permalink: `/r/austinfood/comments/perf_post_${i % 50}/_/perf_comment_${i}/`,
      }));

      const largeBatch = {
        submissions,
        comments,
        totalProcessed: 150,
        validItems: 150,
        invalidItems: 0,
        processingTime: 500,
        batchId: 'performance_batch',
        errors: [],
      };

      const smallApi = {
        posts: [],
        comments: [],
        sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
        collectionTimestamp: new Date(),
        batchId: 'small_api',
      };

      const startTime = Date.now();
      const result = service.mergeTemporalData(largeBatch, smallApi);
      const endTime = Date.now();

      // Performance assertions
      expect(endTime - startTime).toBeLessThan(2000); // < 2 seconds
      expect(result.totalItems).toBe(150);
      expect(result.validItems).toBe(150);
      expect(result.processingStats.mergeDurationMs).toBeLessThan(2000);

      // Memory efficiency check (adjusted for test environment)
      expect(process.memoryUsage().heapUsed).toBeLessThan(500 * 1024 * 1024); // < 500MB in test env
    });
  });
});
