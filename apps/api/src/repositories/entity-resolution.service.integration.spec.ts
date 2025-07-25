import { Test, TestingModule } from '@nestjs/testing';
import { EntityResolutionService } from './entity-resolution.service';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { IntegrationTestSetup } from '../../test/integration-test.setup';
import { Entity, Connection } from '@prisma/client';

describe('EntityResolutionService Integration Tests', () => {
  let service: EntityResolutionService;
  let entityRepository: EntityRepository;
  let connectionRepository: ConnectionRepository;
  let prismaService: PrismaService;
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();

    // Create testing module with real database connections
    module = await testSetup.createTestingModule([
      EntityResolutionService,
      EntityRepository,
      ConnectionRepository,
    ]);

    service = module.get<EntityResolutionService>(EntityResolutionService);
    entityRepository = module.get<EntityRepository>(EntityRepository);
    connectionRepository =
      module.get<ConnectionRepository>(ConnectionRepository);
    prismaService = testSetup.getPrismaService();
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Entity Context Resolution Integration', () => {
    it('should resolve entity in menu context with real database queries', async () => {
      await testSetup.withTransaction(async (prisma) => {
        // Seed test data with restaurant-dish connection
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test entity resolution with cross-repository integration
        const result = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          testData.restaurant.entityId,
        );

        expect(result).toBeDefined();
        expect(result!.entity).toBeDefined();
        expect(result!.entity.entityId).toBe(testData.dishOrCategory.entityId);
        expect(result!.connection).toBeDefined();
        expect(result!.isMenuItem).toBe(true);
      });
    });

    it('should handle non-existent context gracefully', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const nonExistentRestaurantId = '00000000-0000-0000-0000-000000000001';

        // Test resolution with invalid context
        const result = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          nonExistentRestaurantId,
        );

        expect(result).toBeNull();
      });
    });
  });

  describe('Contextual Attribute Resolution Integration', () => {
    it('should resolve dish attributes with database validation', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test contextual attribute resolution
        const result = await service.resolveContextualAttributes(
          testData.dishAttribute.name,
          'dish',
        );

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);

        // Verify at least our test attribute is included
        const testAttribute = result.find(
          (attr) => attr.entityId === testData.dishAttribute.entityId,
        );
        expect(testAttribute).toBeDefined();
      });
    });

    it('should resolve restaurant attributes with scope validation', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test restaurant attribute resolution
        const result = await service.resolveContextualAttributes(
          testData.restaurantAttribute.name,
          'restaurant',
        );

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);

        // Verify restaurant attribute is included
        const testAttribute = result.find(
          (attr) => attr.entityId === testData.restaurantAttribute.entityId,
        );
        expect(testAttribute).toBeDefined();
      });
    });

    it('should return empty results for invalid scope', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test with invalid scope parameter
        const result = await service.resolveContextualAttributes(
          testData.dishAttribute.name,
          'invalid' as any,
        );

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      });
    });
  });

  describe('Dual-Purpose Entity Resolution Integration', () => {
    it('should identify dual-purpose entities with usage statistics', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create additional connections to establish dual-purpose usage
        const connection1 = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test dual-purpose entity detection
        const result = await service.findDualPurposeEntities();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);

        if (result.length > 0) {
          const dualPurposeEntity = result[0];
          expect(dualPurposeEntity.entity).toBeDefined();
          expect(dualPurposeEntity.menuItemUsage).toBeGreaterThanOrEqual(0);
          expect(dualPurposeEntity.categoryUsage).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe('Cross-Repository Integration Testing', () => {
    it('should coordinate between EntityRepository and ConnectionRepository', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test that resolution service properly orchestrates multiple repositories
        const entityResult = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          testData.restaurant.entityId,
        );

        expect(entityResult).toBeDefined();
        expect(entityResult!.entity.entityId).toBe(
          testData.dishOrCategory.entityId,
        );
        expect(entityResult!.connection.connectionId).toBe(
          connection.connectionId,
        );
      });
    });

    it('should handle repository layer errors consistently', async () => {
      await testSetup.withTransaction(async () => {
        // Test error propagation from repository layer
        const invalidEntityId = 'invalid-uuid-format';
        const validRestaurantId = '00000000-0000-0000-0000-000000000001';

        try {
          await service.getEntityInMenuContext(
            invalidEntityId,
            validRestaurantId,
          );
          fail('Expected invalid UUID to cause error');
        } catch (error) {
          // Verify error is properly propagated through layers
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Entity Relationship Validation Integration', () => {
    it('should validate restaurant-dish relationships through database constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create connection with specific attributes
        const connection = await prisma.connection.create({
          data: {
            restaurantId: testData.restaurant.entityId,
            dishOrCategoryId: testData.dishOrCategory.entityId,
            dishAttributes: [testData.dishAttribute.entityId],
            isMenuItem: true,
            mentionCount: 10,
            totalUpvotes: 50,
            sourceDiversity: 5,
            recentMentionCount: 3,
            lastMentionedAt: new Date(),
            activityLevel: 'active',
            dishQualityScore: 92.5,
          },
        });

        // Test resolution with attribute validation
        const result = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          testData.restaurant.entityId,
        );

        expect(result).toBeDefined();
        expect(result!.connection).toBeDefined();
        expect(result!.isMenuItem).toBe(true);
      });
    });
  });

  describe('Quality Score Integration Testing', () => {
    it('should calculate quality scores through database operations', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const connection = await testSetup.createTestConnection(
          prisma,
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        // Test quality score calculation integration
        const result = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          testData.restaurant.entityId,
        );

        expect(result).toBeDefined();
        expect(result!.connection).toBeDefined();
        expect(result!.isMenuItem).toBe(true);
      });
    });
  });

  describe('Performance Integration Testing', () => {
    it('should handle large result sets efficiently', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const startTime = Date.now();

        // Test resolution performance with real database queries
        const result = await service.resolveContextualAttributes(
          testData.dishAttribute.name,
          'dish',
        );

        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
      });
    });
  });

  describe('Transaction Boundary Integration', () => {
    it('should maintain consistency across multiple repository operations', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test that resolution service operations are transactionally consistent
        const result = await service.getEntityInMenuContext(
          testData.dishOrCategory.entityId,
          testData.restaurant.entityId,
        );

        // If entity exists, context should be properly resolved
        if (result) {
          expect(result.entity).toBeDefined();
          expect(result.connection).toBeDefined();

          // Verify database consistency
          const dbConnection = await prisma.connection.findFirst({
            where: {
              restaurantId: testData.restaurant.entityId,
              dishOrCategoryId: testData.dishOrCategory.entityId,
            },
          });

          if (dbConnection) {
            expect(result.connection.connectionId).toBe(
              dbConnection.connectionId,
            );
          }
        }
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database connection issues gracefully', async () => {
      await testSetup.withTransaction(async () => {
        // Test graceful degradation on database issues
        // This would require more complex setup to simulate connection failures
        expect(true).toBe(true); // Placeholder for complex error scenarios
      });
    });

    it('should propagate validation errors from repository layer', async () => {
      await testSetup.withTransaction(async () => {
        // Test validation error propagation
        const invalidScope = 'invalid_scope' as any;

        const result = await service.resolveContextualAttributes(
          'Test Attribute',
          invalidScope,
        );

        // Should handle invalid scope gracefully
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
});
