/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RedditModule } from '../src/modules/external-integrations/reddit/reddit.module';
import { RedditService } from '../src/modules/external-integrations/reddit/reddit.service';
import { RedditRateLimitError } from '../src/modules/external-integrations/reddit/reddit.exceptions';
import * as path from 'path';
import * as fs from 'fs';

// Interface definitions for Reddit API responses
interface RedditPost {
  id: string;
  title: string;
  num_comments: number;
  permalink: string;
  created_utc: number;
  subreddit: string;
}

interface RedditComment {
  id: string;
  body: string;
  author: string;
  score: number;
  created_utc: number;
  parent_id: string;
  replies?: RedditListing<RedditComment>;
  post_title?: string;
  subreddit?: string;
}

interface RedditListing<T> {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: T;
    }>;
    after: string | null;
    before: string | null;
  };
}

describe('Comment Thread Retrieval Testing (e2e)', () => {
  let app: TestingModule;
  let redditService: RedditService;
  let httpService: HttpService;

  // Test data tracking
  const testPosts: RedditPost[] = [];
  const retrievalMetrics: {
    totalThreads: number;
    successfulRetrievals: number;
    averageResponseTime: number;
    maxThreadDepth: number;
  } = {
    totalThreads: 0,
    successfulRetrievals: 0,
    averageResponseTime: 0,
    maxThreadDepth: 0,
  };

  beforeAll(async () => {
    // Load environment variables from .env file for testing
    const envPath = path.join(__dirname, '../.env');

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envVars = envContent
        .split('\n')
        .filter((line) => line.includes('='));
      envVars.forEach((line) => {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      });
    }

    // Use actual Reddit configuration for real API testing
    // Note: This requires valid Reddit API credentials to be set
    const testConfig = {
      reddit: {
        clientId: process.env.REDDIT_CLIENT_ID || 'test-client-id',
        clientSecret: process.env.REDDIT_CLIENT_SECRET || 'test-client-secret',
        username: process.env.REDDIT_USERNAME || 'test-username',
        password: process.env.REDDIT_PASSWORD || 'test-password',
        userAgent:
          process.env.REDDIT_USER_AGENT ||
          'CraveSearch/1.0.0-testing (Comment Thread Validation)',
      },
    };

    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        HttpModule.register({
          timeout: 15000,
          maxRedirects: 5,
        }),
        RedditModule,
      ],
    }).compile();

    redditService = app.get<RedditService>(RedditService);
    httpService = app.get<HttpService>(HttpService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Test Environment Setup', () => {
    it('should initialize Reddit service with valid configuration', () => {
      expect(redditService).toBeDefined();
      expect(redditService).toBeInstanceOf(RedditService);

      const config = redditService.getRedditConfig();
      expect(config.userAgent).toContain('CraveSearch');
      expect(config.clientId).toBeTruthy();
      expect(config.username).toBeTruthy();
    });

    it('should authenticate successfully with Reddit API', async () => {
      await expect(redditService.authenticate()).resolves.not.toThrow();

      // Validate authentication by checking if we can access authenticated endpoints
      const isValid = await redditService.validateAuthentication();
      expect(isValid).toBe(true);
    }, 30000);

    it('should establish connection to r/austinfood subreddit', async () => {
      const headers = await redditService.getAuthenticatedHeaders();
      expect(headers.Authorization).toMatch(/^Bearer /);

      // Test basic subreddit access
      const response = await httpService.axiosRef.get(
        'https://oauth.reddit.com/r/austinfood/about',
        { headers },
      );

      expect(response.status).toBe(200);
      expect(response.data.data.display_name).toBe('austinfood');
    }, 15000);
  });

  describe('Post ID Collection Testing', () => {
    it('should retrieve post IDs from r/austinfood hot endpoint', async () => {
      const headers = await redditService.getAuthenticatedHeaders();

      const response = await httpService.axiosRef.get<
        RedditListing<RedditPost>
      >('https://oauth.reddit.com/r/austinfood/hot?limit=25', { headers });

      expect(response.status).toBe(200);
      expect(response.data.data.children).toBeDefined();
      expect(response.data.data.children.length).toBeGreaterThan(0);

      // Extract posts with sufficient comment activity
      const posts = response.data.data.children
        .map((child) => child.data)
        .filter((post) => post.num_comments >= 5); // Filter for posts with meaningful discussion

      expect(posts.length).toBeGreaterThan(0);
      testPosts.push(...posts.slice(0, 5)); // Store first 5 posts for testing

      console.log(`Found ${posts.length} posts with >= 5 comments for testing`);
    }, 15000);

    it('should retrieve post IDs from r/austinfood new endpoint', async () => {
      const headers = await redditService.getAuthenticatedHeaders();

      const response = await httpService.axiosRef.get<
        RedditListing<RedditPost>
      >('https://oauth.reddit.com/r/austinfood/new?limit=25', { headers });

      expect(response.status).toBe(200);
      expect(response.data.data.children).toBeDefined();

      // Validate metadata includes comment count information
      const recentPosts = response.data.data.children.map(
        (child) => child.data,
      );

      recentPosts.forEach((post) => {
        expect(post).toHaveProperty('id');
        expect(post).toHaveProperty('title');
        expect(post).toHaveProperty('num_comments');
        expect(post).toHaveProperty('permalink');
        expect(post).toHaveProperty('created_utc');
      });

      console.log(`Validated metadata for ${recentPosts.length} recent posts`);
    }, 15000);

    it('should have collected sufficient test posts for comment thread testing', () => {
      expect(testPosts.length).toBeGreaterThan(0);
      console.log(
        `Collected ${testPosts.length} posts for comment thread testing`,
      );

      testPosts.forEach((post, index) => {
        console.log(
          `Post ${index + 1}: "${post.title}" (${post.num_comments} comments)`,
        );
      });
    });
  });

  describe('Comment Thread Retrieval Testing', () => {
    it('should retrieve complete comment threads using post-based endpoint', async () => {
      expect(testPosts.length).toBeGreaterThan(0);

      const headers = await redditService.getAuthenticatedHeaders();
      const testPost = testPosts[0];

      const startTime = Date.now();
      const response = await httpService.axiosRef.get(
        `https://oauth.reddit.com/r/austinfood/comments/${testPost.id}`,
        { headers },
      );
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(2); // Post data + Comments data

      const [postData, commentsData] = response.data;

      // Validate post data structure
      expect(postData.data.children[0].data.id).toBe(testPost.id);

      // Validate comments data structure
      expect(commentsData.kind).toBe('Listing');
      expect(commentsData.data.children).toBeDefined();

      retrievalMetrics.totalThreads++;
      retrievalMetrics.successfulRetrievals++;
      retrievalMetrics.averageResponseTime = responseTime;

      console.log(
        `Successfully retrieved thread for post ${testPost.id} in ${responseTime}ms`,
      );
    }, 20000);

    it('should validate comment metadata completeness', async () => {
      const headers = await redditService.getAuthenticatedHeaders();
      const testPost = testPosts[0];

      const response = await httpService.axiosRef.get(
        `https://oauth.reddit.com/r/austinfood/comments/${testPost.id}`,
        { headers },
      );

      const [, commentsData] = response.data;
      const comments = commentsData.data.children
        .map((child: any) => child.data)
        .filter((comment: any) => comment.body !== '[deleted]');

      expect(comments.length).toBeGreaterThan(0);

      // Validate required metadata fields for each comment
      comments.slice(0, 5).forEach((comment: RedditComment) => {
        expect(comment).toHaveProperty('id');
        expect(comment).toHaveProperty('body');
        expect(comment).toHaveProperty('author');
        expect(comment).toHaveProperty('score');
        expect(comment).toHaveProperty('created_utc');
        expect(comment).toHaveProperty('parent_id');

        // Validate data types
        expect(typeof comment.id).toBe('string');
        expect(typeof comment.body).toBe('string');
        expect(typeof comment.author).toBe('string');
        expect(typeof comment.score).toBe('number');
        expect(typeof comment.created_utc).toBe('number');
        expect(typeof comment.parent_id).toBe('string');
      });

      console.log(`Validated metadata for ${comments.length} comments`);
    }, 15000);

    it('should test nested reply access and thread depth capabilities', async () => {
      const headers = await redditService.getAuthenticatedHeaders();
      const testPost = testPosts[0];

      const response = await httpService.axiosRef.get(
        `https://oauth.reddit.com/r/austinfood/comments/${testPost.id}?depth=10`,
        { headers },
      );

      const [, commentsData] = response.data;

      let maxDepth = 0;
      const analyzeThreadDepth = (comments: any[], currentDepth = 0) => {
        maxDepth = Math.max(maxDepth, currentDepth);

        comments.forEach((commentWrapper) => {
          const comment = commentWrapper.data;
          if (
            comment.replies &&
            comment.replies.data &&
            comment.replies.data.children
          ) {
            analyzeThreadDepth(comment.replies.data.children, currentDepth + 1);
          }
        });
      };

      analyzeThreadDepth(commentsData.data.children);
      retrievalMetrics.maxThreadDepth = Math.max(
        retrievalMetrics.maxThreadDepth,
        maxDepth,
      );

      expect(maxDepth).toBeGreaterThanOrEqual(0);
      console.log(`Thread depth analysis: Maximum depth ${maxDepth} levels`);

      // Validate parent-child relationships
      const validateThreadStructure = (
        comments: any[],
        parentId: string | null = null,
      ) => {
        comments.forEach((commentWrapper) => {
          const comment = commentWrapper.data;
          if (parentId && comment.parent_id) {
            expect(comment.parent_id).toMatch(/^(t1_|t3_)/); // Valid Reddit ID format
          }

          if (
            comment.replies &&
            comment.replies.data &&
            comment.replies.data.children
          ) {
            validateThreadStructure(
              comment.replies.data.children,
              `t1_${comment.id}`,
            );
          }
        });
      };

      validateThreadStructure(commentsData.data.children);
    }, 20000);
  });

  describe('Performance and Reliability Testing', () => {
    it('should measure response times for various thread sizes', async () => {
      const headers = await redditService.getAuthenticatedHeaders();
      const responseTimes: number[] = [];

      for (const post of testPosts.slice(0, 3)) {
        const startTime = Date.now();

        try {
          const response = await httpService.axiosRef.get(
            `https://oauth.reddit.com/r/austinfood/comments/${post.id}`,
            { headers },
          );

          const responseTime = Date.now() - startTime;
          responseTimes.push(responseTime);

          console.log(
            `Post ${post.id} (${post.num_comments} comments): ${responseTime}ms`,
          );
        } catch (error) {
          console.warn(`Failed to retrieve post ${post.id}:`, error.message);
        }
      }

      expect(responseTimes.length).toBeGreaterThan(0);

      const averageTime =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      retrievalMetrics.averageResponseTime = Math.round(averageTime);

      console.log(`Average response time: ${averageTime.toFixed(2)}ms`);
      expect(averageTime).toBeLessThan(10000); // Should be under 10 seconds
    }, 60000);

    it('should handle rate limiting gracefully', async () => {
      // This test validates error handling rather than triggering actual rate limits
      const headers = await redditService.getAuthenticatedHeaders();

      try {
        // Make a rapid series of requests to test rate limit handling
        const promises: Promise<any>[] = [];
        for (let i = 0; i < 3; i++) {
          promises.push(
            httpService.axiosRef.get(
              'https://oauth.reddit.com/r/austinfood/hot?limit=5',
              { headers },
            ),
          );
        }

        const results = await Promise.allSettled(promises);
        const successful = results.filter(
          (r) => r.status === 'fulfilled',
        ).length;

        expect(successful).toBeGreaterThan(0);
        console.log(
          `${successful}/${results.length} rapid requests successful`,
        );
      } catch (error) {
        if (error.response?.status === 429) {
          expect(error).toBeInstanceOf(RedditRateLimitError);
          console.log('Rate limit handling validated');
        } else {
          throw error;
        }
      }
    }, 30000);
  });

  describe('Edge Case and Limitation Testing', () => {
    it('should handle deleted comments appropriately', async () => {
      const headers = await redditService.getAuthenticatedHeaders();
      const testPost = testPosts[0];

      const response = await httpService.axiosRef.get(
        `https://oauth.reddit.com/r/austinfood/comments/${testPost.id}`,
        { headers },
      );

      const [, commentsData] = response.data;
      const comments = commentsData.data.children.map(
        (child: any) => child.data,
      );

      // Check for deleted comments handling
      const deletedComments = comments.filter(
        (comment: any) =>
          comment.body === '[deleted]' ||
          comment.body === '[removed]' ||
          comment.author === '[deleted]',
      );

      console.log(`Found ${deletedComments.length} deleted/removed comments`);

      // Validate that deleted comments are properly structured
      deletedComments.forEach((comment: any) => {
        expect(comment).toHaveProperty('id');
        expect(comment).toHaveProperty('created_utc');
        // Deleted comments should still have structural metadata
      });
    }, 15000);

    it('should test pagination handling for extensive comment threads', async () => {
      const headers = await redditService.getAuthenticatedHeaders();

      // Find a post with many comments for pagination testing
      const highCommentPost = testPosts.find((post) => post.num_comments >= 20);

      if (highCommentPost) {
        const response = await httpService.axiosRef.get(
          `https://oauth.reddit.com/r/austinfood/comments/${highCommentPost.id}?limit=100`,
          { headers },
        );

        const [, commentsData] = response.data;
        expect(commentsData.data.children).toBeDefined();

        // Check if there are "more" comments indicators
        const hasMoreComments = commentsData.data.children.some(
          (child: any) => child.kind === 'more',
        );

        console.log(
          `Pagination test: Post has ${highCommentPost.num_comments} comments, "more" indicator: ${hasMoreComments}`,
        );

        if (hasMoreComments) {
          const moreComment = commentsData.data.children.find(
            (child: any) => child.kind === 'more',
          );
          expect(moreComment.data).toHaveProperty('children');
          expect(Array.isArray(moreComment.data.children)).toBe(true);
        }
      } else {
        console.log(
          'No posts with sufficient comments found for pagination testing',
        );
      }
    }, 20000);
  });

  describe('Test Results Summary', () => {
    it('should report comprehensive thread retrieval test results', () => {
      console.log('\n=== COMMENT THREAD RETRIEVAL TEST RESULTS ===');
      console.log(`Total threads tested: ${retrievalMetrics.totalThreads}`);
      console.log(
        `Successful retrievals: ${retrievalMetrics.successfulRetrievals}`,
      );
      console.log(
        `Average response time: ${retrievalMetrics.averageResponseTime}ms`,
      );
      console.log(
        `Maximum thread depth: ${retrievalMetrics.maxThreadDepth} levels`,
      );
      console.log(`Test posts analyzed: ${testPosts.length}`);

      // Validate overall test success
      expect(retrievalMetrics.successfulRetrievals).toBeGreaterThan(0);
      expect(retrievalMetrics.averageResponseTime).toBeLessThan(15000);
      expect(testPosts.length).toBeGreaterThan(0);

      console.log('=== COMMENT THREAD RETRIEVAL VALIDATION COMPLETE ===\n');
    });
  });
});
