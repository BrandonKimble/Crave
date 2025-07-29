/* eslint-disable @typescript-eslint/await-thenable */
// Reason: Test file with service method calls that may or may not return Promises

import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { LoggerService } from '../../../shared';
import { HistoricalProcessingConfig } from './historical-content-pipeline.types';

describe('HistoricalContentPipelineService', () => {
  let service: HistoricalContentPipelineService;
  let mockRedditDataExtractor: jest.Mocked<RedditDataExtractorService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockLoggerInstance = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      http: jest.fn(),
      database: jest.fn(),
      performance: jest.fn(),
      audit: jest.fn(),
      child: jest.fn(),
      setContext: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockRedditDataExtractor = {
      extractCraveSearchData: jest.fn(),
      validateExtractedData: jest.fn(),
      getOptimizationStats: jest.fn(),
      normalizeTimestamp: jest.fn(),
      hasRequiredFields: jest.fn(),
      logger: mockLoggerInstance,
    } as unknown as jest.Mocked<RedditDataExtractorService>;

    mockLogger = mockLoggerInstance;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalContentPipelineService,
        {
          provide: RedditDataExtractorService,
          useValue: mockRedditDataExtractor,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<HistoricalContentPipelineService>(
      HistoricalContentPipelineService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processBatch', () => {
    const mockConfig: HistoricalProcessingConfig = {
      batchSize: 100,
      preserveThreads: true,
      validateTimestamps: true,
      qualityFilters: {
        minScore: 0,
        excludeDeleted: true,
        excludeRemoved: true,
      },
    };

    it('should process valid Reddit submission data', async () => {
      const mockSubmission = {
        id: 'test123',
        title: 'Best Austin BBQ',
        author: 'foodie123',
        subreddit: 'austinfood',
        created_utc: 1640995200, // 2022-01-01
        score: 15,
        url: 'https://reddit.com/r/austinfood/test123',
        num_comments: 5,
        selftext: 'Looking for recommendations',
      };

      const result = await service.processBatch([mockSubmission], mockConfig);

      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe('test123');
      expect(result.submissions[0].title).toBe('Best Austin BBQ');
      expect(result.validItems).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should process valid Reddit comment data', async () => {
      const mockComment = {
        id: 'comment123',
        body: 'Try Franklin BBQ!',
        author: 'localexpert',
        subreddit: 'austinfood',
        created_utc: 1640995300,
        score: 10,
        link_id: 't3_post123',
        parent_id: 't1_parent123',
      };

      mockRedditDataExtractor.extractCraveSearchData.mockReturnValue({
        id: 'comment123',
        body: 'Try Franklin BBQ!',
        author: 'localexpert',
        subreddit: 'austinfood',
        created_utc: 1640995300,
        score: 10,
        link_id: 't3_post123',
        parent_id: 't1_parent123',
      });

      mockRedditDataExtractor.validateExtractedData.mockReturnValue({
        valid: true,
        issues: [],
      });

      const result = await service.processBatch([mockComment], mockConfig);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].id).toBe('comment123');
      expect(result.validItems).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle invalid data gracefully', async () => {
      const invalidData = { invalid: 'object' };

      const result = await service.processBatch([invalidData], mockConfig);

      expect(result.validItems).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('VALIDATION_FAILED');
    });

    it('should filter out low-score content when configured', async () => {
      const lowScoreSubmission = {
        id: 'lowscore',
        title: 'Bad food',
        author: 'critic',
        subreddit: 'austinfood',
        created_utc: 1640995200,
        score: -5,
        url: 'https://reddit.com/r/austinfood/lowscore',
        num_comments: 0,
      };

      const configWithMinScore = {
        ...mockConfig,
        qualityFilters: { ...mockConfig.qualityFilters, minScore: 0 },
      };

      const result = await service.processBatch(
        [lowScoreSubmission],
        configWithMinScore,
      );

      expect(result.validItems).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Score -5 below minimum 0');
    });

    it('should exclude deleted content when configured', async () => {
      const deletedSubmission = {
        id: 'deleted',
        title: 'Deleted post',
        author: '[deleted]',
        subreddit: 'austinfood',
        created_utc: 1640995200,
        score: 10,
        url: 'https://reddit.com/r/austinfood/deleted',
        num_comments: 0,
      };

      const result = await service.processBatch(
        [deletedSubmission],
        mockConfig,
      );

      expect(result.validItems).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Deleted submission excluded');
    });

    it('should validate timestamps when configured', async () => {
      const futureSubmission = {
        id: 'future',
        title: 'Future post',
        author: 'timetravel',
        subreddit: 'austinfood',
        created_utc: Math.floor(Date.now() / 1000) + 86400, // Tomorrow
        score: 10,
        url: 'https://reddit.com/r/austinfood/future',
        num_comments: 0,
      };

      const result = await service.processBatch([futureSubmission], mockConfig);

      expect(result.validItems).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('in the future');
    });
  });

  describe('convertToLLMFormat', () => {
    it('should convert batch to LLM input format', async () => {
      const mockBatch = {
        submissions: [
          {
            id: 'post123',
            title: 'Best BBQ in Austin',
            author: 'foodie',
            subreddit: 'austinfood',
            created_utc: 1640995200,
            score: 15,
            url: 'https://reddit.com/r/austinfood/post123',
            num_comments: 2,
            selftext: 'Looking for BBQ recommendations',
          },
        ],
        comments: [
          {
            id: 'comment1',
            body: 'Try Franklin BBQ!',
            author: 'expert',
            subreddit: 'austinfood',
            created_utc: 1640995300,
            score: 8,
            link_id: 't3_post123',
          },
          {
            id: 'comment2',
            body: 'Also check out la Barbecue',
            author: 'local',
            subreddit: 'austinfood',
            created_utc: 1640995400,
            score: 5,
            link_id: 't3_post123',
            parent_id: 't1_comment1',
          },
        ],
        totalProcessed: 3,
        validItems: 3,
        invalidItems: 0,
        processingTime: 100,
        batchId: 'test-batch',
        errors: [],
      };

      const result = await service.convertToLLMFormat(mockBatch, false);

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].post_id).toBe('post123');
      expect(result.posts[0].title).toBe('Best BBQ in Austin');
      expect(result.posts[0].comments).toHaveLength(2);
      expect(result.posts[0].comments[0].comment_id).toBe('comment1');
      expect(result.posts[0].comments[1].comment_id).toBe('comment2');
    });

    it('should handle empty batch', async () => {
      const emptyBatch = {
        submissions: [],
        comments: [],
        totalProcessed: 0,
        validItems: 0,
        invalidItems: 0,
        processingTime: 0,
        batchId: 'empty-batch',
        errors: [],
      };

      const result = await service.convertToLLMFormat(emptyBatch);

      expect(result.posts).toHaveLength(0);
    });
  });

  describe('getProcessingStats', () => {
    it('should calculate processing statistics', () => {
      const mockBatches = [
        {
          submissions: [{ id: 'sub1' } as any, { id: 'sub2' } as any],
          comments: [{ id: 'com1' } as any],
          totalProcessed: 3,
          validItems: 3,
          invalidItems: 0,
          processingTime: 100,
          batchId: 'batch1',
          errors: [
            {
              lineNumber: 1,
              itemType: 'comment' as const,
              errorCode: 'VALIDATION_ERROR',
              message: 'test',
            },
          ],
        },
        {
          submissions: [{ id: 'sub3' } as any],
          comments: [{ id: 'com2' } as any, { id: 'com3' } as any],
          totalProcessed: 3,
          validItems: 3,
          invalidItems: 0,
          processingTime: 150,
          batchId: 'batch2',
          errors: [
            {
              lineNumber: 2,
              itemType: 'submission' as const,
              errorCode: 'VALIDATION_ERROR',
              message: 'test2',
            },
          ],
        },
      ];

      const stats = service.getProcessingStats(mockBatches);

      expect(stats.totalSubmissions).toBe(3);
      expect(stats.totalComments).toBe(3);
      expect(stats.threadsProcessed).toBe(2);
      expect(stats.errors.total).toBe(2);
      expect(stats.errors.byType.VALIDATION_ERROR).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw HistoricalContentPipelineException on batch processing failure', async () => {
      // Mock an internal error during processing
      jest
        .spyOn(service as any, 'extractHistoricalItem')
        .mockRejectedValue(new Error('Internal processing error'));

      const mockConfig: HistoricalProcessingConfig = {
        batchSize: 100,
        preserveThreads: true,
        validateTimestamps: true,
        qualityFilters: {},
      };

      const result = await service.processBatch([{ test: 'data' }], mockConfig);
      expect(result.errors).toHaveLength(1);
      expect(result.validItems).toBe(0);
      expect(result.invalidItems).toBe(1);
    });

    it('should throw exception on LLM format conversion failure', async () => {
      const mockBatch = {
        submissions: [],
        comments: [],
        totalProcessed: 0,
        validItems: 0,
        invalidItems: 0,
        processingTime: 0,
        batchId: 'test-batch',
        errors: [],
      };

      // Mock an error in conversion
      jest
        .spyOn(service as any, 'convertSubmissionToLLMPost')
        .mockRejectedValue(new Error('Conversion error'));

      const result = await service.convertToLLMFormat(mockBatch);
      expect(result.posts).toEqual([]);
    });
  });
});
