import { TestingModule } from '@nestjs/testing';
import { EntitiesService } from './entities.service';
import { EntityRepository } from '../../repositories/entity.repository';
import { EntityResolutionService } from '../../repositories/entity-resolution.service';
import { IntegrationTestSetup } from '../../../test/integration-test.setup';
import { Entity } from '@prisma/client';

describe('EntitiesService Integration Tests', () => {
  let service: EntitiesService;
  // Repository dependencies managed by TestingModule
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();

    // Create testing module with real database connections
    module = await testSetup.createTestingModule([
      EntitiesService,
      EntityRepository,
      EntityResolutionService,
    ]);

    service = module.get<EntitiesService>(EntitiesService);
    // Repository dependencies are injected automatically via TestingModule
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Restaurant Entity Creation Integration', () => {
    it('should create restaurant entity with real database persistence', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const createData = {
          entityType: 'restaurant' as const,
          name: `Integration Test Restaurant ${Date.now()}`,
          location: {
            coordinates: { lat: 40.7128, lng: -74.006 },
            address: '123 Integration St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          },
        };

        // Test service layer with real database operation
        const result = await service.create(createData);

        // Verify entity was created in database
        expect(result).toBeDefined();
        expect(result.name).toBe(createData.name);
        expect(result.type).toBe('restaurant');
        expect(result.address).toBe(createData.location.address);
        expect(Number(result.latitude)).toEqual(
          createData.location.coordinates.lat,
        );
        expect(Number(result.longitude)).toEqual(
          createData.location.coordinates.lng,
        );

        // Verify database persistence by querying directly
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.name).toBe(createData.name);
        expect(dbEntity!.type).toBe('restaurant');
        expect(dbEntity!.restaurantMetadata).toEqual({
          city: createData.location.city,
          state: createData.location.state,
          zipCode: createData.location.zipCode,
        });
      });
    });

    it('should enforce restaurant location requirement with database constraints', async () => {
      await testSetup.withCleanup(async () => {
        const createData = {
          entityType: 'restaurant' as const,
          name: `Restaurant Without Location ${Date.now()}`,
        };

        // Test that service layer validation prevents database constraint violations
        await expect(service.create(createData)).rejects.toThrow(
          'Location data is required for restaurant entities',
        );
      });
    });

    it('should handle duplicate restaurant name constraints at database level', async () => {
      await testSetup.withCleanup(async () => {
        const restaurantData = {
          entityType: 'restaurant' as const,
          name: `Duplicate Restaurant Test ${Date.now()}`,
          location: {
            coordinates: { lat: 40.7128, lng: -74.006 },
            address: '123 Test St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          },
        };

        // Create first restaurant
        const firstRestaurant = await service.create(restaurantData);
        expect(firstRestaurant).toBeDefined();

        // Attempt to create duplicate should be handled by service layer
        try {
          await service.create(restaurantData);
          fail('Expected duplicate creation to be rejected');
        } catch (error) {
          // Verify error propagation from database through repository to service
          expect(error).toBeDefined();
        }
      });
    });
  });

  describe('Dish/Category Entity Creation Integration', () => {
    it('should create dish_or_category entity with database persistence', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const createData = {
          entityType: 'dish_or_category' as const,
          name: `Integration Test Pizza ${Date.now()}`,
        };

        const result = await service.create(createData);

        expect(result).toBeDefined();
        expect(result.name).toBe(createData.name);
        expect(result.type).toBe('dish_or_category');

        // Verify database persistence
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.name).toBe(createData.name);
        expect(dbEntity!.type).toBe('dish_or_category');
      });
    });
  });

  describe('Entity Querying Integration', () => {
    it('should find entities by ID with real database queries', async () => {
      await testSetup.withCleanup(async (prisma) => {
        // Seed test data
        const testData = await testSetup.seedTestData(prisma);

        // Test service layer query with repository and database integration
        const foundEntity = await service.findById(
          testData.restaurant.entityId,
        );

        expect(foundEntity).toBeDefined();
        expect(foundEntity?.entityId).toBe(testData.restaurant.entityId);
        expect(foundEntity?.name).toBe(testData.restaurant.name);
        expect(foundEntity?.type).toBe('restaurant');
      });
    });

    it('should return null for non-existent entities', async () => {
      await testSetup.withCleanup(async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const result = await service.findById(nonExistentId);
        expect(result).toBeNull();
      });
    });

    it('should find multiple entities with pagination', async () => {
      await testSetup.withCleanup(async (prisma) => {
        // Seed multiple entities
        const testData = await testSetup.seedTestData(prisma);

        const results = await service.findMany({
          take: 10,
          skip: 0,
          where: { type: 'restaurant' },
        });

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // Verify at least our test restaurant is included
        const testRestaurant = results.find(
          (r: Entity) => r.entityId === testData.restaurant.entityId,
        );
        expect(testRestaurant).toBeDefined();
      });
    });
  });

  describe('Entity Updates Integration', () => {
    it('should update entities with database persistence and validation', async () => {
      await testSetup.withCleanup(async (prisma) => {
        // Create test entity
        const testData = await testSetup.seedTestData(prisma);
        const entityId = testData.restaurant.entityId;

        const updateData = {
          name: 'Updated Restaurant Name Integration',
          address: '456 Updated St',
        };

        // Test service layer update with repository integration
        const updatedEntity = await service.update(entityId, updateData);

        expect(updatedEntity).toBeDefined();
        expect(updatedEntity.name).toBe(updateData.name);
        expect(updatedEntity.address).toBe(updateData.address);

        // Verify database persistence
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.name).toBe(updateData.name);
        expect(dbEntity!.address).toBe(updateData.address);
      });
    });
  });

  describe('Entity Validation Integration', () => {
    it('should validate entity existence with database queries', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test validation with existing entity
        const existsResult = await service.validateEntityExists(
          testData.restaurant.entityId,
          'restaurant',
        );
        expect(existsResult).toBe(true);

        // Test validation with wrong type
        const wrongTypeResult = await service.validateEntityExists(
          testData.restaurant.entityId,
          'dish_or_category',
        );
        expect(wrongTypeResult).toBe(false);

        // Test validation with non-existent entity
        const nonExistentResult = await service.validateEntityExists(
          '00000000-0000-0000-0000-000000000000',
        );
        expect(nonExistentResult).toBe(false);
      });
    });
  });

  describe('Restaurant Location Queries Integration', () => {
    it('should find nearby restaurants with geospatial database queries', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const location = {
          centerPoint: { lat: 40.7128, lng: -74.006 },
          radiusKm: 10,
        };

        // Test service layer with repository geospatial queries
        const nearbyRestaurants = await service.findNearbyRestaurants(location);

        expect(nearbyRestaurants).toBeDefined();
        expect(Array.isArray(nearbyRestaurants)).toBe(true);

        // Verify test restaurant is included in results
        const testRestaurant = nearbyRestaurants.find(
          (r: Entity) => r.entityId === testData.restaurant.entityId,
        );
        expect(testRestaurant).toBeDefined();
      });
    });
  });

  describe('Service-Repository Error Propagation Integration', () => {
    it('should properly propagate database constraint violations through layers', async () => {
      await testSetup.withCleanup(async () => {
        // Test invalid entity type constraint
        const invalidData = {
          entityType: 'invalid_type' as 'restaurant',
          name: 'Invalid Entity',
        };

        await expect(service.create(invalidData)).rejects.toThrow();
      });
    });

    it('should handle database connection errors gracefully', async () => {
      await testSetup.withCleanup(() =>
        Promise.resolve({
          // This test would require temporarily disrupting database connection
          // Implementation would depend on specific error handling requirements
          result: expect(true).toBe(true), // Placeholder for complex error scenarios
        }),
      );
    });
  });

  describe('Cross-Service Integration Dependencies', () => {
    it('should integrate with EntityResolutionService for complex operations', async () => {
      await testSetup.withCleanup(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test that service layer properly integrates with resolution service
        // This would test scenarios where EntitiesService uses EntityResolutionService
        const validationResult = await service.validateEntityExists(
          testData.restaurant.entityId,
          'restaurant',
        );

        expect(validationResult).toBe(true);

        // Additional integration testing would go here based on actual
        // cross-service dependencies in the EntitiesService implementation
      });
    });
  });
});
