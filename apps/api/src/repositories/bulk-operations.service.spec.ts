/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Test, TestingModule } from '@nestjs/testing';
import { BulkOperationsService } from './bulk-operations.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { MentionRepository } from './mention.repository';
import { LoggerService } from '../shared';
import { EntityType, ActivityLevel, MentionSource } from '@prisma/client';
import {
  BulkEntityInput,
  BulkConnectionInput,
  BulkMentionInput,
  BulkOperationConfig,
} from './bulk-operations.types';

/**
 * Unit tests for BulkOperationsService
 *
 * Tests validate PRD Section 6.6.2 requirements:
 * - Transaction Strategy: Single atomic transaction for consistency
 * - UPSERT operations: Efficient entity merging
 * - Bulk operations: Multi-row inserts/updates
 */
describe('BulkOperationsService', () => {
  let service: BulkOperationsService;
  let prismaService: jest.Mocked<PrismaService>;
  // Repositories are not directly used in unit tests but kept for completeness
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let entityRepository: jest.Mocked<EntityRepository>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let connectionRepository: jest.Mocked<ConnectionRepository>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let mentionRepository: jest.Mocked<MentionRepository>;
  let loggerService: jest.Mocked<LoggerService>;

  // Mock transaction executor
  const mockTransaction = {
    entity: {
      createMany: jest.fn(),
      upsert: jest.fn(),
    },
    connection: {
      createMany: jest.fn(),
    },
    mention: {
      createMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      $transaction: jest.fn(),
      entity: mockTransaction.entity,
      connection: mockTransaction.connection,
      mention: mockTransaction.mention,
    };

    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkOperationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EntityRepository,
          useValue: {},
        },
        {
          provide: ConnectionRepository,
          useValue: {},
        },
        {
          provide: MentionRepository,
          useValue: {},
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<BulkOperationsService>(BulkOperationsService);
    prismaService = module.get(PrismaService);
    entityRepository = module.get(EntityRepository);
    connectionRepository = module.get(ConnectionRepository);
    mentionRepository = module.get(MentionRepository);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('bulkCreateEntities', () => {
    const mockEntities: BulkEntityInput[] = [
      {
        name: 'Test Restaurant 1',
        type: 'restaurant' as EntityType,
        aliases: ['Test Rest 1'],
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Test St, NYC',
        googlePlaceId: 'test-place-1',
        restaurantMetadata: { test: true },
      },
      {
        name: 'Test Dish 1',
        type: 'dish_or_category' as EntityType,
        aliases: ['Test Dish'],
      },
    ];

    it('should successfully create entities in bulk with transactions', async () => {
      // Mock transaction execution
      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      // Mock createMany response
      mockTransaction.entity.createMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkCreateEntities(mockEntities);

      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.entity.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            name: 'Test Restaurant 1',
            type: 'restaurant',
            aliases: ['Test Rest 1'],
            latitude: 40.7128,
            longitude: -74.006,
            address: '123 Test St, NYC',
            googlePlaceId: 'test-place-1',
            restaurantMetadata: { test: true },
          }),
          expect.objectContaining({
            name: 'Test Dish 1',
            type: 'dish_or_category',
            aliases: ['Test Dish'],
          }),
        ]),
        skipDuplicates: true,
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.totalItems).toBe(2);
      expect(result.metrics.throughput).toBeGreaterThan(0);
    });

    it('should handle batch processing for large datasets', async () => {
      const largeDataset: BulkEntityInput[] = Array.from(
        { length: 300 },
        (_, i) => ({
          name: `Test Entity ${i}`,
          type: 'dish_or_category' as EntityType,
        }),
      );

      const config: Partial<BulkOperationConfig> = {
        batchSize: 100,
      };

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      // Mock createMany to return success for each batch
      mockTransaction.entity.createMany.mockResolvedValue({ count: 100 });

      const result = await service.bulkCreateEntities(largeDataset, config);

      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.entity.createMany).toHaveBeenCalledTimes(3); // 300 items / 100 batch size
      expect(result.successCount).toBe(300);
      expect(result.metrics.batchCount).toBe(3);
    });

    it('should handle transaction failures with proper rollback', async () => {
      const error = new Error('Transaction failed');
      prismaService.$transaction.mockRejectedValue(error);

      await expect(service.bulkCreateEntities(mockEntities)).rejects.toThrow(
        'Transaction failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'Bulk entity creation failed',
        expect.objectContaining({
          operation: 'bulk_create_entities',
          error: 'Transaction failed',
        }),
      );
    });

    it('should work without transactions when disabled', async () => {
      const config: Partial<BulkOperationConfig> = {
        enableTransactions: false,
      };

      mockTransaction.entity.createMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkCreateEntities(mockEntities, config);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
      expect(mockTransaction.entity.createMany).toHaveBeenCalledTimes(1);
      expect(result.successCount).toBe(2);
    });
  });

  describe('bulkCreateConnections', () => {
    const mockConnections: BulkConnectionInput[] = [
      {
        restaurantId: 'restaurant-1',
        dishOrCategoryId: 'dish-1',
        categories: ['category-1'],
        dishAttributes: ['attribute-1'],
        isMenuItem: true,
        mentionCount: 5,
        totalUpvotes: 25,
        sourceDiversity: 3,
        recentMentionCount: 2,
        lastMentionedAt: new Date(),
        activityLevel: 'active' as ActivityLevel,
        topMentions: [{ id: 'mention-1', upvotes: 10 }],
        dishQualityScore: 8.5,
      },
    ];

    it('should successfully create connections in bulk', async () => {
      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.connection.createMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkCreateConnections(mockConnections);

      expect(mockTransaction.connection.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            restaurantId: 'restaurant-1',
            dishOrCategoryId: 'dish-1',
            categories: ['category-1'],
            dishAttributes: ['attribute-1'],
            isMenuItem: true,
            mentionCount: 5,
            totalUpvotes: 25,
            sourceDiversity: 3,
            recentMentionCount: 2,
            activityLevel: 'active',
            dishQualityScore: 8.5,
          }),
        ]),
        skipDuplicates: true,
      });

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    it('should handle foreign key constraint violations', async () => {
      const error = new Error('Foreign key constraint failed') as Error & {
        code: string;
      };
      error.code = 'P2003';

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.connection.createMany.mockRejectedValue(error);

      const result = await service.bulkCreateConnections(mockConnections);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toContain('Foreign key constraint failed');

      // Service handles errors gracefully, no error logging at batch level
      expect(loggerService.error).not.toHaveBeenCalledWith(
        'Bulk connection creation failed',
        expect.any(Object),
      );
    });
  });

  describe('bulkCreateMentions', () => {
    const mockMentions: BulkMentionInput[] = [
      {
        connectionId: 'connection-1',
        sourceType: 'post' as MentionSource,
        sourceId: 'reddit-post-1',
        sourceUrl: 'https://reddit.com/r/test/comments/123',
        subreddit: 'testfood',
        contentExcerpt: 'This place has amazing food!',
        author: 'testuser',
        upvotes: 15,
        createdAt: new Date(),
      },
    ];

    it('should successfully create mentions in bulk', async () => {
      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.mention.createMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkCreateMentions(mockMentions);

      expect(mockTransaction.mention.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            connectionId: 'connection-1',
            sourceType: 'post',
            sourceId: 'reddit-post-1',
            sourceUrl: 'https://reddit.com/r/test/comments/123',
            subreddit: 'testfood',
            contentExcerpt: 'This place has amazing food!',
            author: 'testuser',
            upvotes: 15,
          }),
        ]),
        skipDuplicates: true,
      });

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('bulkUpsertEntities', () => {
    const mockUpserts = [
      {
        where: { entityId: 'entity-1' },
        create: {
          name: 'New Entity',
          type: 'restaurant' as EntityType,
        },
        update: {
          name: 'Updated Entity',
        },
      },
    ];

    it('should successfully upsert entities', async () => {
      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.entity.upsert.mockResolvedValue({ entityId: 'entity-1' });

      const result = await service.bulkUpsertEntities(mockUpserts);

      expect(mockTransaction.entity.upsert).toHaveBeenCalledWith(
        mockUpserts[0],
      );
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    it('should handle partial failures in upsert operations', async () => {
      const multipleUpserts = [
        mockUpserts[0],
        {
          where: { entityId: 'entity-2' },
          create: { name: 'Entity 2', type: 'dish_or_category' as EntityType },
          update: { name: 'Updated Entity 2' },
        },
      ];

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      // First upsert succeeds, second fails
      mockTransaction.entity.upsert
        .mockResolvedValueOnce({ entityId: 'entity-1' })
        .mockRejectedValueOnce(new Error('Upsert failed'));

      const result = await service.bulkUpsertEntities(multipleUpserts);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Upsert failed');
    });
  });

  describe('Performance and Configuration', () => {
    it('should use default configuration when no config provided', async () => {
      const entities: BulkEntityInput[] = [
        { name: 'Test', type: 'restaurant' as EntityType },
      ];

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.entity.createMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkCreateEntities(entities);

      expect(result.metrics.batchCount).toBe(1);
      expect(result.metrics.totalItems).toBe(1);
    });

    it('should collect performance metrics correctly', async () => {
      const entities: BulkEntityInput[] = Array.from({ length: 5 }, (_, i) => ({
        name: `Entity ${i}`,
        type: 'dish_or_category' as EntityType,
      }));

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      mockTransaction.entity.createMany.mockResolvedValue({ count: 5 });

      const result = await service.bulkCreateEntities(entities);

      expect(result.metrics.totalItems).toBe(5);
      expect(result.metrics.successCount).toBe(5);
      expect(result.metrics.failureCount).toBe(0);
      expect(result.metrics.duration).toBeGreaterThanOrEqual(0);
      expect(result.metrics.throughput).toBeGreaterThan(0);
      expect(result.metrics.batchCount).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle individual batch failures gracefully', async () => {
      const entities: BulkEntityInput[] = [
        { name: 'Valid Entity', type: 'restaurant' as EntityType },
      ];

      prismaService.$transaction.mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          return await callback(mockTransaction);
        },
      );

      const error = new Error('Database constraint violation');
      mockTransaction.entity.createMany.mockRejectedValue(error);

      const result = await service.bulkCreateEntities(entities);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toContain('Database constraint violation');

      // Service handles errors gracefully, no error logging at batch level
      expect(loggerService.error).not.toHaveBeenCalledWith(
        'Bulk entity creation failed',
        expect.any(Object),
      );
    });
  });
});
