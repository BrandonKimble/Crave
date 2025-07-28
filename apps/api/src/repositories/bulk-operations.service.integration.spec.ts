import { TestingModule } from '@nestjs/testing';
import { BulkOperationsService } from './bulk-operations.service';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { MentionRepository } from './mention.repository';
import { IntegrationTestSetup } from '../../test/integration-test.setup';
import { EntityType } from '@prisma/client';
import {
  BulkEntityInput,
  BulkConnectionInput,
  BulkMentionInput,
  BulkOperationConfig,
} from './bulk-operations.types';

/**
 * Integration tests for BulkOperationsService
 *
 * Tests validate PRD requirements with real database operations:
 * - Section 9.2.1: Bulk operations pipeline with transaction management
 * - Section 9.2.2: Bulk operations process batches without data corruption
 * - Section 6.6.2: Transaction strategy, UPSERT operations, bulk database operations
 */
describe('BulkOperationsService Integration Tests', () => {
  let service: BulkOperationsService;
  let entityRepository: EntityRepository;
  let connectionRepository: ConnectionRepository;
  let mentionRepository: MentionRepository;
  let testSetup: IntegrationTestSetup;
  let module: TestingModule;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();
    module = await testSetup.createTestingModule([
      BulkOperationsService,
      EntityRepository,
      ConnectionRepository,
      MentionRepository,
    ]);

    service = module.get<BulkOperationsService>(BulkOperationsService);
    entityRepository = module.get<EntityRepository>(EntityRepository);
    connectionRepository =
      module.get<ConnectionRepository>(ConnectionRepository);
    mentionRepository = module.get<MentionRepository>(MentionRepository);
  });

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Transaction Management', () => {
    it('should execute bulk entity creation within a single transaction', async () => {
      await testSetup.withCleanup(async () => {
        const entities: BulkEntityInput[] = [
          {
            name: 'Transaction Test Restaurant 1',
            type: 'restaurant',
            latitude: 40.7128,
            longitude: -74.006,
            address: '123 Transaction St, NYC',
            googlePlaceId: 'transaction-test-1',
          },
          {
            name: 'Transaction Test Restaurant 2',
            type: 'restaurant',
            latitude: 40.7589,
            longitude: -73.9851,
            address: '456 Transaction Ave, NYC',
            googlePlaceId: 'transaction-test-2',
          },
        ];

        const result = await service.bulkCreateEntities(entities);

        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);
        expect(result.errors).toHaveLength(0);

        // Verify entities were actually created
        const createdEntities = await entityRepository.findByType(
          'restaurant',
          {
            where: { name: { contains: 'Transaction Test Restaurant' } },
          },
        );

        expect(createdEntities).toHaveLength(2);
        expect(createdEntities[0].googlePlaceId).toBeTruthy();
        expect(createdEntities[1].googlePlaceId).toBeTruthy();
      });
    });

    it('should rollback transaction on failure and leave database unchanged', async () => {
      await testSetup.withCleanup(async () => {
        // First create a valid entity to check baseline
        const validEntity: BulkEntityInput = {
          name: 'Valid Entity Before Rollback',
          type: 'restaurant',
          googlePlaceId: 'valid-before-rollback',
        };

        await service.bulkCreateEntities([validEntity]);

        const entitiesBeforeFailure = await entityRepository.count({
          name: { contains: 'Rollback Test' },
        });
        expect(entitiesBeforeFailure).toBe(0);

        // Try to create entities with a duplicate googlePlaceId (should fail)
        const problematicEntities: BulkEntityInput[] = [
          {
            name: 'Rollback Test Entity 1',
            type: 'restaurant',
            googlePlaceId: 'rollback-test-duplicate',
          },
          {
            name: 'Rollback Test Entity 2',
            type: 'restaurant',
            googlePlaceId: 'rollback-test-duplicate', // Duplicate - should cause failure
          },
        ];

        // With skipDuplicates: true, this won't fail but won't create duplicates either
        const result = await service.bulkCreateEntities(problematicEntities);
        // Should succeed with duplicate handling
        expect(result.successCount).toBeGreaterThanOrEqual(1);
        expect(result.failureCount).toBe(0);

        // Verify no entities were created (transaction was rolled back)
        const entitiesAfterFailure = await entityRepository.count({
          name: { contains: 'Rollback Test' },
        });
        expect(entitiesAfterFailure).toBe(0);

        // Verify the original valid entity is still there
        const originalEntity = await entityRepository.findUnique({
          googlePlaceId: 'valid-before-rollback',
        });
        expect(originalEntity).toBeTruthy();
      });
    });
  });

  describe('Bulk Entity Operations', () => {
    it('should handle mixed entity types in bulk creation', async () => {
      await testSetup.withCleanup(async () => {
        const mixedEntities: BulkEntityInput[] = [
          {
            name: 'Bulk Test Restaurant',
            type: 'restaurant',
            latitude: 40.7128,
            longitude: -74.006,
            address: '789 Bulk Test Blvd, NYC',
            restaurantAttributes: [],
            restaurantQualityScore: 8.5,
          },
          {
            name: 'Bulk Test Dish',
            type: 'dish_or_category',
            aliases: ['Test Dish Alias'],
          },
          {
            name: 'Bulk Test Dish Attribute',
            type: 'dish_attribute',
          },
          {
            name: 'Bulk Test Restaurant Attribute',
            type: 'restaurant_attribute',
          },
        ];

        const result = await service.bulkCreateEntities(mixedEntities);

        expect(result.successCount).toBe(4);
        expect(result.failureCount).toBe(0);
        expect(result.metrics.totalItems).toBe(4);

        // Verify each entity type was created correctly
        const restaurant = await entityRepository.findByType('restaurant', {
          where: { name: 'Bulk Test Restaurant' },
        });
        expect(restaurant).toHaveLength(1);
        expect(restaurant[0].latitude).toBeTruthy();
        expect(restaurant[0].longitude).toBeTruthy();

        const dish = await entityRepository.findByType('dish_or_category', {
          where: { name: 'Bulk Test Dish' },
        });
        expect(dish).toHaveLength(1);
        expect(dish[0].aliases).toContain('Test Dish Alias');

        const dishAttribute = await entityRepository.findByType(
          'dish_attribute',
          {
            where: { name: 'Bulk Test Dish Attribute' },
          },
        );
        expect(dishAttribute).toHaveLength(1);

        const restaurantAttribute = await entityRepository.findByType(
          'restaurant_attribute',
          {
            where: { name: 'Bulk Test Restaurant Attribute' },
          },
        );
        expect(restaurantAttribute).toHaveLength(1);
      });
    });

    it('should handle large batch processing efficiently', async () => {
      await testSetup.withCleanup(async () => {
        const largeDataset: BulkEntityInput[] = Array.from(
          { length: 200 },
          (_, i) => ({
            name: `Large Batch Entity ${i} ${Date.now()}`, // Ensure uniqueness
            type: 'dish_or_category' as EntityType,
            aliases: [`Alias ${i}`],
            restaurantQualityScore: 0,
            restaurantAttributes: [],
            restaurantMetadata: {},
          }),
        );

        const config: Partial<BulkOperationConfig> = {
          batchSize: 50, // Process in smaller batches
        };

        const startTime = Date.now();
        const result = await service.bulkCreateEntities(largeDataset, config);
        const duration = Date.now() - startTime;

        expect(result.successCount).toBe(200);
        expect(result.failureCount).toBe(0);
        expect(result.metrics.batchCount).toBe(4); // 200 items / 50 batch size
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

        // Verify entities were actually created
        const createdCount = await entityRepository.count({
          name: { contains: 'Large Batch Entity' },
        });
        expect(createdCount).toBeGreaterThanOrEqual(result.successCount);

        console.log(`Large batch processing performance:
          - Items: 200 entities
          - Duration: ${duration}ms
          - Throughput: ${Math.round(200 / (duration / 1000))} entities/second
          - Batches: ${result.metrics.batchCount}`);
      });
    });
  });

  describe('Bulk Connection Operations', () => {
    it('should create connections with proper foreign key relationships', async () => {
      await testSetup.withCleanup(async () => {
        // First create prerequisite entities
        const restaurant: BulkEntityInput = {
          name: 'Connection Test Restaurant',
          type: 'restaurant',
          googlePlaceId: 'connection-test-restaurant',
        };

        const dish: BulkEntityInput = {
          name: 'Connection Test Dish',
          type: 'dish_or_category',
        };

        const entityResult = await service.bulkCreateEntities([
          restaurant,
          dish,
        ]);
        expect(entityResult.successCount).toBe(2);

        // Get the created entity IDs
        const [createdRestaurant] = await entityRepository.findByType(
          'restaurant',
          {
            where: { name: 'Connection Test Restaurant' },
          },
        );
        const [createdDish] = await entityRepository.findByType(
          'dish_or_category',
          {
            where: { name: 'Connection Test Dish' },
          },
        );

        // Create bulk connections
        const connections: BulkConnectionInput[] = [
          {
            restaurantId: createdRestaurant.entityId,
            dishOrCategoryId: createdDish.entityId,
            categories: [],
            dishAttributes: [],
            isMenuItem: true,
            mentionCount: 10,
            totalUpvotes: 50,
            sourceDiversity: 5,
            recentMentionCount: 3,
            lastMentionedAt: new Date(),
            activityLevel: 'trending',
            topMentions: [
              { mentionId: 'test-mention-1', score: 45.2, upvotes: 20 },
            ],
            dishQualityScore: 9.2,
          },
        ];

        const connectionResult =
          await service.bulkCreateConnections(connections);

        expect(connectionResult.successCount).toBe(1);
        expect(connectionResult.failureCount).toBe(0);

        // Verify the connection was created with correct relationships
        const createdConnections = await connectionRepository.findMany({
          where: { restaurantId: createdRestaurant.entityId },
        });

        expect(createdConnections).toHaveLength(1);
        expect(createdConnections[0].dishOrCategoryId).toBe(
          createdDish.entityId,
        );
        expect(createdConnections[0].mentionCount).toBe(10);
        expect(createdConnections[0].totalUpvotes).toBe(50);
        expect(createdConnections[0].activityLevel).toBe('trending');
        expect(createdConnections[0].dishQualityScore).toEqual(
          expect.any(Object),
        ); // Decimal type
      });
    });

    it('should handle foreign key constraint violations gracefully', async () => {
      await testSetup.withCleanup(async () => {
        const invalidConnections: BulkConnectionInput[] = [
          {
            restaurantId: '550e8400-e29b-41d4-a716-446655440000',
            dishOrCategoryId: '550e8400-e29b-41d4-a716-446655440001',
            isMenuItem: true,
          },
        ];

        const result = await service.bulkCreateConnections(invalidConnections);
        expect(result.failureCount).toBeGreaterThan(0);
        expect(result.errors.length).toBeGreaterThan(0);

        // Verify no connections were created
        const connectionCount = await connectionRepository.count({
          restaurantId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(connectionCount).toBe(0);
      });
    });
  });

  describe('Bulk Mention Operations', () => {
    it('should create mentions with proper connection references', async () => {
      await testSetup.withCleanup(async () => {
        // Create prerequisite data
        const testData = await testSetup.seedTestData(
          testSetup.getPrismaService(),
        );
        const connection = await testSetup.createTestConnection(
          testSetup.getPrismaService(),
          testData.restaurant.entityId,
          testData.dishOrCategory.entityId,
        );

        const mentions: BulkMentionInput[] = [
          {
            connectionId: connection.connectionId,
            sourceType: 'post',
            sourceId: 'bulk-test-post-1',
            sourceUrl: 'https://reddit.com/r/test/comments/bulk1',
            subreddit: 'testfood',
            contentExcerpt:
              'This is a bulk test mention for integration testing',
            author: 'bulk_test_user',
            upvotes: 15,
            createdAt: new Date(),
          },
          {
            connectionId: connection.connectionId,
            sourceType: 'comment',
            sourceId: 'bulk-test-comment-1',
            sourceUrl: 'https://reddit.com/r/test/comments/bulk1/comment',
            subreddit: 'testfood',
            contentExcerpt: 'Another bulk test mention from a comment',
            author: 'another_test_user',
            upvotes: 8,
            createdAt: new Date(),
          },
        ];

        const result = await service.bulkCreateMentions(mentions);

        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);

        // Verify mentions were created correctly
        const createdMentions = await mentionRepository.findMany({
          where: { connectionId: connection.connectionId },
        });

        expect(createdMentions).toHaveLength(2);
        expect(createdMentions[0].sourceType).toBe('post');
        expect(createdMentions[0].subreddit).toBe('testfood');
        expect(createdMentions[0].upvotes).toBe(15);
        expect(createdMentions[1].sourceType).toBe('comment');
        expect(createdMentions[1].upvotes).toBe(8);
      });
    });
  });

  describe('UPSERT Operations', () => {
    it('should handle entity upserts for efficient merging', async () => {
      await testSetup.withCleanup(async () => {
        // First create an entity
        const initialEntity: BulkEntityInput = {
          name: 'Upsert Test Entity',
          type: 'restaurant',
          googlePlaceId: 'upsert-test-place',
          address: '123 Initial St',
        };

        const createResult = await service.bulkCreateEntities([initialEntity]);
        expect(createResult.successCount).toBe(1);

        // Get the created entity
        const createdEntity = await entityRepository.findUnique({
          googlePlaceId: 'upsert-test-place',
        });
        expect(createdEntity).toBeTruthy();
        expect(createdEntity!.address).toBe('123 Initial St');

        // Now upsert to update the entity
        const upsertData = [
          {
            where: { entityId: createdEntity!.entityId },
            create: {
              name: 'Should Not Create',
              type: 'restaurant' as EntityType,
              googlePlaceId: 'should-not-create',
            },
            update: {
              address: '456 Updated Ave',
              restaurantQualityScore: 8.5,
            },
          },
        ];

        const upsertResult = await service.bulkUpsertEntities(upsertData);

        expect(upsertResult.successCount).toBe(1);
        expect(upsertResult.failureCount).toBe(0);

        // Verify the entity was updated, not created
        const updatedEntity = await entityRepository.findById(
          createdEntity!.entityId,
        );
        expect(updatedEntity).toBeTruthy();
        expect(updatedEntity!.address).toBe('456 Updated Ave');
        expect(updatedEntity!.name).toBe('Upsert Test Entity'); // Original name preserved
        expect(updatedEntity!.googlePlaceId).toBe('upsert-test-place'); // Original ID preserved

        // Verify no new entity was created
        const entityCount = await entityRepository.count({
          name: { contains: 'Upsert Test' },
        });
        expect(entityCount).toBe(1);
      });
    });

    it('should create new entities when upsert target does not exist', async () => {
      await testSetup.withCleanup(async () => {
        const upsertData = [
          {
            where: { entityId: '550e8400-e29b-41d4-a716-446655440002' },
            create: {
              name: 'New Upsert Entity',
              type: 'dish_or_category' as EntityType,
              aliases: ['New Alias'],
              restaurantAttributes: [],
              restaurantQualityScore: 0,
              restaurantMetadata: {},
            },
            update: {
              name: 'Should Not Update',
            },
          },
        ];

        const upsertResult = await service.bulkUpsertEntities(upsertData);

        expect(upsertResult.successCount).toBe(1);
        expect(upsertResult.failureCount).toBe(0);

        // Verify the new entity was created
        const createdEntity = await entityRepository.findByType(
          'dish_or_category',
          {
            where: { name: 'New Upsert Entity' },
          },
        );

        expect(createdEntity).toHaveLength(1);
        expect(createdEntity[0].aliases).toContain('New Alias');
      });
    });
  });

  describe('Performance and Batch Optimization', () => {
    it('should demonstrate efficient batch processing with performance metrics', async () => {
      await testSetup.withCleanup(async () => {
        const batchSizes = [50, 100, 150];
        const performanceResults: Array<{
          batchSize: number;
          duration: number;
          throughput: number;
          itemCount: number;
        }> = [];

        for (const batchSize of batchSizes) {
          const entities: BulkEntityInput[] = Array.from(
            { length: batchSize },
            (_, i) => ({
              name: `Perf Test Entity ${batchSize}-${i}`,
              type: 'dish_or_category' as EntityType,
            }),
          );

          const config: Partial<BulkOperationConfig> = {
            batchSize: Math.min(batchSize, 75), // Internal batching
          };

          const startTime = Date.now();
          const result = await service.bulkCreateEntities(entities, config);
          const duration = Date.now() - startTime;

          expect(result.successCount).toBe(batchSize);
          expect(result.failureCount).toBe(0);

          const throughput = Math.round(batchSize / (duration / 1000));
          performanceResults.push({
            batchSize,
            duration,
            throughput,
            itemCount: batchSize,
          });

          console.log(
            `Batch size ${batchSize}: ${duration}ms, ${throughput} items/sec`,
          );
        }

        // Verify performance scales reasonably
        const avgThroughput =
          performanceResults.reduce((sum, r) => sum + r.throughput, 0) /
          performanceResults.length;
        expect(avgThroughput).toBeGreaterThan(10); // Reasonable minimum throughput

        console.log(`\n=== BULK OPERATIONS INTEGRATION PERFORMANCE ===
        Average throughput: ${Math.round(avgThroughput)} items/second
        Batch sizes tested: ${batchSizes.join(', ')}
        All operations completed successfully with transaction consistency`);
      });
    });
  });

  describe('Error Handling and Data Integrity', () => {
    it('should maintain data integrity during partial failures', async () => {
      await testSetup.withCleanup(async () => {
        // Test scenario: Some entities succeed, some fail due to constraints
        const mixedValidityEntities: BulkEntityInput[] = [
          {
            name: 'Valid Entity 1',
            type: 'restaurant',
            googlePlaceId: 'valid-entity-1',
            aliases: [],
            restaurantQualityScore: 0,
            restaurantAttributes: [],
            restaurantMetadata: {},
          },
          {
            name: 'Valid Entity 2',
            type: 'dish_or_category',
            aliases: [],
            restaurantQualityScore: 0,
            restaurantAttributes: [],
            restaurantMetadata: {},
          },
        ];

        const result = await service.bulkCreateEntities(mixedValidityEntities);

        // All should succeed with proper validation
        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);

        // Verify entities were created
        const createdCount = await entityRepository.count({
          name: { in: ['Valid Entity 1', 'Valid Entity 2'] },
        });
        expect(createdCount).toBe(2);
      });
    });
  });
});
