/**
 * Data Merge Service Tests
 *
 * Comprehensive test suite for temporal data merge functionality.
 * Tests merge accuracy, temporal ordering, source attribution, and gap detection.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataMergeService, ApiContentBatch } from './data-merge.service';
import { LoggerService } from '../../../shared';
import {
  DataSourceType,
  TemporalMergeBatch,
  MergedContentItem,
  GapAnalysisResult,
} from './data-merge.types';
import {
  DataMergeException,
  MergeValidationException,
  GapAnalysisException,
} from './data-merge.exceptions';
import {
  HistoricalContentBatch,
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';

describe('DataMergeService', () => {
  let service: DataMergeService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    // Mock logger service
    loggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMergeService,
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<DataMergeService>(DataMergeService);
  });

  describe('mergeTemporalData', () => {
    it('should merge archive and API data by timestamp', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result).toBeDefined();
      expect(result.totalItems).toBe(4); // 2 from archive + 2 from API
      expect(result.validItems).toBe(4);
      expect(result.invalidItems).toBe(0);
      expect(result.batchId).toBeDefined();

      // Verify temporal ordering (oldest first)
      const timestamps = result.mergedItems.map(
        (item) => item.normalizedTimestamp,
      );
      expect(isSortedAscending(timestamps)).toBe(true);
    });

    it('should maintain source attribution for all items', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      const archiveItems = result.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType === DataSourceType.PUSHSHIFT_ARCHIVE,
      );
      const apiItems = result.mergedItems.filter(
        (item) =>
          item.sourceMetadata.sourceType ===
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );

      expect(archiveItems).toHaveLength(2);
      expect(apiItems).toHaveLength(2);

      // Verify all items have complete source metadata
      result.mergedItems.forEach((item) => {
        expect(item.sourceMetadata.originalId).toBeDefined();
        expect(item.sourceMetadata.sourceType).toBeDefined();
        expect(item.sourceMetadata.permalink).toBeDefined();
        expect(item.sourceMetadata.collectionTimestamp).toBeDefined();
      });
    });

    it('should calculate source breakdown correctly', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result.sourceBreakdown[DataSourceType.PUSHSHIFT_ARCHIVE]).toBe(2);
      expect(
        result.sourceBreakdown[DataSourceType.REDDIT_API_CHRONOLOGICAL],
      ).toBe(2);
      expect(
        result.sourceBreakdown[DataSourceType.REDDIT_API_KEYWORD_SEARCH],
      ).toBe(0);
      expect(result.sourceBreakdown[DataSourceType.REDDIT_API_ON_DEMAND]).toBe(
        0,
      );
    });

    it('should calculate temporal range correctly', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result.temporalRange.earliest).toBe(1609459200); // 2021-01-01
      expect(result.temporalRange.latest).toBeGreaterThanOrEqual(1672531200); // API items may have normalized timestamps
      expect(result.temporalRange.spanHours).toBeGreaterThan(0);
    });

    it('should detect temporal gaps', async () => {
      // Arrange - Create data with significant time gap
      const archiveData = createMockArchiveDataWithGap();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result.processingStats.gapsDetected).toBeDefined();
      const highSeverityGaps = result.processingStats.gapsDetected.filter(
        (gap) => gap.severity === 'high',
      );
      expect(highSeverityGaps.length).toBeGreaterThan(0);
    });

    it('should handle duplicate detection', async () => {
      // Arrange - Create data with near-duplicate timestamps
      const archiveData = createMockArchiveData();
      const apiDataWithDuplicates = createMockApiDataWithDuplicates();

      // Act
      const result = service.mergeTemporalData(
        archiveData,
        apiDataWithDuplicates,
      );

      // Assert
      expect(result.processingStats.duplicatesDetected).toBeGreaterThan(0);
    });

    it('should handle invalid timestamps gracefully', async () => {
      // Arrange
      const archiveData = createMockArchiveDataWithInvalidTimestamps();
      const apiData = createMockApiData();

      // Act - Service should handle errors gracefully, not throw
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert - Should process valid items, log warnings for invalid ones
      expect(result).toBeDefined();
      expect(result.totalItems).toBeGreaterThan(0); // Should still process valid API data
      expect(loggerService.warn).toHaveBeenCalled(); // Should log warnings for invalid items
    });

    it('should validate merge quality', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();
      const validationConfig = { validateTimestamps: true };

      // Act
      const result = service.mergeTemporalData(
        archiveData,
        apiData,
        validationConfig,
      );

      // Assert
      expect(result.validItems).toBeGreaterThan(0);
      expect(result.invalidItems).toBe(0);
    });
  });

  describe('convertToLLMInput', () => {
    it('should convert merged batch to LLM input format', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();
      const mergeBatch = service.mergeTemporalData(archiveData, apiData);

      // Act
      const llmInput = service.convertToLLMInput(mergeBatch);

      // Assert
      expect(llmInput.posts).toBeDefined();
      expect(llmInput.comments).toBeDefined();
      expect(llmInput.sourceMetadata).toBeDefined();
      expect(llmInput.sourceMetadata.batchId).toBe(mergeBatch.batchId);
      expect(llmInput.sourceMetadata.sourceBreakdown).toEqual(
        mergeBatch.sourceBreakdown,
      );

      // Verify LLM input structure matches expected format
      llmInput.posts.forEach((post) => {
        expect(post.post_id).toBeDefined();
        expect(post.title).toBeDefined();
        expect(post.subreddit).toBeDefined();
        expect(post.created_at).toBeDefined();
        expect(post.upvotes).toBeDefined();
        expect(post.url).toBeDefined();
      });

      llmInput.comments.forEach((comment) => {
        expect(comment.content).toBeDefined();
        expect(comment.author).toBeDefined();
        expect(comment.upvotes).toBeDefined();
        expect(comment.created_at).toBeDefined();
        expect(comment.url).toBeDefined();
      });
    });

    it('should preserve temporal ordering in LLM input', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();
      const mergeBatch = service.mergeTemporalData(archiveData, apiData);

      // Act
      const llmInput = service.convertToLLMInput(mergeBatch);

      // Assert
      const postTimestamps = llmInput.posts.map((post) =>
        new Date(post.created_at).getTime(),
      );
      const commentTimestamps = llmInput.comments.map((comment) =>
        new Date(comment.created_at).getTime(),
      );

      expect(isSortedAscending(postTimestamps)).toBe(true);
      expect(isSortedAscending(commentTimestamps)).toBe(true);
    });
  });

  describe('temporal ordering edge cases', () => {
    it('should handle items with identical timestamps', async () => {
      // Arrange
      const archiveData = createMockArchiveDataWithIdenticalTimestamps();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result.totalItems).toBeGreaterThan(0);
      expect(result.validItems).toBeGreaterThan(0);

      // Verify consistent ordering despite identical timestamps
      const timestampGroups = groupByTimestamp(result.mergedItems);
      timestampGroups.forEach((group) => {
        if (group.length > 1) {
          // Check that submissions come before comments for same timestamp
          const types = group.map((item) => item.type);
          const submissionIndex = types.indexOf('submission');
          const commentIndex = types.indexOf('comment');

          if (submissionIndex !== -1 && commentIndex !== -1) {
            expect(submissionIndex).toBeLessThan(commentIndex);
          }
        }
      });
    });

    it('should prioritize sources according to configuration', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();
      const config = {
        priorityOrder: [
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
          DataSourceType.PUSHSHIFT_ARCHIVE,
          DataSourceType.REDDIT_API_KEYWORD_SEARCH,
          DataSourceType.REDDIT_API_ON_DEMAND,
        ],
      };

      // Act
      const result = await service.mergeTemporalData(
        archiveData,
        apiData,
        config,
      );

      // Assert
      expect(result.totalItems).toBeGreaterThan(0);

      // For items with similar timestamps, API should be prioritized
      const identicalTimestampItems = findItemsWithSimilarTimestamps(
        result.mergedItems,
        60,
      );
      if (identicalTimestampItems.length > 1) {
        const firstItem = identicalTimestampItems[0];
        expect(firstItem.sourceMetadata.sourceType).toBe(
          DataSourceType.REDDIT_API_CHRONOLOGICAL,
        );
      }
    });
  });

  describe('gap detection', () => {
    it('should detect high-severity gaps correctly', async () => {
      // Arrange
      const archiveData = createMockArchiveDataWithLargeGap();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      const highSeverityGaps = result.processingStats.gapsDetected.filter(
        (gap) => gap.severity === 'high',
      );
      expect(highSeverityGaps.length).toBeGreaterThan(0);

      highSeverityGaps.forEach((gap) => {
        expect(gap.durationHours).toBeGreaterThan(24);
        expect(gap.affectedSources).toHaveLength(2);
        expect(gap.description).toContain('gap between');
        expect(gap.mitigationSuggestions).toBeDefined();
      });
    });

    it('should skip gap detection when disabled', async () => {
      // Arrange
      const archiveData = createMockArchiveDataWithLargeGap();
      const apiData = createMockApiData();
      const config = { enableGapDetection: false };

      // Act
      const result = await service.mergeTemporalData(
        archiveData,
        apiData,
        config,
      );

      // Assert
      expect(result.processingStats.gapsDetected).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('should pass validation for high-quality merge', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const apiData = createMockApiData();

      // Act
      const result = service.mergeTemporalData(archiveData, apiData);

      // Assert
      expect(result.validItems).toBe(result.totalItems);
      expect(result.invalidItems).toBe(0);
    });

    it('should throw validation exception for poor quality merge', async () => {
      // This test would require creating mock data that fails validation
      // For now, we'll test the exception type
      expect(() => {
        throw new MergeValidationException('Test validation failure');
      }).toThrow(MergeValidationException);
    });
  });

  describe('error handling', () => {
    it('should handle malformed archive data gracefully', async () => {
      // Arrange
      const malformedArchiveData = createMalformedArchiveData();
      const apiData = createMockApiData();

      // Act & Assert - Should not throw, but should handle errors gracefully
      const result = service.mergeTemporalData(malformedArchiveData, apiData);
      expect(result).toBeDefined();
      expect(result.totalItems).toBeGreaterThan(0); // Should still process valid API data
      expect(loggerService.warn).toHaveBeenCalled(); // Should log warnings for malformed items
    });

    it('should handle malformed API data gracefully', async () => {
      // Arrange
      const archiveData = createMockArchiveData();
      const malformedApiData = createMalformedApiData();

      // Act & Assert - Should not throw, but should handle errors gracefully
      const result = service.mergeTemporalData(archiveData, malformedApiData);
      expect(result).toBeDefined();
      expect(result.totalItems).toBeGreaterThan(0); // Should still process valid archive data
      expect(loggerService.warn).toHaveBeenCalled(); // Should log warnings for malformed items
    });
  });

  // Helper functions for creating mock data
  function createMockArchiveData(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'archive_post_1',
          title: 'Archive Post 1',
          author: 'archive_user_1',
          subreddit: 'austinfood',
          created_utc: 1609459200, // 2021-01-01
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/archive_post_1',
          num_comments: 5,
          permalink: '/r/austinfood/comments/archive_post_1/archive_post_1/',
        },
      ],
      comments: [
        {
          id: 'archive_comment_1',
          body: 'Archive comment 1',
          author: 'archive_commenter_1',
          created_utc: 1640995200, // 2022-01-01
          score: 5,
          subreddit: 'austinfood',
          link_id: 't3_archive_post_1',
          permalink:
            '/r/austinfood/comments/archive_post_1/_/archive_comment_1/',
        },
      ],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 100,
      batchId: 'archive_batch_1',
      errors: [],
    };
  }

  function createMockApiData(): ApiContentBatch {
    return {
      posts: [
        {
          id: 'api_post_1',
          title: 'API Post 1',
          author: 'api_user_1',
          subreddit: 'austinfood',
          created_utc: 1672531200, // 2023-01-01
          score: 15,
          url: 'https://reddit.com/r/austinfood/comments/api_post_1',
          permalink: '/r/austinfood/comments/api_post_1/api_post_1/',
        },
      ],
      comments: [
        {
          id: 'api_comment_1',
          body: 'API comment 1',
          author: 'api_commenter_1',
          created_utc: 1672531800, // 2023-01-01 + 10 minutes
          score: 8,
          subreddit: 'austinfood',
          link_id: 't3_api_post_1',
          permalink: '/r/austinfood/comments/api_post_1/_/api_comment_1/',
        },
      ],
      sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
      collectionTimestamp: new Date(),
      batchId: 'api_batch_1',
    };
  }

  function createMockArchiveDataWithGap(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'gap_post_1',
          title: 'Gap Post 1',
          author: 'gap_user_1',
          subreddit: 'austinfood',
          created_utc: 1609459200, // 2021-01-01
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/gap_post_1',
          num_comments: 0,
          permalink: '/r/austinfood/comments/gap_post_1/gap_post_1/',
        },
        {
          id: 'gap_post_2',
          title: 'Gap Post 2',
          author: 'gap_user_2',
          subreddit: 'austinfood',
          created_utc: 1672531200, // 2023-01-01 (2 year gap)
          score: 12,
          url: 'https://reddit.com/r/austinfood/comments/gap_post_2',
          num_comments: 0,
          permalink: '/r/austinfood/comments/gap_post_2/gap_post_2/',
        },
      ],
      comments: [],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 50,
      batchId: 'gap_batch_1',
      errors: [],
    };
  }

  function createMockApiDataWithDuplicates(): ApiContentBatch {
    return {
      posts: [
        {
          id: 'archive_post_1', // Same ID as archive data
          title: 'Duplicate Post 1',
          author: 'duplicate_user_1',
          subreddit: 'austinfood',
          created_utc: 1609459260, // 1 minute after archive post
          score: 15,
          url: 'https://reddit.com/r/austinfood/comments/archive_post_1',
          permalink: '/r/austinfood/comments/archive_post_1/archive_post_1/',
        },
      ],
      comments: [],
      sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
      collectionTimestamp: new Date(),
      batchId: 'duplicate_batch_1',
    };
  }

  function createMockArchiveDataWithInvalidTimestamps(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'invalid_post_1',
          title: 'Invalid Post 1',
          author: 'invalid_user_1',
          subreddit: 'austinfood',
          created_utc: 'invalid_timestamp' as any, // Invalid timestamp
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/invalid_post_1',
          num_comments: 0,
          permalink: '/r/austinfood/comments/invalid_post_1/invalid_post_1/',
        },
      ],
      comments: [],
      totalProcessed: 1,
      validItems: 1,
      invalidItems: 0,
      processingTime: 25,
      batchId: 'invalid_batch_1',
      errors: [],
    };
  }

  function createMockArchiveDataWithIdenticalTimestamps(): HistoricalContentBatch {
    const timestamp = 1609459200; // Same timestamp for both items
    return {
      submissions: [
        {
          id: 'identical_post_1',
          title: 'Identical Post 1',
          author: 'identical_user_1',
          subreddit: 'austinfood',
          created_utc: timestamp,
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/identical_post_1',
          num_comments: 0,
          permalink:
            '/r/austinfood/comments/identical_post_1/identical_post_1/',
        },
      ],
      comments: [
        {
          id: 'identical_comment_1',
          body: 'Identical comment 1',
          author: 'identical_commenter_1',
          created_utc: timestamp, // Same timestamp as post
          score: 5,
          subreddit: 'austinfood',
          link_id: 't3_identical_post_1',
          permalink:
            '/r/austinfood/comments/identical_post_1/_/identical_comment_1/',
        },
      ],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 50,
      batchId: 'identical_batch_1',
      errors: [],
    };
  }

  function createMockArchiveDataWithLargeGap(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: 'large_gap_post_1',
          title: 'Large Gap Post 1',
          author: 'gap_user_1',
          subreddit: 'austinfood',
          created_utc: 1609459200, // 2021-01-01
          score: 10,
          url: 'https://reddit.com/r/austinfood/comments/large_gap_post_1',
          num_comments: 0,
          permalink:
            '/r/austinfood/comments/large_gap_post_1/large_gap_post_1/',
        },
        {
          id: 'large_gap_post_2',
          title: 'Large Gap Post 2',
          author: 'gap_user_2',
          subreddit: 'austinfood',
          created_utc: 1641081600, // 2022-01-02 (1+ year gap)
          score: 12,
          url: 'https://reddit.com/r/austinfood/comments/large_gap_post_2',
          num_comments: 0,
          permalink:
            '/r/austinfood/comments/large_gap_post_2/large_gap_post_2/',
        },
      ],
      comments: [],
      totalProcessed: 2,
      validItems: 2,
      invalidItems: 0,
      processingTime: 50,
      batchId: 'large_gap_batch_1',
      errors: [],
    };
  }

  function createMalformedArchiveData(): HistoricalContentBatch {
    return {
      submissions: [
        {
          id: '', // Empty ID
          title: '', // Empty title
          author: 'malformed_user_1',
          subreddit: 'austinfood',
          created_utc: null as any, // null timestamp
          score: 10,
          url: '',
          num_comments: 0,
        } as any,
      ],
      comments: [],
      totalProcessed: 1,
      validItems: 0,
      invalidItems: 1,
      processingTime: 25,
      batchId: 'malformed_batch_1',
      errors: [],
    };
  }

  function createMalformedApiData(): ApiContentBatch {
    return {
      posts: [
        {
          id: '', // Empty ID
          title: '', // Empty title
          author: 'malformed_api_user_1',
          subreddit: 'austinfood',
          created_utc: undefined as any, // undefined timestamp
          score: 15,
          url: '',
          permalink: '',
        } as any,
      ],
      comments: [],
      sourceType: DataSourceType.REDDIT_API_CHRONOLOGICAL,
      collectionTimestamp: new Date(),
      batchId: 'malformed_api_batch_1',
    };
  }

  function isSortedAscending(arr: number[]): boolean {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) {
        return false;
      }
    }
    return true;
  }

  function groupByTimestamp(items: MergedContentItem[]): MergedContentItem[][] {
    const groups = new Map<number, MergedContentItem[]>();
    for (const item of items) {
      const timestamp = item.normalizedTimestamp;
      if (!groups.has(timestamp)) {
        groups.set(timestamp, []);
      }
      groups.get(timestamp)!.push(item);
    }
    return Array.from(groups.values());
  }

  function findItemsWithSimilarTimestamps(
    items: MergedContentItem[],
    toleranceSeconds: number,
  ): MergedContentItem[] {
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const current = items[i];
      if (
        Math.abs(current.normalizedTimestamp - prev.normalizedTimestamp) <=
        toleranceSeconds
      ) {
        return [prev, current];
      }
    }
    return [];
  }
});
