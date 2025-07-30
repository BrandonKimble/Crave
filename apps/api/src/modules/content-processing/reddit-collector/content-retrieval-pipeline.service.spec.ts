import { Test, TestingModule } from '@nestjs/testing';
import { ContentRetrievalPipelineService } from './content-retrieval-pipeline.service';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { LoggerService } from '../../../shared';

describe('ContentRetrievalPipelineService', () => {
  let service: ContentRetrievalPipelineService;
  let redditService: jest.Mocked<RedditService>;

  beforeEach(async () => {
    const mockRedditService = {
      fetchPostsBatch: jest.fn(),
    };

    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRetrievalPipelineService,
        {
          provide: RedditService,
          useValue: mockRedditService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<ContentRetrievalPipelineService>(
      ContentRetrievalPipelineService,
    );
    redditService = module.get(RedditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieveContentForLLM', () => {
    it('should retrieve and transform content successfully', async () => {
      const mockBatchResult = {
        posts: {
          post1: {
            id: 'post1',
            title: 'Test Post',
            selftext: 'Test content',
            subreddit: 'austinfood',
            score: 10,
            created_utc: 1640995200,
          },
        },
        comments: {
          post1: [
            {
              data: {
                id: 'comment1',
                body: 'Great food!',
                author: 'testuser',
                score: 5,
                created_utc: 1640995300,
                parent_id: 't3_post1',
              },
            },
          ],
        },
        metadata: {
          totalPosts: 1,
          totalComments: 1,
          successfulRetrievals: 1,
          failedRetrievals: 0,
          rateLimitStatus: {
            allowed: true,
            retryAfter: 0,
            currentUsage: 1,
            limit: 100,
            resetTime: new Date(),
          },
        },
        performance: {
          totalResponseTime: 1000,
          averageResponseTime: 1000,
          apiCallsUsed: 1,
          rateLimitHits: 0,
        },
        attribution: {
          postUrls: { post1: 'https://reddit.com/r/austinfood/post1' },
          commentUrls: { post1: ['https://reddit.com/comment1'] },
        },
        errors: {},
      };

      redditService.fetchPostsBatch.mockResolvedValue(mockBatchResult);

      const result = await service.retrieveContentForLLM('austinfood', [
        'post1',
      ]);

      expect(result.llmInput.posts).toHaveLength(1);
      expect(result.llmInput.posts[0].post_id).toBe('post1');
      expect(result.llmInput.posts[0].comments).toHaveLength(1);
      expect(result.metadata.totalPosts).toBe(1);
      expect(result.metadata.totalComments).toBe(1);
    });

    it('should handle empty results', async () => {
      const mockBatchResult = {
        posts: {},
        comments: {},
        metadata: {
          totalPosts: 1,
          totalComments: 0,
          successfulRetrievals: 0,
          failedRetrievals: 1,
          rateLimitStatus: {
            allowed: true,
            retryAfter: 0,
            currentUsage: 1,
            limit: 100,
            resetTime: new Date(),
          },
        },
        performance: {
          totalResponseTime: 1000,
          averageResponseTime: 1000,
          apiCallsUsed: 1,
          rateLimitHits: 0,
        },
        attribution: {
          postUrls: {},
          commentUrls: {},
        },
        errors: { post1: 'Not found' },
      };

      redditService.fetchPostsBatch.mockResolvedValue(mockBatchResult);

      await expect(
        service.retrieveContentForLLM('austinfood', ['post1']),
      ).rejects.toThrow('No valid posts retrieved for LLM processing');
    });
  });

  describe('retrieveSinglePostForLLM', () => {
    it('should retrieve single post successfully', async () => {
      const mockBatchResult = {
        posts: {
          post1: {
            id: 'post1',
            title: 'Test Post',
            selftext: 'Test content',
            subreddit: 'austinfood',
            score: 10,
            created_utc: 1640995200,
          },
        },
        comments: {
          post1: [],
        },
        metadata: {
          totalPosts: 1,
          totalComments: 0,
          successfulRetrievals: 1,
          failedRetrievals: 0,
          rateLimitStatus: {
            allowed: true,
            retryAfter: 0,
            currentUsage: 1,
            limit: 100,
            resetTime: new Date(),
          },
        },
        performance: {
          totalResponseTime: 1000,
          averageResponseTime: 1000,
          apiCallsUsed: 1,
          rateLimitHits: 0,
        },
        attribution: {
          postUrls: { post1: 'https://reddit.com/r/austinfood/post1' },
          commentUrls: { post1: [] },
        },
        errors: {},
      };

      redditService.fetchPostsBatch.mockResolvedValue(mockBatchResult);

      const result = await service.retrieveSinglePostForLLM(
        'austinfood',
        'post1',
      );

      expect(result.llmInput.posts).toHaveLength(1);
      expect(result.llmInput.posts[0].post_id).toBe('post1');
      expect(result.metadata.totalComments).toBe(0);
      expect(result.performance.rateLimitHit).toBe(false);
    });
  });
});
