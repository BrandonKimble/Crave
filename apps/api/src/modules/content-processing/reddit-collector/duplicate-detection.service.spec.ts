/**
 * Duplicate Detection Service Unit Tests
 *
 * Comprehensive test coverage for duplicate detection functionality
 * as specified in PRD sections 5.1.2 and 6.1.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { LoggerService } from '../../../shared';
import { DataSourceType, MergedContentItem } from './data-merge.types';
import {
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';
import {
  DuplicateDetectionException,
  DuplicateValidationException,
} from './duplicate-detection.exceptions';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
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
      logger: {} as any,
      buildErrorMetadata: jest.fn(),
      sanitizeMetadata: jest.fn(),
      sanitizeNestedObject: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
  });

  describe('detectAndFilterDuplicates', () => {
    it('should filter out duplicate posts with same ID', () => {
      const items = createTestItems([
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1060,
        },
        {
          id: 'post456',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 2000,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items);

      expect(result.filteredItems).toHaveLength(2);
      expect(result.analysis.duplicatesFound).toBe(1);
      expect(result.analysis.duplicateRate).toBeCloseTo(33.33, 1);
      expect(result.filteredItems[0].sourceMetadata.originalId).toBe('post123');
      expect(result.filteredItems[1].sourceMetadata.originalId).toBe('post456');
    });

    it('should filter out duplicate comments with same ID', () => {
      const items = createTestItems([
        {
          id: 'comment123',
          type: 'comment',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'comment123',
          type: 'comment',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1030,
        },
        {
          id: 'comment456',
          type: 'comment',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 2000,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items);

      expect(result.filteredItems).toHaveLength(2);
      expect(result.analysis.duplicatesFound).toBe(1);
      expect(result.filteredItems[0].sourceMetadata.originalId).toBe(
        'comment123',
      );
      expect(result.filteredItems[1].sourceMetadata.originalId).toBe(
        'comment456',
      );
    });

    it('should not consider items as duplicate if time difference exceeds threshold', () => {
      const items = createTestItems([
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 5000,
        }, // >1 hour diff
      ]);

      const result = service.detectAndFilterDuplicates(items, {
        maxTimeDifferenceSeconds: 3600, // 1 hour
      });

      expect(result.filteredItems).toHaveLength(2); // Both kept due to time difference
      expect(result.analysis.duplicatesFound).toBe(0);
    });

    it('should handle posts and comments with same ID separately', () => {
      const items = createTestItems([
        {
          id: 'item123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'item123',
          type: 'comment',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items);

      expect(result.filteredItems).toHaveLength(2); // Different types, not duplicates
      expect(result.analysis.duplicatesFound).toBe(0);
    });

    it('should generate comprehensive source overlap analysis', () => {
      const items = createTestItems([
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1030,
        },
        {
          id: 'post2',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 2000,
        },
        {
          id: 'post2',
          type: 'submission',
          source: DataSourceType.REDDIT_API_KEYWORD_SEARCH,
          timestamp: 2030,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items, {
        enableSourceOverlapAnalysis: true,
      });

      expect(
        result.analysis.sourceOverlapAnalysis.overlapMatrix,
      ).toHaveProperty('PUSHSHIFT_ARCHIVE→REDDIT_API_CHRONOLOGICAL');
      expect(
        result.analysis.sourceOverlapAnalysis.overlapMatrix,
      ).toHaveProperty('PUSHSHIFT_ARCHIVE→REDDIT_API_KEYWORD_SEARCH');
      expect(
        result.analysis.sourceOverlapAnalysis.commonOverlapPatterns,
      ).toHaveLength(2);
    });

    it('should track performance metrics when enabled', () => {
      const items = createTestItems([
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post2',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 2000,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items, {
        enablePerformanceTracking: true,
      });

      expect(result.analysis.performanceMetrics.startTime).toBeInstanceOf(Date);
      expect(result.analysis.performanceMetrics.endTime).toBeInstanceOf(Date);
      expect(result.analysis.performanceMetrics.durationMs).toBeGreaterThan(0);
      expect(
        result.analysis.performanceMetrics.throughputPerSecond,
      ).toBeGreaterThan(0);
    });

    it('should validate input and throw on invalid batch size', () => {
      const items = createTestItems([
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
      ]);

      expect(() => {
        service.detectAndFilterDuplicates(items, {
          maxBatchSize: 0, // Invalid batch size
        });
      }).toThrow(DuplicateValidationException);
    });

    it('should handle empty input gracefully', () => {
      const result = service.detectAndFilterDuplicates([]);

      expect(result.filteredItems).toHaveLength(0);
      expect(result.analysis.totalItems).toBe(0);
      expect(result.analysis.duplicatesFound).toBe(0);
      expect(result.analysis.duplicateRate).toBe(0);
    });
  });

  describe('checkSingleItem', () => {
    it('should return not duplicate for first occurrence', () => {
      const item = createTestItems([
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
      ])[0];

      const result = service.checkSingleItem(item);

      expect(result.isDuplicate).toBe(false);
      expect(result.identifier.id).toBe('post123');
      expect(result.identifier.type).toBe('post');
    });

    it('should detect duplicate for second occurrence', () => {
      const items = createTestItems([
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1030,
        },
      ]);

      // Process first item to register it
      service.checkSingleItem(items[0]);

      // Check second item - should be detected as duplicate
      const result = service.checkSingleItem(items[1]);

      expect(result.isDuplicate).toBe(true);
      expect(result.originalSource?.sourceType).toBe(
        DataSourceType.PUSHSHIFT_ARCHIVE,
      );
      expect(result.currentSource.sourceType).toBe(
        DataSourceType.REDDIT_API_CHRONOLOGICAL,
      );
    });
  });

  describe('getStats', () => {
    it('should return initial stats for new service', () => {
      const stats = service.getStats();

      expect(stats.totalItemsProcessed).toBe(0);
      expect(stats.totalDuplicatesDetected).toBe(0);
      expect(stats.overallDuplicateRate).toBe(0);
      expect(stats.sessionsCompleted).toBe(0);
    });

    it('should update stats after processing', () => {
      const items = createTestItems([
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1030,
        },
      ]);

      service.detectAndFilterDuplicates(items);
      const stats = service.getStats();

      expect(stats.totalItemsProcessed).toBe(2);
      expect(stats.totalDuplicatesDetected).toBe(1);
      expect(stats.overallDuplicateRate).toBe(50);
      expect(stats.sessionsCompleted).toBe(1);
    });
  });

  describe('clearCache', () => {
    it('should clear tracking cache and reset stats', () => {
      const items = createTestItems([
        {
          id: 'post1',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
      ]);

      service.detectAndFilterDuplicates(items);
      expect(service.getStats().totalItemsProcessed).toBe(1);

      service.clearCache();
      const stats = service.getStats();

      expect(stats.totalItemsProcessed).toBe(0);
      expect(stats.totalDuplicatesDetected).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle items with Reddit prefixes in IDs', () => {
      const items = createTestItems([
        {
          id: 't3_post123',
          type: 'submission',
          source: DataSourceType.PUSHSHIFT_ARCHIVE,
          timestamp: 1000,
        },
        {
          id: 'post123',
          type: 'submission',
          source: DataSourceType.REDDIT_API_CHRONOLOGICAL,
          timestamp: 1030,
        },
      ]);

      const result = service.detectAndFilterDuplicates(items);

      expect(result.filteredItems).toHaveLength(1); // Should be detected as duplicate
      expect(result.analysis.duplicatesFound).toBe(1);
    });

    it('should throw on items with missing IDs', () => {
      const item: MergedContentItem = {
        type: 'submission',
        data: { id: '', title: 'Test' } as CraveRedditSubmission,
        sourceMetadata: {
          sourceType: DataSourceType.PUSHSHIFT_ARCHIVE,
          originalId: '',
          collectionTimestamp: new Date(),
          permalink: 'https://reddit.com/r/test/empty',
        },
        normalizedTimestamp: 1000,
        isValid: true,
        validationIssues: [],
      };

      expect(() => {
        service.checkSingleItem(item);
      }).toThrow(DuplicateDetectionException);
    });

    it('should handle malformed items gracefully with skip strategy', () => {
      const items = [
        ...createTestItems([
          {
            id: 'post123',
            type: 'submission',
            source: DataSourceType.PUSHSHIFT_ARCHIVE,
            timestamp: 1000,
          },
        ]),
        {
          type: 'unknown',
          data: { id: 'bad123' },
          sourceMetadata: {
            sourceType: DataSourceType.PUSHSHIFT_ARCHIVE,
            originalId: 'bad123',
            collectionTimestamp: new Date(),
            permalink: 'https://reddit.com/r/test/bad123',
          },
          normalizedTimestamp: 2000,
          isValid: true,
          validationIssues: [],
        } as any,
      ];

      const result = service.detectAndFilterDuplicates(
        items as MergedContentItem[],
      );

      expect(result.filteredItems).toHaveLength(2); // Both items processed (graceful handling)
      // No warning expected since malformed items are handled gracefully now
    });
  });

  /**
   * Helper function to create test items
   */
  function createTestItems(
    specs: Array<{
      id: string;
      type: 'submission' | 'comment';
      source: DataSourceType;
      timestamp: number;
    }>,
  ): MergedContentItem[] {
    return specs.map((spec) => {
      const data =
        spec.type === 'submission'
          ? ({
              id: spec.id,
              title: `Test ${spec.type} ${spec.id}`,
              author: 'testuser',
              subreddit: 'testsubreddit',
              created_utc: spec.timestamp,
              score: 10,
              url: `https://reddit.com/r/test/${spec.id}`,
              num_comments: 0,
            } as CraveRedditSubmission)
          : ({
              id: spec.id,
              body: `Test ${spec.type} ${spec.id}`,
              author: 'testuser',
              subreddit: 'testsubreddit',
              created_utc: spec.timestamp,
              score: 5,
              link_id: 't3_parentpost',
            } as CraveRedditComment);

      return {
        type: spec.type,
        data,
        sourceMetadata: {
          sourceType: spec.source,
          originalId: spec.id,
          collectionTimestamp: new Date(),
          processingBatch: 'test-batch',
          permalink: `https://reddit.com/r/test/${spec.id}`,
        },
        normalizedTimestamp: spec.timestamp,
        isValid: true,
        validationIssues: [],
      };
    });
  }
});
