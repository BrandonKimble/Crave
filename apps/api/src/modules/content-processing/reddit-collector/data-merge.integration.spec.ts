/**
 * Data Merge Integration Tests
 *
 * Tests integration between DataMergeService and existing pipeline services.
 * Validates temporal merge functionality with realistic data scenarios
 * and integration with HistoricalContentPipelineService and ContentRetrievalPipelineService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataMergeService, ApiContentBatch } from './data-merge.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { ContentRetrievalPipelineService } from './content-retrieval-pipeline.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { LoggerService } from '../../../shared';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import {
  DataSourceType,
  TemporalMergeBatch,
  MergedLLMInputDto,
} from './data-merge.types';
import {
  HistoricalContentBatch,
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';

describe('DataMergeService Integration', () => {
  let dataMergeService: DataMergeService;
  let historicalPipelineService: HistoricalContentPipelineService;
  let contentRetrievalService: ContentRetrievalPipelineService;
  let module: TestingModule;

  beforeEach(async () => {
    // Create test module with minimal dependencies
    module = await Test.createTestingModule({
      providers: [
        DataMergeService,
        {
          provide: LoggerService,
          useValue: createMockLogger(),
        },
        {
          provide: HistoricalContentPipelineService,
          useValue: createMockHistoricalPipelineService(),
        },
        {
          provide: ContentRetrievalPipelineService,
          useValue: createMockContentRetrievalService(),
        },
        {
          provide: RedditDataExtractorService,
          useValue: createMockRedditDataExtractor(),
        },
        {
          provide: RedditService,
          useValue: createMockRedditService(),
        },
        {
          provide: DuplicateDetectionService,
          useValue: {
            detectAndFilterDuplicates: jest.fn().mockImplementation((items) => ({
              filteredItems: items,
              analysis: {
                totalItems: items.length,
                duplicatesFound: 0,
                duplicateRate: 0,
                processingTimeMs: 100,
                sourceBreakdown: {},
                overlapMatrix: {},
                commonOverlapPatterns: [],
                temporalOverlapAnalysis: {
                  overlapsByHour: {},
                  peakOverlapTimes: [],
                  avgTimeBetweenDuplicates: 0,
                },
                performance: {
                  startTime: new Date(),
                  endTime: new Date(),
                  durationMs: 100,
                  throughputPerSecond: items.length / 0.1,
                  memoryUsage: { peakMemoryMB: 0, memoryPerItemKB: 0 },
                  lookupPerformance: { avgLookupTimeMs: 0 },
                },
              },
            })),
          },
        },
      ],
    }).compile();

    dataMergeService = module.get<DataMergeService>(DataMergeService);
    historicalPipelineService = module.get<HistoricalContentPipelineService>(
      HistoricalContentPipelineService,
    );
    contentRetrievalService = module.get<ContentRetrievalPipelineService>(
      ContentRetrievalPipelineService,
    );
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Integration with Historical Pipeline', () => {
    it('should merge historical archive data with API data', async () => {
      // Arrange
      const historicalBatch = createRealisticHistoricalBatch();
      const apiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        historicalBatch,
        apiBatch,
      );

      // Assert
      expect(mergeResult).toBeDefined();
      expect(mergeResult.totalItems).toBeGreaterThan(0);
      expect(mergeResult.validItems).toBe(mergeResult.totalItems);

      // Verify both sources are represented
      expect(
        mergeResult.sourceBreakdown[DataSourceType.PUSHSHIFT_ARCHIVE],
      ).toBeGreaterThan(0);
      expect(
        mergeResult.sourceBreakdown[DataSourceType.REDDIT_API_CHRONOLOGICAL],
      ).toBeGreaterThan(0);

      // Verify temporal ordering
      const timestamps = mergeResult.mergedItems.map(
        (item) => item.normalizedTimestamp,
      );
      expect(isTemporallySorted(timestamps)).toBe(true);

      // Verify source attribution is preserved
      mergeResult.mergedItems.forEach((item) => {
        expect(item.sourceMetadata.originalId).toBeDefined();
        expect(item.sourceMetadata.sourceType).toBeDefined();
        expect(item.sourceMetadata.permalink).toBeDefined();
      });
    });

    it('should handle large historical datasets efficiently', async () => {
      // Arrange
      const largeHistoricalBatch = createLargeHistoricalBatch(1000); // 1000 items
      const smallApiBatch = createRealisticApiBatch();

      const startTime = Date.now();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        largeHistoricalBatch,
        smallApiBatch,
      );

      const endTime = Date.now();
      const processingTimeMs = endTime - startTime;

      // Assert
      expect(mergeResult.totalItems).toBe(1002); // 1000 + 2
      expect(processingTimeMs).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mergeResult.processingStats.mergeDurationMs).toBeLessThan(5000);

      // Verify memory efficiency - no significant memory leaks
      expect(process.memoryUsage().heapUsed).toBeLessThan(600 * 1024 * 1024); // < 600MB adjusted for test environment
    });
  });

  describe('Integration with Content Retrieval Pipeline', () => {
    it('should integrate with ContentRetrievalPipelineService output', async () => {
      // Arrange
      const historicalBatch = createRealisticHistoricalBatch();
      const apiContentFromRetrieval = createApiContentFromContentRetrieval();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        historicalBatch,
        apiContentFromRetrieval,
      );

      // Assert
      expect(mergeResult).toBeDefined();
      expect(mergeResult.totalItems).toBeGreaterThan(0);

      // Verify API content structure is handled correctly
      const apiItems = mergeResult.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType ===
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );

      apiItems.forEach((item) => {
        expect(item.sourceMetadata.permalink).toBeDefined();
        expect(item.normalizedTimestamp).toBeGreaterThan(0);
      });
    });

    it('should handle different API source types correctly', async () => {
      // Arrange
      const historicalBatch = createRealisticHistoricalBatch();
      const chronologicalBatch = createApiBatchWithSourceType(
        DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );
      const keywordSearchBatch = createApiBatchWithSourceType(
        DataSourceType.REDDIT_API_KEYWORD_SEARCH,
      );

      // Act - Merge historical + chronological
      const chronologicalMerge = dataMergeService.mergeTemporalData(
        historicalBatch,
        chronologicalBatch,
      );

      // Act - Merge historical + keyword search
      const keywordMerge = dataMergeService.mergeTemporalData(
        historicalBatch,
        keywordSearchBatch,
      );

      // Assert
      expect(
        chronologicalMerge.sourceBreakdown[
          DataSourceType.REDDIT_API_CHRONOLOGICAL
        ],
      ).toBeGreaterThan(0);
      expect(
        keywordMerge.sourceBreakdown[DataSourceType.REDDIT_API_KEYWORD_SEARCH],
      ).toBeGreaterThan(0);

      // Verify source types are preserved correctly
      const chronologicalItems = chronologicalMerge.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType ===
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );
      const keywordItems = keywordMerge.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType ===
          DataSourceType.REDDIT_API_KEYWORD_SEARCH,
      );

      expect(chronologicalItems.length).toBeGreaterThan(0);
      expect(keywordItems.length).toBeGreaterThan(0);
    });
  });

  describe('LLM Pipeline Integration', () => {
    it('should produce LLM-compatible output format', async () => {
      // Arrange
      const historicalBatch = createRealisticHistoricalBatch();
      const apiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        historicalBatch,
        apiBatch,
      );
      const llmInput = dataMergeService.convertToLLMInput(mergeResult);

      // Assert
      expect(llmInput).toBeDefined();
      expect(llmInput.posts).toBeDefined();
      expect(llmInput.comments).toBeDefined();
      expect(llmInput.sourceMetadata).toBeDefined();

      // Verify LLM input format matches expected structure
      llmInput.posts.forEach((post) => {
        expect(post.post_id).toBeDefined();
        expect(post.title).toBeDefined();
        expect(post.subreddit).toBeDefined();
        expect(post.created_at).toBeDefined();
        expect(post.upvotes).toBeDefined();
        expect(post.url).toContain('reddit.com');
      });

      llmInput.comments.forEach((comment) => {
        expect(comment.content).toBeDefined();
        expect(comment.author).toBeDefined();
        expect(comment.upvotes).toBeDefined();
        expect(comment.created_at).toBeDefined();
        expect(comment.url).toBeDefined();
      });

      // Verify source metadata is preserved
      expect(llmInput.sourceMetadata.batchId).toBe(mergeResult.batchId);
      expect(llmInput.sourceMetadata.sourceBreakdown).toEqual(
        mergeResult.sourceBreakdown,
      );
      expect(llmInput.sourceMetadata.temporalRange).toEqual(
        mergeResult.temporalRange,
      );
    });
  });

  describe('Gap Detection and Quality Assessment', () => {
    it('should detect realistic temporal gaps', async () => {
      // Arrange - Create data with intentional gaps
      const historicalBatchWithGap = createHistoricalBatchWithRealisticGap();
      const apiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        historicalBatchWithGap,
        apiBatch,
      );

      // Assert
      expect(mergeResult.processingStats.gapsDetected).toBeDefined();
      expect(mergeResult.processingStats.gapsDetected.length).toBeGreaterThan(
        0,
      );

      const significantGaps = mergeResult.processingStats.gapsDetected.filter(
        (gap) => gap.durationHours > 24, // Gaps longer than 1 day
      );

      if (significantGaps.length > 0) {
        significantGaps.forEach((gap) => {
          expect(gap.severity).toBeDefined();
          expect(gap.description).toBeDefined();
          expect(gap.affectedSources).toHaveLength(2);
          expect(gap.mitigationSuggestions).toBeDefined();
        });
      }
    });

    it('should provide quality metrics for merged data', async () => {
      // Arrange
      const historicalBatch = createRealisticHistoricalBatch();
      const apiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        historicalBatch,
        apiBatch,
      );

      // Assert
      expect(mergeResult.processingStats).toBeDefined();
      expect(mergeResult.processingStats.mergeStartTime).toBeDefined();
      expect(mergeResult.processingStats.mergeEndTime).toBeDefined();
      expect(
        mergeResult.processingStats.mergeDurationMs,
      ).toBeGreaterThanOrEqual(0);
      expect(mergeResult.temporalRange.spanHours).toBeGreaterThan(0);

      // Quality indicators
      expect(mergeResult.validItems).toBeGreaterThan(0);
      expect(mergeResult.totalItems).toBe(
        mergeResult.validItems + mergeResult.invalidItems,
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle malformed historical data gracefully', async () => {
      // Arrange
      const malformedHistoricalBatch = createMalformedHistoricalBatch();
      const validApiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        malformedHistoricalBatch,
        validApiBatch,
      );

      // Assert - Should not throw, but handle errors gracefully
      expect(mergeResult).toBeDefined();
      expect(mergeResult.totalItems).toBeGreaterThan(0);
      expect(mergeResult.totalItems).toBeGreaterThan(0); // Should still process valid API data
    });

    it('should handle empty datasets gracefully', async () => {
      // Arrange
      const emptyHistoricalBatch = createEmptyHistoricalBatch();
      const validApiBatch = createRealisticApiBatch();

      // Act
      const mergeResult = dataMergeService.mergeTemporalData(
        emptyHistoricalBatch,
        validApiBatch,
      );

      // Assert
      expect(mergeResult).toBeDefined();
      expect(mergeResult.totalItems).toBe(
        validApiBatch.posts.length + validApiBatch.comments.length,
      );
      expect(mergeResult.validItems).toBe(mergeResult.totalItems);
      expect(
        mergeResult.sourceBreakdown[DataSourceType.PUSHSHIFT_ARCHIVE],
      ).toBe(0);
    });
  });

  // Helper functions for creating test data
  function createMockLogger() {
    return {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  function createMockHistoricalPipelineService() {
    return {
      processArchiveBatch: jest.fn(),
      extractHistoricalContent: jest.fn(),
    };
  }

  function createMockContentRetrievalService() {
    return {
      retrieveContentBatch: jest.fn(),
      transformToLLMFormat: jest.fn(),
    };
  }

  function createMockRedditDataExtractor() {
    return {
      extractSubmission: jest.fn(),
      extractComment: jest.fn(),
    };
  }

  function createMockRedditService() {
    return {
      getCompletePostWithComments: jest.fn(),
      fetchPostsBatch: jest.fn(),
    };
  }

  function createRealisticHistoricalBatch(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'hist_post_1',
          title: 'Best tacos in Austin - historical post',
          author: 'austin_foodie_2021',
          subreddit: 'austinfood',
          created_utc: 1609459200, // 2021-01-01
          score: 25,
          url: 'https://reddit.com/r/austinfood/comments/hist_post_1',
          num_comments: 15,
          selftext: 'Looking for authentic tacos near downtown...',
          permalink: '/r/austinfood/comments/hist_post_1/best_tacos_austin/',
        },
      ],
      comments: [
        {
          id: 'hist_comment_1',
          body: 'Try Veracruz All Natural - their migas tacos are incredible!',
          author: 'taco_expert_2021',
          created_utc: 1609462800, // 1 hour later
          score: 12,
          subreddit: 'austinfood',
          link_id: 't3_hist_post_1',
          permalink: '/r/austinfood/comments/hist_post_1/_/hist_comment_1/',
        },
      ],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 150,
      batchId: 'historical_batch_realistic',
      errors: [],
    };
  }

  function createRealisticApiBatch(): ApiContentBatch {
    return {
      posts: [
        {
          id: 'api_post_1',
          title: 'New BBQ spot on East Side - API post',
          author: 'bbq_lover_2023',
          subreddit: 'austinfood',
          created_utc: 1672531200, // 2023-01-01
          score: 35,
          url: 'https://reddit.com/r/austinfood/comments/api_post_1',
          selftext: 'Just opened last week, amazing brisket...',
          permalink: '/r/austinfood/comments/api_post_1/new_bbq_spot/',
        },
      ],
      comments: [
        {
          id: 'api_comment_1',
          body: 'Went there yesterday - the burnt ends are phenomenal!',
          author: 'bbq_enthusiast',
          created_utc: 1672534800, // 1 hour later
          score: 18,
          subreddit: 'austinfood',
          link_id: 't3_api_post_1',
          permalink: '/r/austinfood/comments/api_post_1/_/api_comment_1/',
        },
      ],
      sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
      collectionTimestamp: new Date(),
      batchId: 'api_batch_realistic',
    };
  }

  function createLargeHistoricalBatch(
    itemCount: number,
  ): HistoricalContentBatch {
    const submissions: CraveRedditSubmission[] = [];
    const comments: CraveRedditComment[] = [];

    const baseTimestamp = 1609459200; // 2021-01-01
    const timeIncrement = 3600; // 1 hour between items

    for (let i = 0; i < itemCount / 2; i++) {
      submissions.push({
        id: `large_post_${i}`,
        title: `Large dataset post ${i}`,
        author: `user_${i}`,
        subreddit: 'austinfood',
        created_utc: baseTimestamp + i * timeIncrement,
        score: Math.floor(Math.random() * 50) + 1,
        url: `https://reddit.com/r/austinfood/comments/large_post_${i}`,
        num_comments: Math.floor(Math.random() * 20),
        permalink: `/r/austinfood/comments/large_post_${i}/`,
      });

      comments.push({
        id: `large_comment_${i}`,
        body: `Large dataset comment ${i} - discussing food options`,
        author: `commenter_${i}`,
        created_utc: baseTimestamp + i * timeIncrement + 1800, // 30 min after post
        score: Math.floor(Math.random() * 25) + 1,
        subreddit: 'austinfood',
        link_id: `t3_large_post_${i}`,
        permalink: `/r/austinfood/comments/large_post_${i}/_/large_comment_${i}/`,
      });
    }

    return {
      submissions,
      comments,
      totalProcessed: itemCount,
      validItems: itemCount,
      invalidItems: 0,
      processingTime: itemCount * 2, // Realistic processing time
      batchId: `large_batch_${itemCount}`,
      errors: [],
    };
  }

  function createApiContentFromContentRetrieval(): ApiContentBatch {
    // Simulates output from ContentRetrievalPipelineService
    return {
      posts: [
        {
          id: 'retrieval_post_1',
          title: 'Content retrieval post - food trucks',
          author: 'food_truck_fan',
          subreddit: 'austinfood',
          created_utc: 1672617600, // 2023-01-02
          score: 22,
          url: 'https://reddit.com/r/austinfood/comments/retrieval_post_1',
          selftext: 'Best food trucks for lunch downtown?',
          permalink: '/r/austinfood/comments/retrieval_post_1/food_trucks/',
        },
      ],
      comments: [
        {
          id: 'retrieval_comment_1',
          body: "Check out Torchy's Tacos and Via 313 Pizza",
          author: 'downtown_worker',
          created_utc: 1672621200, // 1 hour later
          score: 8,
          subreddit: 'austinfood',
          link_id: 't3_retrieval_post_1',
          permalink:
            '/r/austinfood/comments/retrieval_post_1/_/retrieval_comment_1/',
        },
      ],
      sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
      collectionTimestamp: new Date(),
      batchId: 'content_retrieval_batch',
    };
  }

  function createApiBatchWithSourceType(
    sourceType: DataSourceType,
  ): ApiContentBatch {
    return {
      posts: [
        {
          id: `${sourceType}_post_1`,
          title: `${sourceType} source type post`,
          author: 'source_test_user',
          subreddit: 'austinfood',
          created_utc: 1672704000, // 2023-01-03
          score: 15,
          url: `https://reddit.com/r/austinfood/comments/${sourceType}_post_1`,
          permalink: `/r/austinfood/comments/${sourceType}_post_1/`,
        },
      ],
      comments: [
        {
          id: `${sourceType}_comment_1`,
          body: `Comment from ${sourceType} collection`,
          author: 'source_test_commenter',
          created_utc: 1672707600, // 1 hour later
          score: 6,
          subreddit: 'austinfood',
          link_id: `t3_${sourceType}_post_1`,
          permalink: `/r/austinfood/comments/${sourceType}_post_1/_/${sourceType}_comment_1/`,
        },
      ],
      sourceType,
      collectionTimestamp: new Date(),
      batchId: `${sourceType}_batch`,
    };
  }

  function createHistoricalBatchWithRealisticGap(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'gap_post_early',
          title: 'Early post before gap',
          author: 'early_user',
          subreddit: 'austinfood',
          created_utc: 1609459200, // 2021-01-01
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/gap_post_early',
          num_comments: 2,
          permalink: '/r/austinfood/comments/gap_post_early/',
        },
        {
          id: 'gap_post_late',
          title: 'Late post after gap',
          author: 'late_user',
          subreddit: 'austinfood',
          created_utc: 1641081600, // 2022-01-02 (1 year gap)
          score: 15,
          url: 'https://reddit.com/r/austinfood/comments/gap_post_late',
          num_comments: 5,
          permalink: '/r/austinfood/comments/gap_post_late/',
        },
      ],
      comments: [],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 100,
      batchId: 'gap_batch_realistic',
      errors: [],
    };
  }

  function createMalformedHistoricalBatch(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: '', // Invalid empty ID
          title: 'Malformed post',
          author: 'malformed_user',
          subreddit: 'austinfood',
          created_utc: 'invalid_timestamp' as any, // Invalid timestamp
          score: 10,
          url: '',
          num_comments: 0,
        } as any,
      ],
      comments: [],
      totalProcessed: 1,
      validItems: 0,
      invalidItems: 1,
      processingTime: 50,
      batchId: 'malformed_batch',
      errors: [
        {
          lineNumber: 1,
          itemType: 'submission',
          errorCode: 'INVALID_DATA',
          message: 'Invalid timestamp format',
        },
      ],
    };
  }

  function createEmptyHistoricalBatch(): HistoricalContentBatch {
    return {
      submissions: [],
      comments: [],
      totalProcessed: 0,
      validItems: 0,
      invalidItems: 0,
      processingTime: 0,
      batchId: 'empty_batch',
      errors: [],
    };
  }

  function isTemporallySorted(timestamps: number[]): boolean {
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        return false;
      }
    }
    return true;
  }
});
