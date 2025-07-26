import { Test, TestingModule } from '@nestjs/testing';
import { MentionRepository } from './mention.repository';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { IntegrationTestSetup } from '../../test/integration-test.setup';
import { Mention, Prisma } from '@prisma/client';

describe('MentionRepository Integration Tests', () => {
  let repository: MentionRepository;
  let prismaService: PrismaService;
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();

    // Create testing module with real database connections
    module = await testSetup.createTestingModule([MentionRepository]);

    repository = module.get<MentionRepository>(MentionRepository);
    prismaService = testSetup.getPrismaService();
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Mention Creation Integration', () => {
    it('should create mention with database persistence and foreign key validation', async () => {
      await testSetup.withCleanup(async (prisma) => {
        // Setup test data with connection
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 9);
        const mentionData = {
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'post' as const,
          sourceId: `test_post_${timestamp}_${uniqueId}`,
          sourceUrl: `https://reddit.com/r/food/comments/test_post_${timestamp}`,
          subreddit: 'food',
          contentExcerpt:
            'This pizza at Integration Test Restaurant is absolutely amazing! Best spicy pizza in NYC.',
          author: 'test_food_lover',
          upvotes: 127,
          createdAt: new Date('2025-01-20T15:30:00Z'),
        };

        const result = await repository.create(mentionData);

        expect(result).toBeDefined();
        expect(result.connectionId).toBe(connection.connectionId);
        expect(result.sourceType).toBe('post');
        expect(result.sourceId).toBe(`test_post_${timestamp}_${uniqueId}`);
        expect(result.sourceUrl).toBe(
          `https://reddit.com/r/food/comments/test_post_${timestamp}`,
        );
        expect(result.subreddit).toBe('food');
        expect(result.contentExcerpt).toBe(mentionData.contentExcerpt);
        expect(result.author).toBe('test_food_lover');
        expect(result.upvotes).toBe(127);

        // Verify database persistence
        const dbMention = await prisma.mention.findUnique({
          where: { mentionId: result.mentionId },
        });

        expect(dbMention).toBeDefined();
        expect(dbMention!.sourceType).toBe('post');
        expect(dbMention!.subreddit).toBe('food');
        expect(dbMention!.upvotes).toBe(127);
      });
    });

    it('should enforce foreign key constraint on connection references', async () => {
      await testSetup.withCleanup(async () => {
        const nonExistentConnectionId = '00000000-0000-0000-0000-000000000001';

        const invalidMentionData = {
          connection: {
            connect: { connectionId: nonExistentConnectionId },
          },
          sourceType: 'comment' as const,
          sourceId: `invalid_comment_${Date.now()}`,
          sourceUrl: `https://reddit.com/r/food/comments/invalid_${Date.now()}`,
          subreddit: 'food',
          contentExcerpt: 'Invalid mention test',
          author: 'test_user',
          upvotes: 5,
          createdAt: new Date(),
        };

        await expect(repository.create(invalidMentionData)).rejects.toThrow();
      });
    });

    it('should handle both post and comment source types', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test post mention
        const postMention = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'post',
          sourceId: `post_${Date.now()}_1`,
          sourceUrl: `https://reddit.com/r/food/comments/post_${Date.now()}_1`,
          subreddit: 'food',
          contentExcerpt: 'Great restaurant post',
          author: 'post_author',
          upvotes: 50,
          createdAt: new Date(),
        });

        // Test comment mention
        const commentMention = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'comment',
          sourceId: `comment_${Date.now()}_2`,
          sourceUrl: `https://reddit.com/r/food/comments/comment_${Date.now()}_2`,
          subreddit: 'food',
          contentExcerpt: 'Agree with this recommendation',
          author: 'comment_author',
          upvotes: 25,
          createdAt: new Date(),
        });

        expect(postMention.sourceType).toBe('post');
        expect(commentMention.sourceType).toBe('comment');
      });
    });
  });

  describe('Mention Querying Integration', () => {
    it('should find mentions by connection with proper filtering', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Create test mentions
        const mention1 = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'post',
          sourceId: `query_test_${Date.now()}_1`,
          sourceUrl: `https://reddit.com/r/food/comments/query_test_${Date.now()}_1`,
          subreddit: 'food',
          contentExcerpt: 'First test mention',
          author: 'user1',
          upvotes: 10,
          createdAt: new Date(),
        });

        const mention2 = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'comment',
          sourceId: `query_test_${Date.now() + 1}_2`,
          sourceUrl: `https://reddit.com/r/food/comments/query_test_${Date.now() + 1}_2`,
          subreddit: 'nyc',
          contentExcerpt: 'Second test mention',
          author: 'user2',
          upvotes: 20,
          createdAt: new Date(),
        });

        // Query mentions by connection
        const connectionMentions = await repository.findMany({
          where: { connectionId: connection.connectionId },
        });

        expect(connectionMentions).toBeDefined();
        expect(connectionMentions.length).toBe(2);

        const mentionIds = connectionMentions.map((m) => m.mentionId);
        expect(mentionIds).toContain(mention1.mentionId);
        expect(mentionIds).toContain(mention2.mentionId);

        // Query mentions by subreddit
        const foodMentions = await repository.findMany({
          where: { subreddit: 'food' },
        });

        expect(foodMentions.length).toBeGreaterThanOrEqual(1);
        const foodMention = foodMentions.find(
          (m) => m.mentionId === mention1.mentionId,
        );
        expect(foodMention).toBeDefined();
      });
    });

    it('should support pagination and ordering for large mention sets', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Verify connection exists before creating mentions
        const existingConnection = await prisma.connection.findUnique({
          where: { connectionId: connection.connectionId },
        });
        expect(existingConnection).toBeDefined();

        // Create multiple mentions with different upvote counts
        const baseTime = Date.now() - 86400000; // Start from 24 hours ago
        const mentionPromises = Array.from({ length: 5 }, (_, i) =>
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'post',
            sourceId: `pagination_test_${Date.now()}_${i}`,
            sourceUrl: `https://reddit.com/r/food/comments/pagination_test_${Date.now()}_${i}`,
            subreddit: 'food',
            contentExcerpt: `Pagination test mention ${i}`,
            author: `user${i}`,
            upvotes: (i + 1) * 10, // 10, 20, 30, 40, 50
            createdAt: new Date(baseTime + i * 1000), // Different timestamps in the past
          }),
        );

        const mentions = await Promise.all(mentionPromises);

        // Test pagination
        const firstPage = await repository.findMany({
          where: { connectionId: connection.connectionId },
          take: 2,
          skip: 0,
          orderBy: { upvotes: 'desc' },
        });

        const secondPage = await repository.findMany({
          where: { connectionId: connection.connectionId },
          take: 2,
          skip: 2,
          orderBy: { upvotes: 'desc' },
        });

        expect(firstPage.length).toBe(2);
        expect(secondPage.length).toBe(2);

        // Verify ordering (highest upvotes first)
        expect(firstPage[0].upvotes).toBeGreaterThan(firstPage[1].upvotes);
        expect(firstPage[0].upvotes).toBe(50); // Highest
        expect(firstPage[1].upvotes).toBe(40); // Second highest

        // Verify no overlap between pages
        const firstPageIds = firstPage.map((m) => m.mentionId);
        const secondPageIds = secondPage.map((m) => m.mentionId);
        const overlap = firstPageIds.filter((id) => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      });
    });
  });

  describe('Mention Analytics Integration', () => {
    it('should aggregate mention statistics by connection', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Create mentions with varying upvotes
        await Promise.all([
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'post',
            sourceId: `analytics_${Date.now()}_1`,
            sourceUrl: `https://reddit.com/r/food/comments/analytics_${Date.now()}_1`,
            subreddit: 'food',
            contentExcerpt: 'Analytics test 1',
            author: 'user1',
            upvotes: 100,
            createdAt: new Date(),
          }),
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'comment',
            sourceId: `analytics_${Date.now() + 1}_2`,
            sourceUrl: `https://reddit.com/r/food/comments/analytics_${Date.now() + 1}_2`,
            subreddit: 'nyc',
            contentExcerpt: 'Analytics test 2',
            author: 'user2',
            upvotes: 50,
            createdAt: new Date(),
          }),
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'post',
            sourceId: `analytics_${Date.now() + 2}_3`,
            sourceUrl: `https://reddit.com/r/food/comments/analytics_${Date.now() + 2}_3`,
            subreddit: 'food',
            contentExcerpt: 'Analytics test 3',
            author: 'user3',
            upvotes: 25,
            createdAt: new Date(),
          }),
        ]);

        // Verify mentions were created
        const connectionMentions = await repository.findMany({
          where: { connectionId: connection.connectionId },
        });

        expect(connectionMentions).toBeDefined();
        expect(connectionMentions.length).toBe(3);

        // Verify total upvotes
        const totalUpvotes = connectionMentions.reduce(
          (sum, m) => sum + m.upvotes,
          0,
        );
        expect(totalUpvotes).toBe(175); // 100 + 50 + 25
      });
    });

    it('should identify trending mentions by recency and upvotes', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const now = new Date();
        const recentDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
        const oldDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const trendingSourceId = `trending_${Date.now()}_1`;

        const trendingMention = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'post',
          sourceId: trendingSourceId,
          sourceUrl: `https://reddit.com/r/food/comments/trending_${Date.now()}_1`,
          subreddit: 'food',
          contentExcerpt: 'Recent trending mention',
          author: 'trending_user',
          upvotes: 200,
          createdAt: recentDate,
        });

        await Promise.all([
          // Old high-upvote mention (not trending)
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'post',
            sourceId: `old_${Date.now()}_1`,
            sourceUrl: `https://reddit.com/r/food/comments/old_${Date.now()}_1`,
            subreddit: 'food',
            contentExcerpt: 'Old high upvote mention',
            author: 'old_user',
            upvotes: 300,
            createdAt: oldDate,
          }),
          // Recent low-upvote mention (not trending)
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'comment',
            sourceId: `recent_low_${Date.now()}`,
            sourceUrl: `https://reddit.com/r/food/comments/recent_low_${Date.now()}`,
            subreddit: 'food',
            contentExcerpt: 'Recent low upvote mention',
            author: 'recent_user',
            upvotes: 5,
            createdAt: recentDate,
          }),
        ]);

        // Find recent mentions with high upvotes
        const recentMentions = await repository.findMany({
          where: {
            connectionId: connection.connectionId,
            upvotes: { gte: 50 },
            createdAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        expect(recentMentions).toBeDefined();
        expect(recentMentions.length).toBe(1);
        expect(recentMentions[0].sourceId).toBe(trendingSourceId);
        expect(recentMentions[0].upvotes).toBe(200);
      });
    });
  });

  describe('Mention Updates Integration', () => {
    it('should update mention with validation and persistence', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const mention = await repository.create({
          connection: {
            connect: { connectionId: connection.connectionId },
          },
          sourceType: 'post',
          sourceId: `update_test_${Date.now()}`,
          sourceUrl: `https://reddit.com/r/food/comments/update_test_${Date.now()}`,
          subreddit: 'food',
          contentExcerpt: 'Original content',
          author: 'original_author',
          upvotes: 10,
          createdAt: new Date(),
        });

        const updateData = {
          upvotes: 25,
          contentExcerpt: 'Updated content excerpt',
        };

        const result = await repository.update(mention.mentionId, updateData);

        expect(result).toBeDefined();
        expect(result.upvotes).toBe(25);
        expect(result.contentExcerpt).toBe('Updated content excerpt');

        // Verify database persistence
        const dbMention = await prisma.mention.findUnique({
          where: { mentionId: mention.mentionId },
        });

        expect(dbMention).toBeDefined();
        expect(dbMention!.upvotes).toBe(25);
        expect(dbMention!.contentExcerpt).toBe('Updated content excerpt');
      });
    });
  });

  describe('Error Propagation Integration', () => {
    it('should propagate database constraint violations properly', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test invalid source_type enum
        await expect(
          prisma.mention.create({
            data: {
              connection: {
                connect: { connectionId: connection.connectionId },
              },
              sourceType: 'invalid_type' as any,
              sourceId: `test_${Date.now()}`,
              sourceUrl: `https://reddit.com/test_${Date.now()}`,
              subreddit: 'test',
              contentExcerpt: 'Test content',
              author: 'test_author',
              upvotes: 10,
              createdAt: new Date(),
            },
          }),
        ).rejects.toThrow();

        // Test invalid UUID format
        await expect(
          repository.findById('invalid-uuid-format'),
        ).rejects.toThrow();
      });
    });
  });

  describe('Concurrent Operations Integration', () => {
    it('should handle concurrent mention creation safely', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Create mentions concurrently
        const promises = Array.from({ length: 5 }, (_, i) =>
          repository.create({
            connection: {
              connect: { connectionId: connection.connectionId },
            },
            sourceType: 'post',
            sourceId: `concurrent_${Date.now()}_${i}`,
            sourceUrl: `https://reddit.com/r/food/comments/concurrent_${Date.now()}_${i}`,
            subreddit: 'food',
            contentExcerpt: `Concurrent mention ${i}`,
            author: `user${i}`,
            upvotes: i * 10,
            createdAt: new Date(),
          }),
        );

        const results = await Promise.all(promises);

        expect(results).toBeDefined();
        expect(results.length).toBe(5);

        // Verify all mentions have unique IDs
        const mentionIds = results.map((r) => r.mentionId);
        const uniqueIds = new Set(mentionIds);
        expect(uniqueIds.size).toBe(5);

        // Verify all are persisted
        const connectionMentions = await repository.findMany({
          where: { connectionId: connection.connectionId },
        });

        expect(connectionMentions.length).toBeGreaterThanOrEqual(5);
      });
    });
  });
});
