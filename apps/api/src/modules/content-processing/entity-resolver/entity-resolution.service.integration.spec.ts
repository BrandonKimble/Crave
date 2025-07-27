import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { DatabaseValidationService } from '../../../config/database-validation.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { EntityResolutionService } from './entity-resolution.service';
import { AliasManagementService } from './alias-management.service';
import { LoggerService } from '../../../shared';
import {
  EntityResolutionInput,
  ContextualAttributeInput,
  llmEntityRefToResolutionInput,
} from './entity-resolution.types';
import { LLMEntityRef } from '../../external-integrations/llm/llm.types';

describe('EntityResolutionService Integration', () => {
  let service: EntityResolutionService;
  let prisma: PrismaService;
  let entityRepository: EntityRepository;

  const cleanupTestData = async () => {
    if (prisma) {
      await prisma.entity.deleteMany({
        where: {
          name: {
            contains: 'Test',
          },
        },
      });
    }
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityResolutionService,
        AliasManagementService,
        PrismaService,
        EntityRepository,
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            database: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              url: process.env.DATABASE_URL,
              performance: { logging: { enabled: false } },
            }),
          },
        },
        {
          provide: DatabaseValidationService,
          useValue: {
            validateConnection: jest.fn().mockResolvedValue(true),
            validateSchema: jest.fn().mockResolvedValue(true),
            validateDatabaseConfiguration: jest.fn(),
            validateEnvironmentConsistency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EntityResolutionService>(EntityResolutionService);
    prisma = module.get<PrismaService>(PrismaService);
    entityRepository = module.get<EntityRepository>(EntityRepository);

    // Clean up any existing test data
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Three-tier resolution with real database', () => {
    it('should resolve entities through all three tiers', async () => {
      // Create some test entities in the database
      const existingRestaurant = await entityRepository.createRestaurant({
        name: 'Test Franklin BBQ',
        aliases: ['Franklin BBQ Test', 'Franklin Barbecue Test'],
      });

      const existingDish = await entityRepository.createDishOrCategory({
        name: 'Test Brisket',
        aliases: ['brisket test', 'BBQ brisket test'],
      });

      // Test data: exact match, alias match, fuzzy match, and new entity
      const testEntities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Test Franklin BBQ', // Exact match
          originalText: 'Test Franklin BBQ',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-2',
          normalizedName: 'Franklin Barbecue Test', // Alias match
          originalText: 'Franklin Barbecue Test',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-3',
          normalizedName: 'Test Franklins BBQ', // Fuzzy match (missing apostrophe)
          originalText: 'Test Franklins BBQ',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-4',
          normalizedName: 'Test New Restaurant', // New entity
          originalText: 'Test New Restaurant',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-5',
          normalizedName: 'Test Brisket', // Exact match for dish
          originalText: 'Test Brisket',
          entityType: 'dish_or_category',
        },
      ];

      const result = await service.resolveBatch(testEntities, {
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.7,
      });

      // Verify results
      expect(result.resolutionResults).toHaveLength(5);
      expect(result.tempIdToEntityIdMap.size).toBe(5);

      // Check exact match
      const exactMatch = result.resolutionResults.find(
        (r) => r.tempId === 'temp-1',
      );
      expect(exactMatch?.resolutionTier).toBe('exact');
      expect(exactMatch?.confidence).toBe(1.0);
      expect(exactMatch?.entityId).toBe(existingRestaurant.entityId);

      // Check alias match
      const aliasMatch = result.resolutionResults.find(
        (r) => r.tempId === 'temp-2',
      );
      expect(aliasMatch?.resolutionTier).toBe('alias');
      expect(aliasMatch?.confidence).toBe(0.95);
      expect(aliasMatch?.entityId).toBe(existingRestaurant.entityId);

      // Check fuzzy match
      const fuzzyMatch = result.resolutionResults.find(
        (r) => r.tempId === 'temp-3',
      );
      expect(fuzzyMatch?.resolutionTier).toBe('fuzzy');
      expect(fuzzyMatch?.confidence).toBeGreaterThan(0.7);
      expect(fuzzyMatch?.entityId).toBe(existingRestaurant.entityId);

      // Check new entity creation
      const newEntity = result.resolutionResults.find(
        (r) => r.tempId === 'temp-4',
      );
      expect(newEntity?.resolutionTier).toBe('new');
      expect(newEntity?.confidence).toBe(1.0);
      expect(newEntity?.entityId).toBeTruthy();

      // Check dish exact match
      const dishMatch = result.resolutionResults.find(
        (r) => r.tempId === 'temp-5',
      );
      expect(dishMatch?.resolutionTier).toBe('exact');
      expect(dishMatch?.entityId).toBe(existingDish.entityId);

      // Verify performance metrics
      expect(result.performanceMetrics.exactMatches).toBe(2);
      expect(result.performanceMetrics.aliasMatches).toBe(1);
      expect(result.performanceMetrics.fuzzyMatches).toBe(1);
      expect(result.performanceMetrics.newEntitiesCreated).toBe(1);
      expect(result.performanceMetrics.totalProcessed).toBe(5);

      expect(result.performanceMetrics.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle contextual attributes correctly', async () => {
      // Create existing attributes in both scopes
      const italianDishAttr = await entityRepository.createDishAttribute({
        name: 'Test Italian',
        aliases: ['Italian test'],
      });

      const italianRestaurantAttr =
        await entityRepository.createRestaurantAttribute({
          name: 'Test Italian',
          aliases: ['Italian test'],
        });

      const contextualAttributes: ContextualAttributeInput[] = [
        {
          tempId: 'temp-1',
          attributeName: 'Test Italian',
          originalText: 'Test Italian',
          scope: 'dish',
        },
        {
          tempId: 'temp-2',
          attributeName: 'Test Italian',
          originalText: 'Test Italian',
          scope: 'restaurant',
        },
        {
          tempId: 'temp-3',
          attributeName: 'Test Vegan',
          originalText: 'Test Vegan',
          scope: 'dish',
        },
      ];

      const result =
        await service.resolveContextualAttributes(contextualAttributes);

      expect(result.resolutionResults).toHaveLength(3);

      // Verify scope-aware resolution
      const dishItalian = result.resolutionResults.find(
        (r) => r.tempId === 'temp-1',
      );
      expect(dishItalian?.entityId).toBe(italianDishAttr.entityId);

      const restaurantItalian = result.resolutionResults.find(
        (r) => r.tempId === 'temp-2',
      );
      expect(restaurantItalian?.entityId).toBe(italianRestaurantAttr.entityId);

      // Verify new attribute creation
      const newVegan = result.resolutionResults.find(
        (r) => r.tempId === 'temp-3',
      );
      expect(newVegan?.resolutionTier).toBe('new');
      expect(newVegan?.entityId).toBeTruthy();

      // Verify the created entity has correct type
      const createdEntity = await prisma.entity.findUnique({
        where: { entityId: newVegan!.entityId! },
      });
      expect(createdEntity?.type).toBe('dish_attribute');
    });

    it('should process LLM output format correctly', async () => {
      // Simulate LLM entity references
      const llmEntityRefs: LLMEntityRef[] = [
        {
          normalized_name: 'Test LLM Restaurant',
          original_text: 'Test LLM Restaurant',
          temp_id: 'llm-temp-1',
        },
        {
          normalized_name: 'Test LLM Dish',
          original_text: 'Test LLM Dish',
          temp_id: 'llm-temp-2',
        },
      ];

      // Convert to resolution inputs
      const resolutionInputs = llmEntityRefs.map((ref, index) =>
        llmEntityRefToResolutionInput(
          ref,
          index === 0 ? 'restaurant' : 'dish_or_category',
          [],
        ),
      );

      const result = await service.resolveBatch(resolutionInputs);

      expect(result.resolutionResults).toHaveLength(2);
      expect(result.newEntitiesCreated).toBeGreaterThan(0); // At least one new entity created

      // Verify temp ID mapping
      expect(result.tempIdToEntityIdMap.get('llm-temp-1')).toBeTruthy();
      expect(result.tempIdToEntityIdMap.get('llm-temp-2')).toBeTruthy();
    });

    it('should handle large batch processing efficiently', async () => {
      const largeTestBatch: EntityResolutionInput[] = Array.from(
        { length: 150 },
        (_, i) => ({
          tempId: `large-temp-${i}`,
          normalizedName: `Test Large Entity ${i}`,
          originalText: `Test Large Entity ${i}`,
          entityType: 'dish_or_category',
          aliases: [`Large Entity Alias ${i}`],
        }),
      );

      const startTime = Date.now();
      const result = await service.resolveBatch(largeTestBatch, {
        batchSize: 50, // Test batching
      });
      const processingTime = Date.now() - startTime;

      expect(result.resolutionResults).toHaveLength(150);
      expect(result.newEntitiesCreated).toBeGreaterThan(0); // Should create some new entities
      expect(result.tempIdToEntityIdMap.size).toBe(150); // All entities should be resolved
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds

      console.log('Large batch processing:', {
        entitiesProcessed: 150,
        processingTimeMs: processingTime,
        avgTimePerEntity: processingTime / 150,
        newEntitiesCreated: result.newEntitiesCreated,
      });
    });

    it('should maintain data consistency across batch operations', async () => {
      // Create entities that reference each other
      const testEntities: EntityResolutionInput[] = [
        {
          tempId: 'consistency-1',
          normalizedName: 'Test Consistency Restaurant',
          originalText: 'Test Consistency Restaurant',
          entityType: 'restaurant',
        },
        {
          tempId: 'consistency-2',
          normalizedName: 'Test Consistency Dish',
          originalText: 'Test Consistency Dish',
          entityType: 'dish_or_category',
        },
        {
          tempId: 'consistency-3',
          normalizedName: 'Test spicy',
          originalText: 'Test spicy',
          entityType: 'dish_attribute',
        },
      ];

      const result = await service.resolveBatch(testEntities);

      // Verify all entities were created
      expect(result.newEntitiesCreated).toBe(3);
      expect(result.tempIdToEntityIdMap.size).toBe(3);

      // Verify entities exist in database
      for (const [, entityId] of result.tempIdToEntityIdMap) {
        const entity = await prisma.entity.findUnique({
          where: { entityId },
        });
        expect(entity).toBeTruthy();
        expect(entity?.entityId).toBe(entityId);
      }
    });
  });

  describe('Performance characteristics', () => {
    it('should provide performance metrics for analysis', async () => {
      const testEntities: EntityResolutionInput[] = [
        {
          tempId: 'perf-1',
          normalizedName: 'Test Performance Entity',
          originalText: 'Test Performance Entity',
          entityType: 'restaurant',
        },
      ];

      const result = await service.resolveBatch(testEntities);

      expect(result.performanceMetrics).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          totalProcessed: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          exactMatches: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          aliasMatches: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          fuzzyMatches: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          newEntitiesCreated: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          processingTimeMs: expect.any(Number),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          averageConfidence: expect.any(Number),
        }),
      );

      expect(result.performanceMetrics.processingTimeMs).toBeGreaterThan(0);
      expect(
        result.performanceMetrics.averageConfidence,
      ).toBeGreaterThanOrEqual(0);
      expect(result.performanceMetrics.averageConfidence).toBeLessThanOrEqual(
        1,
      );
    });
  });
});
