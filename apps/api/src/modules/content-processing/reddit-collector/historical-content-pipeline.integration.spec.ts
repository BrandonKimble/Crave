import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { LoggerService } from '../../../shared';
import { HistoricalProcessingConfig } from './historical-content-pipeline.types';

describe('HistoricalContentPipelineService Integration', () => {
  let service: HistoricalContentPipelineService;

  beforeEach(async () => {
    const mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      audit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalContentPipelineService,
        RedditDataExtractorService,
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

  describe('End-to-End Historical Content Processing', () => {
    it('should process sample Austin food Reddit data end-to-end', async () => {
      // Sample Reddit data similar to what would come from Pushshift archives
      const sampleRedditData = [
        // Sample submission from r/austinfood
        {
          id: 'abc123',
          title: 'Best BBQ in East Austin?',
          selftext:
            'Moving to East Austin and looking for great BBQ recommendations. What are your favorites?',
          author: 'austinfoodie',
          subreddit: 'austinfood',
          created_utc: 1640995200, // 2022-01-01 00:00:00 UTC
          score: 25,
          num_comments: 15,
          url: 'https://www.reddit.com/r/austinfood/comments/abc123/best_bbq_in_east_austin/',
          permalink: '/r/austinfood/comments/abc123/best_bbq_in_east_austin/',
          over_18: false,
          stickied: false,
        },
        // Sample comments
        {
          id: 'def456',
          body: 'Franklin BBQ is absolutely amazing! Worth the wait.',
          author: 'bbqlover',
          subreddit: 'austinfood',
          created_utc: 1640995800, // 10 minutes later
          score: 18,
          link_id: 't3_abc123',
          parent_id: null, // Top-level comment
          permalink:
            '/r/austinfood/comments/abc123/best_bbq_in_east_austin/def456/',
        },
        {
          id: 'ghi789',
          body: 'la Barbecue is also fantastic and usually has shorter lines than Franklin.',
          author: 'localexpert',
          subreddit: 'austinfood',
          created_utc: 1640996100, // 5 minutes after first comment
          score: 12,
          link_id: 't3_abc123',
          parent_id: 't1_def456', // Reply to first comment
          permalink:
            '/r/austinfood/comments/abc123/best_bbq_in_east_austin/ghi789/',
        },
        {
          id: 'jkl012',
          body: "Agreed on la Barbecue! Elizabeth Chambers (Franklin's former pitmaster) really knows her stuff.",
          author: 'bbqhistorian',
          subreddit: 'austinfood',
          created_utc: 1640996400, // 5 minutes later
          score: 8,
          link_id: 't3_abc123',
          parent_id: 't1_ghi789', // Reply to second comment
          permalink:
            '/r/austinfood/comments/abc123/best_bbq_in_east_austin/jkl012/',
        },
        // Another top-level comment
        {
          id: 'mno345',
          body: 'Micklethwait Craft Meats is a hidden gem! Great brisket and sausages.',
          author: 'hiddengemfinder',
          subreddit: 'austinfood',
          created_utc: 1640996700, // A bit later
          score: 15,
          link_id: 't3_abc123',
          parent_id: null, // Top-level comment
          permalink:
            '/r/austinfood/comments/abc123/best_bbq_in_east_austin/mno345/',
        },
      ];

      const config: HistoricalProcessingConfig = {
        batchSize: 100,
        preserveThreads: true,
        validateTimestamps: true,
        timestampRange: {
          start: 1640995000, // Slightly before our test data
          end: 1640997000, // Slightly after our test data
        },
        qualityFilters: {
          minScore: 5, // Filter out low-quality content
          excludeDeleted: true,
          excludeRemoved: true,
        },
      };

      // Process the batch
      const batch = await service.processBatch(sampleRedditData, config);

      // Verify processing results
      expect(batch.totalProcessed).toBe(5);
      expect(batch.validItems).toBe(5); // All items should be valid
      expect(batch.invalidItems).toBe(0);
      expect(batch.errors).toHaveLength(0);

      // Verify submissions
      expect(batch.submissions).toHaveLength(1);
      expect(batch.submissions[0].id).toBe('abc123');
      expect(batch.submissions[0].title).toBe('Best BBQ in East Austin?');
      expect(batch.submissions[0].subreddit).toBe('austinfood');

      // Verify comments
      expect(batch.comments).toHaveLength(4);
      const commentIds = batch.comments.map((c) => c.id);
      expect(commentIds).toContain('def456');
      expect(commentIds).toContain('ghi789');
      expect(commentIds).toContain('jkl012');
      expect(commentIds).toContain('mno345');

      // Convert to LLM format
      const llmInput = await service.convertToLLMFormat(batch, false);

      // Verify LLM format structure
      expect(llmInput.posts).toHaveLength(1);

      const llmPost = llmInput.posts[0];
      expect(llmPost.post_id).toBe('abc123');
      expect(llmPost.title).toBe('Best BBQ in East Austin?');
      expect(llmPost.subreddit).toBe('austinfood');
      expect(llmPost.comments).toHaveLength(4);

      // Verify LLM comments format
      expect(llmPost.comments[0].comment_id).toBe('def456');
      expect(llmPost.comments[0].content).toBe(
        'Franklin BBQ is absolutely amazing! Worth the wait.',
      );
      expect(llmPost.comments[0].upvotes).toBe(18);
      expect(llmPost.comments[0].parent_id).toBeNull(); // Top-level comment

      // Verify thread relationships are preserved
      const replyComment = llmPost.comments.find(
        (c) => c.comment_id === 'ghi789',
      );
      expect(replyComment).toBeDefined();
      expect(replyComment!.parent_id).toBe('t1_def456');

      // Verify timestamps are properly converted
      expect(llmPost.created_at).toBe('2022-01-01T00:00:00.000Z');
      expect(llmPost.comments[0].created_at).toBe('2022-01-01T00:10:00.000Z');
    });

    it('should handle mixed quality content with filtering', async () => {
      const mixedQualityData = [
        // High-quality submission
        {
          id: 'good_post',
          title: 'Excellent taco recommendations',
          author: 'tacomaster',
          subreddit: 'austinfood',
          created_utc: 1640995200,
          score: 50,
          num_comments: 10,
          url: 'https://reddit.com/r/austinfood/good_post',
        },
        // Low-quality submission (will be filtered)
        {
          id: 'bad_post',
          title: 'This place sucks',
          author: 'complainer',
          subreddit: 'austinfood',
          created_utc: 1640995300,
          score: -5,
          num_comments: 2,
          url: 'https://reddit.com/r/austinfood/bad_post',
        },
        // Deleted submission (will be filtered)
        {
          id: 'deleted_post',
          title: 'Deleted recommendation',
          author: '[deleted]',
          subreddit: 'austinfood',
          created_utc: 1640995400,
          score: 10,
          num_comments: 0,
          url: 'https://reddit.com/r/austinfood/deleted_post',
        },
        // Good comment
        {
          id: 'good_comment',
          body: 'Suerte is incredible for tacos!',
          author: 'localfoodie',
          subreddit: 'austinfood',
          created_utc: 1640995500,
          score: 20,
          link_id: 't3_good_post',
        },
        // Removed comment (will be filtered)
        {
          id: 'removed_comment',
          body: '[removed]',
          author: 'moderator',
          subreddit: 'austinfood',
          created_utc: 1640995600,
          score: 1,
          link_id: 't3_good_post',
        },
      ];

      const strictConfig: HistoricalProcessingConfig = {
        batchSize: 100,
        preserveThreads: true,
        validateTimestamps: true,
        qualityFilters: {
          minScore: 0, // Filter negative scores
          excludeDeleted: true,
          excludeRemoved: true,
        },
      };

      const batch = await service.processBatch(mixedQualityData, strictConfig);

      // Should only have high-quality content
      expect(batch.totalProcessed).toBe(5);
      expect(batch.validItems).toBe(2); // Only good_post and good_comment
      expect(batch.invalidItems).toBe(3); // bad_post, deleted_post, removed_comment

      expect(batch.submissions).toHaveLength(1);
      expect(batch.submissions[0].id).toBe('good_post');

      expect(batch.comments).toHaveLength(1);
      expect(batch.comments[0].id).toBe('good_comment');

      // Verify error reporting
      expect(batch.errors).toHaveLength(3);
      const errorMessages = batch.errors.map((e) => e.message);
      expect(
        errorMessages.some((msg) => msg.includes('Score -5 below minimum')),
      ).toBe(true);
      expect(
        errorMessages.some((msg) =>
          msg.includes('Deleted submission excluded'),
        ),
      ).toBe(true);
      expect(
        errorMessages.some((msg) => msg.includes('Removed comment excluded')),
      ).toBe(true);
    });

    it('should handle timestamp validation edge cases', async () => {
      const timestampTestData = [
        // Valid timestamp
        {
          id: 'valid_time',
          title: 'Valid post',
          author: 'user1',
          subreddit: 'austinfood',
          created_utc: 1640995200, // Valid 2022 timestamp
          score: 10,
          num_comments: 0,
          url: 'https://reddit.com/valid',
        },
        // Pre-Reddit timestamp (invalid)
        {
          id: 'pre_reddit',
          title: 'Time travel post',
          author: 'timetravel',
          subreddit: 'austinfood',
          created_utc: 1000000000, // Before Reddit existed (2001)
          score: 10,
          num_comments: 0,
          url: 'https://reddit.com/pre_reddit',
        },
        // Future timestamp (invalid)
        {
          id: 'future_post',
          title: 'Future post',
          author: 'prophet',
          subreddit: 'austinfood',
          created_utc: Math.floor(Date.now() / 1000) + 86400, // Tomorrow
          score: 10,
          num_comments: 0,
          url: 'https://reddit.com/future',
        },
      ];

      const timestampConfig: HistoricalProcessingConfig = {
        batchSize: 100,
        preserveThreads: false,
        validateTimestamps: true,
        qualityFilters: {},
      };

      const batch = await service.processBatch(
        timestampTestData,
        timestampConfig,
      );

      expect(batch.totalProcessed).toBe(3);
      expect(batch.validItems).toBe(1); // Only valid_time
      expect(batch.invalidItems).toBe(2);

      expect(batch.submissions).toHaveLength(1);
      expect(batch.submissions[0].id).toBe('valid_time');

      expect(batch.errors).toHaveLength(2);
      const errorMessages = batch.errors.map((e) => e.message);
      expect(
        errorMessages.some((msg) => msg.includes('before Reddit founding')),
      ).toBe(true);
      expect(errorMessages.some((msg) => msg.includes('in the future'))).toBe(
        true,
      );
    });

    it('should generate comprehensive processing statistics', async () => {
      const multipleProcessingBatches = [
        await service.processBatch(
          [
            {
              id: 'post1',
              title: 'Post 1',
              author: 'user1',
              subreddit: 'austinfood',
              created_utc: 1640995200,
              score: 10,
              num_comments: 2,
              url: 'https://reddit.com/post1',
            },
            {
              id: 'comment1',
              body: 'Comment 1',
              author: 'user2',
              subreddit: 'austinfood',
              created_utc: 1640995300,
              score: 5,
              link_id: 't3_post1',
            },
          ],
          {
            batchSize: 100,
            preserveThreads: false,
            validateTimestamps: false,
            qualityFilters: {},
          },
        ),
        await service.processBatch(
          [
            {
              id: 'post2',
              title: 'Post 2',
              author: 'user3',
              subreddit: 'austinfood',
              created_utc: 1640995400,
              score: 15,
              num_comments: 1,
              url: 'https://reddit.com/post2',
            },
          ],
          {
            batchSize: 100,
            preserveThreads: false,
            validateTimestamps: false,
            qualityFilters: {},
          },
        ),
      ];

      const stats = service.getProcessingStats(multipleProcessingBatches);

      expect(stats.totalSubmissions).toBe(2);
      expect(stats.totalComments).toBe(1);
      expect(stats.threadsProcessed).toBe(2);
      expect(stats.validSubmissions).toBe(2);
      expect(stats.validComments).toBe(1);
    });
  });
});
