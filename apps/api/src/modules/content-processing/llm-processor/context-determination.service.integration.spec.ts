import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { DatabaseValidationService } from '../../../config/database-validation.service';
import { ContextDeterminationService } from './context-determination.service';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { AliasManagementService } from '../entity-resolver/alias-management.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService } from '../../../shared';
import { LLMOutputStructure } from '../../external-integrations/llm/llm.types';

describe('ContextDeterminationService Integration', () => {
  let service: ContextDeterminationService;
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
        ContextDeterminationService,
        EntityResolutionService,
        AliasManagementService,
        EntityRepository,
        PrismaService,
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
            get: jest.fn((key: string) => {
              switch (key) {
                case 'DATABASE_URL':
                  return process.env.DATABASE_URL;
                case 'NODE_ENV':
                  return 'test';
                default:
                  return null;
              }
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

    service = module.get<ContextDeterminationService>(
      ContextDeterminationService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    entityRepository = module.get<EntityRepository>(EntityRepository);

    // Clear test database
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('processLLMOutputForAttributes', () => {
    it('should resolve context-dependent attributes correctly', async () => {
      // Create existing Italian dish attribute
      const existingItalianDish = await entityRepository.createDishAttribute({
        name: 'Test Italian',
        aliases: ['italian'],
      });

      const mockLLMOutput: LLMOutputStructure = {
        mentions: [
          {
            temp_id: 'mention_1',
            restaurant: {
              normalized_name: 'Test Restaurant',
              original_text: 'test restaurant',
              temp_id: 'rest_1',
            },
            restaurant_attributes: ['Test Italian', 'romantic'],
            dish_or_category: {
              normalized_name: 'Test Pasta',
              original_text: 'test pasta',
              temp_id: 'dish_1',
            },
            dish_attributes: [
              { attribute: 'Test Italian', type: 'descriptive' },
              { attribute: 'spicy', type: 'descriptive' },
            ],
            is_menu_item: true,
            general_praise: false,
            source: {
              type: 'post',
              id: 'test_post_1',
              url: 'https://reddit.com/test',
              upvotes: 10,
              created_at: '2024-01-01T00:00:00Z',
            },
          },
        ],
      };

      const result = await service.processLLMOutputForAttributes(mockLLMOutput);

      expect(result.resolutionResults).toHaveLength(4);
      expect(result.newEntitiesCreated).toBeGreaterThan(0); // Some new entities should be created

      // Verify Italian dish attribute was resolved to existing entity
      const italianDishResult = result.resolutionResults.find(
        (r) => r.tempId === 'mention_1_dish_attr_Test Italian',
      );
      expect(italianDishResult).toBeDefined();
      expect(italianDishResult!.entityId).toBe(existingItalianDish.entityId);
      expect(italianDishResult!.resolutionTier).toBe('exact');

      // Verify new restaurant attribute was created (separate from dish attribute)
      const italianRestaurantResult = result.resolutionResults.find(
        (r) => r.tempId === 'mention_1_restaurant_attr_Test Italian',
      );
      expect(italianRestaurantResult).toBeDefined();
      expect(italianRestaurantResult!.entityId).not.toBe(
        existingItalianDish.entityId,
      );
      expect(italianRestaurantResult!.resolutionTier).toBe('new');

      // Verify scope separation is working correctly
      const dishAttributes = result.resolutionResults.filter((r) =>
        r.tempId.includes('_dish_attr_'),
      );
      const restaurantAttributes = result.resolutionResults.filter((r) =>
        r.tempId.includes('_restaurant_attr_'),
      );

      expect(dishAttributes).toHaveLength(2); // Test Italian, spicy
      expect(restaurantAttributes).toHaveLength(2); // Test Italian, romantic
    });

    it('should handle empty LLM output gracefully', async () => {
      const mockLLMOutput: LLMOutputStructure = {
        mentions: [],
      };

      const result = await service.processLLMOutputForAttributes(mockLLMOutput);

      expect(result.resolutionResults).toHaveLength(0);
      expect(result.newEntitiesCreated).toBe(0);
      expect(result.tempIdToEntityIdMap.size).toBe(0);
    });

    it('should handle mentions with null attributes', async () => {
      const mockLLMOutput: LLMOutputStructure = {
        mentions: [
          {
            temp_id: 'mention_1',
            restaurant: {
              normalized_name: 'Test Restaurant',
              original_text: 'test restaurant',
              temp_id: 'rest_1',
            },
            restaurant_attributes: null,
            dish_or_category: null,
            dish_attributes: null,
            is_menu_item: true,
            general_praise: false,
            source: {
              type: 'post',
              id: 'test_post_1',
              url: 'https://reddit.com/test',
              upvotes: 10,
              created_at: '2024-01-01T00:00:00Z',
            },
          },
        ],
      };

      const result = await service.processLLMOutputForAttributes(mockLLMOutput);

      expect(result.resolutionResults).toHaveLength(0);
      expect(result.newEntitiesCreated).toBe(0);
    });
  });
});
