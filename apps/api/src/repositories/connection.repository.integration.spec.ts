import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionRepository } from './connection.repository';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { IntegrationTestSetup } from '../../test/integration-test.setup';
import { Connection, Prisma } from '@prisma/client';

describe('ConnectionRepository Integration Tests', () => {
  let repository: ConnectionRepository;
  let prismaService: PrismaService;
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();

    // Create testing module with real database connections
    module = await testSetup.createTestingModule([ConnectionRepository]);

    repository = module.get<ConnectionRepository>(ConnectionRepository);
    prismaService = testSetup.getPrismaService();
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Connection Creation Integration', () => {
    it('should create restaurant-dish connection with database persistence', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const connectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          dishAttributes: [testData.dishAttribute.entityId],
          isMenuItem: true,
          mentionCount: 15,
          totalUpvotes: 75,
          sourceDiversity: 5,
          recentMentionCount: 8,
          lastMentionedAt: new Date(),
          activityLevel: 'active' as const,
          dishQualityScore: 88.5,
        };

        const result = await repository.create(connectionData);

        expect(result).toBeDefined();
        expect(result.restaurantId).toBe(testData.restaurant.entityId);
        expect(result.dishOrCategoryId).toBe(testData.dishOrCategory.entityId);
        expect(result.dishAttributes).toEqual([
          testData.dishAttribute.entityId,
        ]);
        expect(result.isMenuItem).toBe(true);
        expect(result.mentionCount).toBe(15);
        expect(result.totalUpvotes).toBe(75);
        expect(result.activityLevel).toBe('active');
        expect(result.dishQualityScore).toEqual(new Prisma.Decimal(88.5));

        // Verify database persistence
        const dbConnection = await prisma.connection.findUnique({
          where: { connectionId: result.connectionId },
        });

        expect(dbConnection).toBeDefined();
        expect(dbConnection!.restaurantId).toBe(testData.restaurant.entityId);
        expect(dbConnection!.dishOrCategoryId).toBe(
          testData.dishOrCategory.entityId,
        );
        expect(dbConnection!.dishAttributes).toEqual([
          testData.dishAttribute.entityId,
        ]);
      });
    });

    it('should enforce foreign key constraints on restaurant references', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const nonExistentRestaurantId = '00000000-0000-0000-0000-000000000001';

        const invalidConnectionData = {
          restaurant: {
            connect: { entityId: nonExistentRestaurantId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          isMenuItem: true,
          mentionCount: 5,
          totalUpvotes: 25,
          sourceDiversity: 2,
          recentMentionCount: 1,
          activityLevel: 'normal' as const,
          dishQualityScore: 75.0,
        };

        await expect(
          repository.create(invalidConnectionData),
        ).rejects.toThrow();
      });
    });

    it('should enforce foreign key constraints on dish references', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const nonExistentDishId = '00000000-0000-0000-0000-000000000002';

        const invalidConnectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: nonExistentDishId },
          },
          isMenuItem: true,
          mentionCount: 5,
          totalUpvotes: 25,
          sourceDiversity: 2,
          recentMentionCount: 1,
          activityLevel: 'normal' as const,
          dishQualityScore: 75.0,
        };

        await expect(
          repository.create(invalidConnectionData),
        ).rejects.toThrow();
      });
    });

    it('should enforce unique constraint on restaurant-dish-attributes combination', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const connectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          dishAttributes: [testData.dishAttribute.entityId],
          isMenuItem: true,
          mentionCount: 5,
          totalUpvotes: 25,
          sourceDiversity: 2,
          recentMentionCount: 1,
          activityLevel: 'normal' as const,
          dishQualityScore: 75.0,
        };

        // Create first connection
        const firstConnection = await repository.create(connectionData);
        expect(firstConnection).toBeDefined();

        // Attempt to create duplicate should fail
        await expect(repository.create(connectionData)).rejects.toThrow();
      });
    });
  });

  describe('Connection Querying Integration', () => {
    it('should find connections with proper relationship loading', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const result = await repository.findById(connection.connectionId);

        expect(result).toBeDefined();
        expect(result!.connectionId).toBe(connection.connectionId);
        expect(result!.restaurantId).toBe(testData.restaurant.entityId);
        expect(result!.dishOrCategoryId).toBe(testData.dishOrCategory.entityId);
      });
    });

    it('should find connections by restaurant with filtering', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const results = await repository.findMany({
          where: { restaurantId: testData.restaurant.entityId },
        });

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        const testConnection = results.find(
          (c) => c.connectionId === connection.connectionId,
        );
        expect(testConnection).toBeDefined();
      });
    });

    it('should find connections by dish with activity filtering', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create connection with specific activity level
        const connection = await prisma.connection.create({
          data: {
            restaurant: {
              connect: { entityId: testData.restaurant.entityId },
            },
            dish: {
              connect: { entityId: testData.dishOrCategory.entityId },
            },
            isMenuItem: true,
            mentionCount: 20,
            totalUpvotes: 100,
            sourceDiversity: 8,
            recentMentionCount: 15,
            lastMentionedAt: new Date(),
            activityLevel: 'trending',
            dishQualityScore: 95.0,
          },
        });

        const results = await repository.findMany({
          where: {
            dishOrCategoryId: testData.dishOrCategory.entityId,
            activityLevel: 'trending',
          },
        });

        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);

        const trendingConnection = results.find(
          (c) => c.connectionId === connection.connectionId,
        );
        expect(trendingConnection).toBeDefined();
        expect(trendingConnection!.activityLevel).toBe('trending');
      });
    });
  });

  describe('Connection Updates Integration', () => {
    it('should update connection with validation and persistence', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const updateData = {
          mentionCount: 25,
          totalUpvotes: 125,
          recentMentionCount: 10,
          activityLevel: 'trending' as const,
          dishQualityScore: 92.5,
        };

        const result = await repository.update(
          connection.connectionId,
          updateData,
        );

        expect(result).toBeDefined();
        expect(result.mentionCount).toBe(25);
        expect(result.totalUpvotes).toBe(125);
        expect(result.recentMentionCount).toBe(10);
        expect(result.activityLevel).toBe('trending');
        expect(result.dishQualityScore).toEqual(new Prisma.Decimal(92.5));

        // Verify database persistence
        const dbConnection = await prisma.connection.findUnique({
          where: { connectionId: connection.connectionId },
        });

        expect(dbConnection).toBeDefined();
        expect(dbConnection!.mentionCount).toBe(25);
        expect(dbConnection!.activityLevel).toBe('trending');
      });
    });

    it('should maintain referential integrity during updates', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Should not be able to update to invalid restaurant ID
        const nonExistentRestaurantId = '00000000-0000-0000-0000-000000000001';

        await expect(
          repository.update(connection.connectionId, {
            restaurant: {
              connect: { entityId: nonExistentRestaurantId },
            },
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe('Quality Score Integration', () => {
    it('should handle quality score calculations with proper precision', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const connectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          isMenuItem: true,
          mentionCount: 10,
          totalUpvotes: 50,
          sourceDiversity: 5,
          recentMentionCount: 3,
          activityLevel: 'normal' as const,
          dishQualityScore: 87.654321, // Test precision handling
        };

        const result = await repository.create(connectionData);

        expect(result).toBeDefined();
        expect(result.dishQualityScore).toEqual(new Prisma.Decimal(87.654321));

        // Verify precision in database
        const dbConnection = await prisma.connection.findUnique({
          where: { connectionId: result.connectionId },
        });

        expect(dbConnection).toBeDefined();
        expect(Number(dbConnection!.dishQualityScore)).toBeCloseTo(
          87.654321,
          4,
        );
      });
    });
  });

  describe('Connection Attributes Integration', () => {
    it('should handle dish attributes arrays with database validation', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create additional attribute
        const secondAttribute = await prisma.entity.create({
          data: {
            name: 'Vegan Integration Test',
            type: 'dish_attribute',
          },
        });

        const connectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          dishAttributes: [
            testData.dishAttribute.entityId,
            secondAttribute.entityId,
          ],
          isMenuItem: true,
          mentionCount: 8,
          totalUpvotes: 40,
          sourceDiversity: 3,
          recentMentionCount: 2,
          activityLevel: 'normal' as const,
          dishQualityScore: 82.0,
        };

        const result = await repository.create(connectionData);

        expect(result).toBeDefined();
        expect(result.dishAttributes).toHaveLength(2);
        expect(result.dishAttributes).toContain(
          testData.dishAttribute.entityId,
        );
        expect(result.dishAttributes).toContain(secondAttribute.entityId);

        // Verify array storage in database
        const dbConnection = await prisma.connection.findUnique({
          where: { connectionId: result.connectionId },
        });

        expect(dbConnection).toBeDefined();
        expect(dbConnection!.dishAttributes).toHaveLength(2);
      });
    });

    it('should handle empty dish attributes array', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const connectionData = {
          restaurant: {
            connect: { entityId: testData.restaurant.entityId },
          },
          dish: {
            connect: { entityId: testData.dishOrCategory.entityId },
          },
          dishAttributes: [], // Empty array
          isMenuItem: true,
          mentionCount: 5,
          totalUpvotes: 25,
          sourceDiversity: 2,
          recentMentionCount: 1,
          activityLevel: 'normal' as const,
          dishQualityScore: 75.0,
        };

        const result = await repository.create(connectionData);

        expect(result).toBeDefined();
        expect(result.dishAttributes).toEqual([]);
      });
    });
  });

  describe('Activity Level Integration', () => {
    it('should enforce activity_level enum constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test all valid activity levels
        const validLevels = ['trending', 'active', 'normal'];

        for (const level of validLevels) {
          const connectionData = {
            restaurant: {
              connect: { entityId: testData.restaurant.entityId },
            },
            dish: {
              connect: { entityId: testData.dishOrCategory.entityId },
            },
            isMenuItem: true,
            mentionCount: 5,
            totalUpvotes: 25,
            sourceDiversity: 2,
            recentMentionCount: 1,
            activityLevel: level as any,
            dishQualityScore: 75.0,
          };

          const uniqueDish = await prisma.entity.create({
            data: {
              name: `Test Dish ${level}`,
              type: 'dish_or_category',
            },
          });

          const result = await repository.create({
            ...connectionData,
            // Add unique dish for each test
            dish: {
              connect: { entityId: uniqueDish.entityId },
            },
          });

          expect(result).toBeDefined();
          expect(result.activityLevel).toBe(level);
        }
      });
    });

    it('should reject invalid activity levels', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Try to create connection with invalid activity level directly in Prisma
        await expect(
          prisma.connection.create({
            data: {
              restaurant: {
                connect: { entityId: testData.restaurant.entityId },
              },
              dish: {
                connect: { entityId: testData.dishOrCategory.entityId },
              },
              isMenuItem: true,
              mentionCount: 5,
              totalUpvotes: 25,
              sourceDiversity: 2,
              recentMentionCount: 1,
              activityLevel: 'invalid_level' as any,
              dishQualityScore: 75.0,
            },
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe('Connection Deletion Integration', () => {
    it('should delete connection with proper cleanup', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const result = await repository.delete(connection.connectionId);

        expect(result).toBeDefined();
        expect(result.connectionId).toBe(connection.connectionId);

        // Verify deletion from database
        const deletedConnection = await prisma.connection.findUnique({
          where: { connectionId: connection.connectionId },
        });

        expect(deletedConnection).toBeNull();
      });
    });
  });

  describe('Concurrent Operations Integration', () => {
    it('should handle concurrent connection creation safely', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create multiple dishes for concurrent connections
        const dishes = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            prisma.entity.create({
              data: {
                name: `Concurrent Dish ${i}`,
                type: 'dish_or_category',
              },
            }),
          ),
        );

        // Create connections concurrently
        const promises = dishes.map((dish) =>
          repository.create({
            restaurant: {
              connect: { entityId: testData.restaurant.entityId },
            },
            dish: {
              connect: { entityId: dish.entityId },
            },
            isMenuItem: true,
            mentionCount: 5,
            totalUpvotes: 25,
            sourceDiversity: 2,
            recentMentionCount: 1,
            activityLevel: 'normal' as const,
            dishQualityScore: 75.0,
          }),
        );

        const results = await Promise.all(promises);

        expect(results).toBeDefined();
        expect(results.length).toBe(5);

        // Verify all connections have unique IDs
        const connectionIds = results.map((r) => r.connectionId);
        const uniqueIds = new Set(connectionIds);
        expect(uniqueIds.size).toBe(5);
      });
    });
  });

  describe('Error Propagation Integration', () => {
    it('should propagate database constraint violations properly', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test invalid UUID format
        await expect(
          repository.findById('invalid-uuid-format'),
        ).rejects.toThrow();

        // Test foreign key constraint violation
        await expect(
          repository.create({
            restaurant: {
              connect: { entityId: '00000000-0000-0000-0000-000000000001' },
            },
            dish: {
              connect: { entityId: testData.dishOrCategory.entityId },
            },
            isMenuItem: true,
            mentionCount: 5,
            totalUpvotes: 25,
            sourceDiversity: 2,
            recentMentionCount: 1,
            activityLevel: 'normal' as const,
            dishQualityScore: 75.0,
          }),
        ).rejects.toThrow();
      });
    });
  });
});
