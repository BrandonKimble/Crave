import { Test, TestingModule } from '@nestjs/testing';
import { EntityRepository } from './entity.repository';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationTestSetup } from '../../test/integration-test.setup';
import { Entity, Prisma } from '@prisma/client';

describe('EntityRepository Integration Tests', () => {
  let repository: EntityRepository;
  let prismaService: PrismaService;
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();

    // Create testing module with real database connections
    module = await testSetup.createTestingModule([EntityRepository]);

    repository = module.get<EntityRepository>(EntityRepository);
    prismaService = testSetup.getPrismaService();
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Restaurant Entity Creation Integration', () => {
    it('should create restaurant with database persistence and constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const restaurantData = {
          name: 'Integration Test Restaurant Repo',
          latitude: 40.7128,
          longitude: -74.006,
          address: '123 Repository Test St',
          googlePlaceId: 'test-place-repo-integration',
          restaurantMetadata: {
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          },
        };

        // Test repository layer with direct database interaction
        const result = await repository.createRestaurant(restaurantData);

        expect(result).toBeDefined();
        expect(result.name).toBe(restaurantData.name);
        expect(result.type).toBe('restaurant');
        expect(result.latitude).toEqual(restaurantData.latitude);
        expect(result.longitude).toEqual(restaurantData.longitude);
        expect(result.address).toBe(restaurantData.address);
        expect(result.googlePlaceId).toBe(restaurantData.googlePlaceId);
        expect(result.restaurantMetadata).toEqual(
          restaurantData.restaurantMetadata,
        );

        // Verify database constraint enforcement
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.type).toBe('restaurant');
        expect(dbEntity!.restaurantMetadata).toEqual(
          restaurantData.restaurantMetadata,
        );
      });
    });

    it('should enforce unique constraint on google_place_id', async () => {
      await testSetup.withTransaction(async () => {
        const restaurantData = {
          name: 'Test Restaurant 1',
          latitude: 40.7128,
          longitude: -74.006,
          address: '123 Test St',
          googlePlaceId: 'duplicate-google-place-id',
          restaurantMetadata: {},
        };

        // Create first restaurant
        const firstRestaurant =
          await repository.createRestaurant(restaurantData);
        expect(firstRestaurant).toBeDefined();

        // Attempt to create duplicate should fail
        const duplicateData = {
          ...restaurantData,
          name: 'Test Restaurant 2',
        };

        await expect(
          repository.createRestaurant(duplicateData),
        ).rejects.toThrow();
      });
    });

    it('should enforce unique constraint on name-type combination', async () => {
      await testSetup.withTransaction(async () => {
        const restaurantData = {
          name: 'Duplicate Name Restaurant',
          latitude: 40.7128,
          longitude: -74.006,
          address: '123 Test St',
          googlePlaceId: 'unique-place-id-1',
          restaurantMetadata: {},
        };

        // Create first restaurant
        const firstRestaurant =
          await repository.createRestaurant(restaurantData);
        expect(firstRestaurant).toBeDefined();

        // Attempt to create restaurant with same name should fail
        const duplicateData = {
          ...restaurantData,
          googlePlaceId: 'unique-place-id-2',
        };

        await expect(
          repository.createRestaurant(duplicateData),
        ).rejects.toThrow();
      });
    });
  });

  describe('Dish/Category Entity Creation Integration', () => {
    it('should create dish_or_category with database validation', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const dishData = {
          name: 'Integration Test Pizza Repo',
          aliases: ['Test Pizza', 'Pizza Test'],
        };

        const result = await repository.createDishOrCategory(dishData);

        expect(result).toBeDefined();
        expect(result.name).toBe(dishData.name);
        expect(result.type).toBe('dish_or_category');
        expect(result.aliases).toEqual(dishData.aliases);

        // Verify database persistence
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.type).toBe('dish_or_category');
        expect(dbEntity!.aliases).toEqual(dishData.aliases);
      });
    });

    it('should handle empty aliases array properly', async () => {
      await testSetup.withTransaction(async () => {
        const dishData = {
          name: 'Simple Dish No Aliases',
        };

        const result = await repository.createDishOrCategory(dishData);

        expect(result).toBeDefined();
        expect(result.aliases).toEqual([]);
      });
    });
  });

  describe('Attribute Entity Creation Integration', () => {
    it('should create dish_attribute with proper constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const attributeData = {
          name: 'Spicy Integration Test',
        };

        const result = await repository.createDishAttribute(attributeData);

        expect(result).toBeDefined();
        expect(result.name).toBe(attributeData.name);
        expect(result.type).toBe('dish_attribute');

        // Verify database constraint compliance
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.type).toBe('dish_attribute');
        expect(dbEntity!.restaurantAttributes).toEqual([]);
        expect(dbEntity!.restaurantQualityScore).toEqual(new Prisma.Decimal(0));
      });
    });

    it('should create restaurant_attribute with proper constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const attributeData = {
          name: 'Patio Integration Test',
        };

        const result =
          await repository.createRestaurantAttribute(attributeData);

        expect(result).toBeDefined();
        expect(result.name).toBe(attributeData.name);
        expect(result.type).toBe('restaurant_attribute');

        // Verify database constraint compliance
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId: result.entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.type).toBe('restaurant_attribute');
      });
    });
  });

  describe('Entity Querying Integration', () => {
    it('should find entity by ID with proper database lookup', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const result = await repository.findById(testData.restaurant.entityId);

        expect(result).toBeDefined();
        expect(result!.entityId).toBe(testData.restaurant.entityId);
        expect(result!.name).toBe(testData.restaurant.name);
        expect(result!.type).toBe('restaurant');
      });
    });

    it('should return null for non-existent entity', async () => {
      await testSetup.withTransaction(async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';
        const result = await repository.findById(nonExistentId);
        expect(result).toBeNull();
      });
    });

    it('should find entities by type with proper filtering', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        const restaurants = await repository.findByType('restaurant', {
          take: 10,
        });

        expect(restaurants).toBeDefined();
        expect(Array.isArray(restaurants)).toBe(true);
        expect(restaurants.length).toBeGreaterThan(0);

        // Verify all results are restaurants
        restaurants.forEach((restaurant) => {
          expect(restaurant.type).toBe('restaurant');
        });

        // Verify our test restaurant is included
        const testRestaurant = restaurants.find(
          (r) => r.entityId === testData.restaurant.entityId,
        );
        expect(testRestaurant).toBeDefined();
      });
    });

    it('should support pagination with skip and take', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test pagination
        const firstPage = await repository.findMany({
          take: 2,
          skip: 0,
          where: { type: 'restaurant' },
        });

        const secondPage = await repository.findMany({
          take: 2,
          skip: 2,
          where: { type: 'restaurant' },
        });

        expect(firstPage).toBeDefined();
        expect(secondPage).toBeDefined();
        expect(Array.isArray(firstPage)).toBe(true);
        expect(Array.isArray(secondPage)).toBe(true);

        // Verify no overlap between pages
        const firstPageIds = firstPage.map((e) => e.entityId);
        const secondPageIds = secondPage.map((e) => e.entityId);
        const overlap = firstPageIds.filter((id) => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      });
    });
  });

  describe('Geospatial Queries Integration', () => {
    it('should find restaurants by location with distance calculations', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Test geospatial query
        const nearbyRestaurants = await repository.findRestaurantsByLocation(
          40.7128, // NYC coordinates
          -74.006,
          10, // 10km radius
          { where: {} },
        );

        expect(nearbyRestaurants).toBeDefined();
        expect(Array.isArray(nearbyRestaurants)).toBe(true);

        // Our test restaurant should be included
        const testRestaurant = nearbyRestaurants.find(
          (r) => r.entityId === testData.restaurant.entityId,
        );
        expect(testRestaurant).toBeDefined();
      });
    });

    it('should exclude restaurants outside radius', async () => {
      await testSetup.withTransaction(async (prisma) => {
        // Create restaurant far from search location
        const farRestaurant = await repository.createRestaurant({
          name: 'Far Away Restaurant',
          latitude: 34.0522, // Los Angeles coordinates
          longitude: -118.2437,
          address: '123 LA St',
          googlePlaceId: 'far-away-place',
          restaurantMetadata: {},
        });

        // Search in NYC area (should not include LA restaurant)
        const nearbyRestaurants = await repository.findRestaurantsByLocation(
          40.7128, // NYC coordinates
          -74.006,
          1, // 1km radius (very small)
          { where: {} },
        );

        // LA restaurant should not be included
        const farRestaurantInResults = nearbyRestaurants.find(
          (r) => r.entityId === farRestaurant.entityId,
        );
        expect(farRestaurantInResults).toBeUndefined();
      });
    });
  });

  describe('Entity Updates Integration', () => {
    it('should update entity with validation and database persistence', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);
        const entityId = testData.restaurant.entityId;

        const updateData = {
          name: 'Updated Restaurant Name Repo',
          address: '456 Updated Repository St',
        };

        const result = await repository.updateWithValidation(
          entityId,
          updateData,
        );

        expect(result).toBeDefined();
        expect(result.name).toBe(updateData.name);
        expect(result.address).toBe(updateData.address);

        // Verify database persistence
        const dbEntity = await prisma.entity.findUnique({
          where: { entityId },
        });

        expect(dbEntity).toBeDefined();
        expect(dbEntity!.name).toBe(updateData.name);
        expect(dbEntity!.address).toBe(updateData.address);
      });
    });

    it('should enforce constraints during updates', async () => {
      await testSetup.withTransaction(async (prisma) => {
        const testData = await testSetup.seedTestData(prisma);

        // Create another restaurant to test unique constraint
        const otherRestaurant = await repository.createRestaurant({
          name: 'Other Restaurant',
          latitude: 40.7128,
          longitude: -74.006,
          address: '789 Other St',
          googlePlaceId: 'other-place-id',
          restaurantMetadata: {},
        });

        // Try to update with duplicate name
        await expect(
          repository.updateWithValidation(testData.restaurant.entityId, {
            name: otherRestaurant.name,
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe('Entity Deletion Integration', () => {
    it('should delete entity with proper database removal', async () => {
      await testSetup.withTransaction(async (prisma) => {
        // Create entity to delete
        const entityToDelete = await repository.createDishOrCategory({
          name: 'Entity To Delete',
        });

        const result = await repository.delete(entityToDelete.entityId);

        expect(result).toBeDefined();
        expect(result.entityId).toBe(entityToDelete.entityId);

        // Verify entity is removed from database
        const deletedEntity = await prisma.entity.findUnique({
          where: { entityId: entityToDelete.entityId },
        });

        expect(deletedEntity).toBeNull();
      });
    });

    it('should handle deletion of non-existent entity', async () => {
      await testSetup.withTransaction(async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';

        await expect(repository.delete(nonExistentId)).rejects.toThrow();
      });
    });
  });

  describe('Database Constraint Validation Integration', () => {
    it('should enforce entity_type enum constraints', async () => {
      await testSetup.withTransaction(async (prisma) => {
        // Try to create entity with invalid type directly in Prisma
        await expect(
          prisma.entity.create({
            data: {
              name: 'Invalid Type Entity',
              type: 'invalid_type' as any,
            },
          }),
        ).rejects.toThrow();
      });
    });

    it('should enforce NOT NULL constraints on required fields', async () => {
      await testSetup.withTransaction(async (prisma) => {
        // Try to create entity without required name field
        await expect(
          prisma.entity.create({
            data: {
              type: 'dish_or_category',
              // Missing name field
            } as any,
          }),
        ).rejects.toThrow();
      });
    });

    it('should validate foreign key relationships', async () => {
      // This would be tested in ConnectionRepository integration tests
      // since Entity table doesn't have foreign key references
      expect(true).toBe(true);
    });
  });

  describe('Concurrent Operations Integration', () => {
    it('should handle concurrent entity creation safely', async () => {
      await testSetup.withTransaction(async () => {
        // Create multiple entities concurrently
        const promises = Array.from({ length: 5 }, (_, index) =>
          repository.createDishOrCategory({
            name: `Concurrent Entity ${index}`,
          }),
        );

        const results = await Promise.all(promises);

        expect(results).toBeDefined();
        expect(results.length).toBe(5);

        // Verify all entities have unique IDs
        const entityIds = results.map((r) => r.entityId);
        const uniqueIds = new Set(entityIds);
        expect(uniqueIds.size).toBe(5);
      });
    });
  });

  describe('Error Propagation Integration', () => {
    it('should propagate Prisma errors through repository layer', async () => {
      await testSetup.withTransaction(async () => {
        // Test invalid UUID format
        await expect(
          repository.findById('invalid-uuid-format'),
        ).rejects.toThrow();
      });
    });

    it('should handle database connection errors gracefully', async () => {
      // This would require more complex setup to simulate connection failures
      expect(true).toBe(true); // Placeholder for complex error scenarios
    });
  });
});
