/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { MentionRepository } from './mention.repository';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { Mention, MentionSource } from '@prisma/client';
import {
  EntityNotFoundException,
  DatabaseOperationException,
} from './base/repository.exceptions';

describe('MentionRepository', () => {
  let repository: MentionRepository;
  let mockPrismaService: {
    mention: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let mockLoggerService: {
    setContext: jest.Mock;
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    database: jest.Mock;
  };

  const mockMention: Mention = {
    mentionId: 'mention-1',
    connectionId: 'connection-1',
    sourceType: 'post' as MentionSource,
    sourceId: 'reddit-post-123',
    sourceUrl: 'https://reddit.com/r/foodie/post123',
    subreddit: 'foodie',
    contentExcerpt: 'This place has amazing pizza',
    author: 'reddit_user',
    upvotes: 25,
    createdAt: new Date('2024-01-01'),
    processedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    // Mock PrismaService
    mockPrismaService = {
      mention: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    // Mock LoggerService
    mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      database: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentionRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    repository = module.get<MentionRepository>(MentionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Setup', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });

    it('should set correct entity name', () => {
      expect((repository as any).entityName).toBe('Mention');
    });

    it('should set correct primary key field', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      expect((repository as any).getPrimaryKeyField()).toBe('mentionId');
    });
  });

  describe('Base CRUD Operations', () => {
    describe('create', () => {
      it('should create a mention with valid data', async () => {
        const createData = {
          connection: { connect: { connectionId: 'connection-1' } },
          sourceType: 'post' as MentionSource,
          sourceId: 'reddit-post-123',
          sourceUrl: 'https://reddit.com/r/foodie/post123',
          subreddit: 'foodie',
          contentExcerpt: 'This place has amazing pizza',
          author: 'reddit_user',
          upvotes: 25,
          createdAt: new Date('2024-01-01'),
        };

        mockPrismaService.mention.create.mockResolvedValue(mockMention);

        const result = await repository.create(createData);

        expect(result).toEqual(mockMention);
        expect(mockPrismaService.mention.create).toHaveBeenCalledWith({
          data: createData,
        });
        expect(mockLoggerService.debug).toHaveBeenCalled();
      });

      it('should handle Prisma errors during creation', async () => {
        const createData = {
          connection: { connect: { connectionId: 'connection-1' } },
          sourceType: 'post' as MentionSource,
          sourceId: 'reddit-post-123',
          sourceUrl: 'https://reddit.com/r/foodie/post123',
          subreddit: 'foodie',
          contentExcerpt: 'This place has amazing pizza',
          author: 'reddit_user',
          upvotes: 25,
          createdAt: new Date('2024-01-01'),
        };

        const prismaError = {
          code: 'P2002',
          message: 'Unique constraint violation',
        };
        mockPrismaService.mention.create.mockRejectedValue(prismaError);

        await expect(repository.create(createData)).rejects.toThrow();
        expect(mockLoggerService.error).toHaveBeenCalled();
      });
    });

    describe('findById', () => {
      it('should find mention by ID', async () => {
        mockPrismaService.mention.findUnique.mockResolvedValue(mockMention);

        const result = await repository.findById('mention-1');

        expect(result).toEqual(mockMention);
        expect(mockPrismaService.mention.findUnique).toHaveBeenCalledWith({
          where: { mentionId: 'mention-1' },
        });
      });

      it('should return null for non-existent mention', async () => {
        mockPrismaService.mention.findUnique.mockResolvedValue(null);

        const result = await repository.findById('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('update', () => {
      it('should update mention successfully', async () => {
        const updateData = { upvotes: 50 };
        const updatedMention = { ...mockMention, upvotes: 50 };

        mockPrismaService.mention.update.mockResolvedValue(updatedMention);

        const result = await repository.update('mention-1', updateData);

        expect(result).toEqual(updatedMention);
        expect(mockPrismaService.mention.update).toHaveBeenCalledWith({
          where: { mentionId: 'mention-1' },
          data: updateData,
        });
      });
    });

    describe('delete', () => {
      it('should delete mention successfully', async () => {
        mockPrismaService.mention.delete.mockResolvedValue(mockMention);

        await repository.delete('mention-1');

        expect(mockPrismaService.mention.delete).toHaveBeenCalledWith({
          where: { mentionId: 'mention-1' },
        });
      });
    });
  });

  describe('findByConnection', () => {
    it('should find mentions by connection ID', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findByConnection('connection-1');

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { connectionId: 'connection-1' },
        orderBy: { upvotes: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });

    it('should find mentions with additional filters', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = {
        where: { subreddit: 'foodie' },
        skip: 10,
        take: 5,
      };

      const result = await repository.findByConnection('connection-1', params);

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { connectionId: 'connection-1', subreddit: 'foodie' },
        orderBy: { upvotes: 'desc' },
        skip: 10,
        take: 5,
        include: undefined,
      });
    });

    it('should handle errors during findByConnection', async () => {
      const error = new Error('Database error');
      mockPrismaService.mention.findMany.mockRejectedValue(error);

      await expect(
        repository.findByConnection('connection-1'),
      ).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('findBySubreddit', () => {
    it('should find mentions by subreddit', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findBySubreddit('foodie');

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { subreddit: 'foodie' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });

    it('should find mentions with pagination', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = { skip: 0, take: 10 };
      const result = await repository.findBySubreddit('foodie', params);

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { subreddit: 'foodie' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: undefined,
      });
    });
  });

  describe('findBySource', () => {
    it('should find mentions by source type and ID', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findBySource('post', 'reddit-post-123');

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { sourceType: 'post', sourceId: 'reddit-post-123' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });

    it('should handle comment source type', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findBySource(
        'comment',
        'reddit-comment-456',
      );

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { sourceType: 'comment', sourceId: 'reddit-comment-456' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });
  });

  describe('findTopMentions', () => {
    it('should find top mentions with default parameters', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findTopMentions();

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        skip: undefined,
        take: 50,
        include: undefined,
      });
    });

    it('should find top mentions with connection filter', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = { connectionId: 'connection-1', minUpvotes: 10 };
      const result = await repository.findTopMentions(params);

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: {
          connectionId: 'connection-1',
          upvotes: { gte: 10 },
        },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        skip: undefined,
        take: 50,
        include: undefined,
      });
    });

    it('should find top mentions with date filter', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = { daysSince: 7 };
      const result = await repository.findTopMentions(params);

      expect(result).toEqual(mentions);
      const calledWith = mockPrismaService.mention.findMany.mock.calls[0][0];
      expect(calledWith.where.createdAt).toBeDefined();
      expect(calledWith.where.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('findRecentMentions', () => {
    it('should find recent mentions with default parameters', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findRecentMentions();

      expect(result).toEqual(mentions);
      const calledWith = mockPrismaService.mention.findMany.mock.calls[0][0];
      expect(calledWith.where.createdAt).toBeDefined();
      expect(calledWith.where.createdAt.gte).toBeInstanceOf(Date);
      expect(calledWith.orderBy).toEqual({ createdAt: 'desc' });
      expect(calledWith.take).toBe(100);
    });

    it('should find recent mentions with custom days', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findRecentMentions(3);

      expect(result).toEqual(mentions);
      const calledWith = mockPrismaService.mention.findMany.mock.calls[0][0];
      expect(calledWith.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('should find recent mentions with filters', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = {
        connectionId: 'connection-1',
        subreddit: 'foodie',
        sourceType: 'post' as MentionSource,
      };
      const result = await repository.findRecentMentions(7, params);

      expect(result).toEqual(mentions);
      const calledWith = mockPrismaService.mention.findMany.mock.calls[0][0];
      expect(calledWith.where).toMatchObject({
        connectionId: 'connection-1',
        subreddit: 'foodie',
        sourceType: 'post',
      });
    });
  });

  describe('findByAuthor', () => {
    it('should find mentions by author', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const result = await repository.findByAuthor('reddit_user');

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { author: 'reddit_user' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });

    it('should find mentions by author with additional filters', async () => {
      const mentions = [mockMention];
      mockPrismaService.mention.findMany.mockResolvedValue(mentions);

      const params = {
        where: { subreddit: 'foodie' },
        take: 20,
      };
      const result = await repository.findByAuthor('reddit_user', params);

      expect(result).toEqual(mentions);
      expect(mockPrismaService.mention.findMany).toHaveBeenCalledWith({
        where: { author: 'reddit_user', subreddit: 'foodie' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: 20,
        include: undefined,
      });
    });
  });

  describe('getConnectionStatistics', () => {
    it('should get connection statistics', async () => {
      const mockAggregateResult = {
        _count: { mentionId: 10 },
        _sum: { upvotes: 150 },
        _avg: { upvotes: 15 },
      };
      const mockRecentCount = 3;
      const mockSubredditStats = [
        { subreddit: 'foodie', _count: { subreddit: 5 } },
        { subreddit: 'restaurants', _count: { subreddit: 5 } },
      ];

      mockPrismaService.mention.aggregate.mockResolvedValue(
        mockAggregateResult,
      );
      mockPrismaService.mention.count.mockResolvedValue(mockRecentCount);
      mockPrismaService.mention.groupBy.mockResolvedValue(mockSubredditStats);

      const result = await repository.getConnectionStatistics('connection-1');

      expect(result).toEqual({
        totalMentions: 10,
        totalUpvotes: 150,
        uniqueSubreddits: 2,
        averageUpvotes: 15,
        recentMentions: 3,
      });

      expect(mockPrismaService.mention.aggregate).toHaveBeenCalledWith({
        where: { connectionId: 'connection-1' },
        _count: { mentionId: true },
        _sum: { upvotes: true },
        _avg: { upvotes: true },
      });

      expect(mockPrismaService.mention.groupBy).toHaveBeenCalledWith({
        by: ['subreddit'],
        where: { connectionId: 'connection-1' },
        _count: { subreddit: true },
      });
    });

    it('should handle empty statistics', async () => {
      const mockAggregateResult = {
        _count: { mentionId: 0 },
        _sum: { upvotes: null },
        _avg: { upvotes: null },
      };
      const mockRecentCount = 0;
      const mockSubredditStats = [];

      mockPrismaService.mention.aggregate.mockResolvedValue(
        mockAggregateResult,
      );
      mockPrismaService.mention.count.mockResolvedValue(mockRecentCount);
      mockPrismaService.mention.groupBy.mockResolvedValue(mockSubredditStats);

      const result = await repository.getConnectionStatistics('connection-1');

      expect(result).toEqual({
        totalMentions: 0,
        totalUpvotes: 0,
        uniqueSubreddits: 0,
        averageUpvotes: 0,
        recentMentions: 0,
      });
    });

    it('should handle errors during statistics calculation', async () => {
      const error = new Error('Database error');
      mockPrismaService.mention.aggregate.mockRejectedValue(error);

      await expect(
        repository.getConnectionStatistics('connection-1'),
      ).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Prisma P2025 error as EntityNotFoundException', async () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record not found',
      };
      mockPrismaService.mention.findUnique.mockRejectedValue(prismaError);

      await expect(repository.findById('non-existent')).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('should handle unknown Prisma errors as DatabaseOperationException', async () => {
      const prismaError = {
        code: 'P2001',
        message: 'Unknown error',
      };
      mockPrismaService.mention.create.mockRejectedValue(prismaError);

      await expect(
        repository.create({
          connection: { connect: { connectionId: 'connection-1' } },
          sourceType: 'post',
          sourceId: 'source-1',
          sourceUrl: 'https://test.com',
          subreddit: 'test',
          contentExcerpt: 'Test content',
          author: 'test_user',
          upvotes: 0,
          createdAt: new Date(),
        }),
      ).rejects.toThrow(DatabaseOperationException);
    });
  });

  describe('Logging', () => {
    it('should log debug messages during successful operations', async () => {
      mockPrismaService.mention.findMany.mockResolvedValue([mockMention]);

      await repository.findByConnection('connection-1');

      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'Finding mentions by connection',
        expect.any(Object),
      );
      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'Find mentions by connection completed',
        expect.any(Object),
      );
    });

    it('should log error messages during failed operations', async () => {
      const error = new Error('Database error');
      mockPrismaService.mention.findMany.mockRejectedValue(error);

      await expect(
        repository.findByConnection('connection-1'),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Failed to find mentions by connection',
        expect.any(Object),
      );
    });
  });
});
