import { Test, TestingModule } from '@nestjs/testing';
import { EntityType, Entity } from '@prisma/client';
import { EntityResolutionService } from './entity-resolution.service';
import { AliasManagementService } from './alias-management.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService } from '../../../shared';
import {
  EntityResolutionInput,
  ContextualAttributeInput,
} from './entity-resolution.types';

describe('EntityResolutionService', () => {
  let service: EntityResolutionService;

  const mockPrismaService = {
    entity: {
      findMany: jest.fn(),
    },
  };

  const mockEntityRepository = {
    createRestaurant: jest.fn(),
    createDishOrCategory: jest.fn(),
    createDishAttribute: jest.fn(),
    createRestaurantAttribute: jest.fn(),
  };

  const mockLoggerService = {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const mockAliasManagementService = {
    processAliases: jest.fn(),
    findByAlias: jest.fn(),
    addOriginalTextAsAlias: jest.fn().mockImplementation((aliases, originalText) => ({
      updatedAliases: [...(aliases || []), originalText],
      aliasAdded: true,
    })),
    validateScopeConstraints: jest.fn().mockImplementation((entityType, aliases) => ({
      validAliases: aliases,
      violations: [],
    })),
    prepareAliasesForMerge: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityResolutionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EntityRepository,
          useValue: mockEntityRepository,
        },
        {
          provide: AliasManagementService,
          useValue: mockAliasManagementService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<EntityResolutionService>(EntityResolutionService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveBatch', () => {
    it('should resolve entities using three-tier system', async () => {
      const testEntities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Franklin BBQ',
          originalText: 'Franklin BBQ',
          entityType: 'restaurant',
          aliases: ['Franklin Barbecue'],
        },
        {
          tempId: 'temp-2',
          normalizedName: 'unknown restaurant',
          originalText: 'unknown restaurant',
          entityType: 'restaurant',
          aliases: [],
        },
      ];

      // Mock exact match - finds Franklin BBQ
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([
          {
            entityId: 'existing-franklin-id',
            name: 'Franklin BBQ',
          },
        ])
        // Mock alias match - no results
        .mockResolvedValueOnce([])
        // Mock fuzzy match candidates
        .mockResolvedValueOnce([]);

      // Mock new entity creation
      mockEntityRepository.createRestaurant.mockResolvedValueOnce({
        entityId: 'new-restaurant-id',
        name: 'unknown restaurant',
        type: 'restaurant',
      } as Entity);

      const result = await service.resolveBatch(testEntities);

      expect(result.tempIdToEntityIdMap.size).toBe(2);
      expect(result.tempIdToEntityIdMap.get('temp-1')).toBe(
        'existing-franklin-id',
      );
      expect(result.tempIdToEntityIdMap.get('temp-2')).toBe(
        'new-restaurant-id',
      );
      expect(result.resolutionResults).toHaveLength(2);
      expect(result.newEntitiesCreated).toBe(1);
    });

    it('should handle empty input gracefully', async () => {
      const result = await service.resolveBatch([]);

      expect(result.tempIdToEntityIdMap.size).toBe(0);
      expect(result.resolutionResults).toHaveLength(0);
      expect(result.newEntitiesCreated).toBe(0);
    });

    it('should batch process large numbers of entities', async () => {
      const largeEntityBatch: EntityResolutionInput[] = Array.from(
        { length: 250 },
        (_, i) => ({
          tempId: `temp-${i}`,
          normalizedName: `Entity ${i}`,
          originalText: `Entity ${i}`,
          entityType: 'dish_or_category' as EntityType,
          aliases: [],
        }),
      );

      // Mock no existing matches - all will be new entities
      mockPrismaService.entity.findMany.mockResolvedValue([]);
      mockEntityRepository.createDishOrCategory.mockImplementation(
        ({ name }: { name: string }) =>
          ({
            entityId: `new-${name.toLowerCase().replace(' ', '-')}`,
            name,
            type: 'dish_or_category',
          }) as Entity,
      );

      const result = await service.resolveBatch(largeEntityBatch);

      expect(result.resolutionResults).toHaveLength(250);
      expect(result.newEntitiesCreated).toBe(250);
      expect(result.tempIdToEntityIdMap.size).toBe(250);
    });
  });

  describe('exact matching (Tier 1)', () => {
    it('should find exact matches using case-insensitive comparison', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'FRANKLIN BBQ',
          originalText: 'Franklin BBQ',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-2',
          normalizedName: 'ramen tatsu-ya',
          originalText: 'Ramen Tatsu-Ya',
          entityType: 'restaurant',
        },
      ];

      mockPrismaService.entity.findMany.mockResolvedValueOnce([
        {
          entityId: 'franklin-id',
          name: 'Franklin BBQ',
        },
        {
          entityId: 'tatsuya-id',
          name: 'Ramen Tatsu-Ya',
        },
      ]);

      const result = await service.resolveBatch(entities);

      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith({
        where: {
          type: 'restaurant',
          name: {
            in: ['franklin bbq', 'ramen tatsu-ya'],
            mode: 'insensitive',
          },
        },
        select: {
          entityId: true,
          name: true,
        },
      });

      expect(result.resolutionResults[0].confidence).toBe(1.0);
      expect(result.resolutionResults[0].resolutionTier).toBe('exact');
      expect(result.resolutionResults[1].confidence).toBe(1.0);
      expect(result.resolutionResults[1].resolutionTier).toBe('exact');
    });
  });

  describe('alias matching (Tier 2)', () => {
    it('should find matches using alias arrays', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Franklin Barbecue',
          originalText: 'Franklin Barbecue',
          entityType: 'restaurant',
          aliases: ['Franklin BBQ', "Franklin's"],
        },
      ];

      // Mock exact match - no results
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([])
        // Mock alias match - finds match
        .mockResolvedValueOnce([
          {
            entityId: 'franklin-id',
            name: 'Franklin BBQ',
            aliases: ['Franklin Barbecue', "Franklin's BBQ"],
          },
        ]);

      const result = await service.resolveBatch(entities);

      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: 'restaurant',
            aliases: {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              hasSome: expect.arrayContaining([
                'Franklin Barbecue',
                'Franklin BBQ',
                "Franklin's",
              ]),
            },
          },
        }),
      );

      expect(result.resolutionResults[0].confidence).toBe(0.95);
      expect(result.resolutionResults[0].resolutionTier).toBe('alias');
    });
  });

  describe('fuzzy matching (Tier 3)', () => {
    it('should find fuzzy matches within threshold', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Franklins BBQ', // Missing apostrophe
          originalText: 'Franklins BBQ',
          entityType: 'restaurant',
        },
      ];

      // Mock exact and alias matches - no results
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        // Mock fuzzy match candidates
        .mockResolvedValueOnce([
          {
            entityId: 'franklin-id',
            name: "Franklin's BBQ",
            aliases: ['Franklin BBQ'],
          },
          {
            entityId: 'other-id',
            name: 'Different Restaurant',
            aliases: [],
          },
        ]);

      const result = await service.resolveBatch(entities, {
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.8,
      });

      expect(result.resolutionResults[0].resolutionTier).toBe('fuzzy');
      expect(result.resolutionResults[0].confidence).toBeGreaterThan(0.8);
      expect(result.resolutionResults[0].entityId).toBe('franklin-id');
    });

    it('should not match if below threshold', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Completely Different Name',
          originalText: 'Completely Different Name',
          entityType: 'restaurant',
        },
      ];

      // Mock exact and alias matches - no results
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        // Mock fuzzy match candidates
        .mockResolvedValueOnce([
          {
            entityId: 'franklin-id',
            name: "Franklin's BBQ",
            aliases: ['Franklin BBQ'],
          },
        ]);

      mockEntityRepository.createRestaurant.mockResolvedValueOnce({
        entityId: 'new-id',
        name: 'Completely Different Name',
        type: 'restaurant',
      } as Entity);

      const result = await service.resolveBatch(entities, {
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.8,
      });

      expect(result.resolutionResults[0].resolutionTier).toBe('new');
      expect(result.newEntitiesCreated).toBe(1);
    });
  });

  describe('contextual attribute resolution', () => {
    it('should resolve dish and restaurant attributes correctly', async () => {
      const attributes: ContextualAttributeInput[] = [
        {
          tempId: 'temp-1',
          attributeName: 'Italian',
          originalText: 'Italian',
          scope: 'dish',
        },
        {
          tempId: 'temp-2',
          attributeName: 'Italian',
          originalText: 'Italian',
          scope: 'restaurant',
        },
      ];

      // Mock exact matches for both scopes
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([
          {
            entityId: 'italian-dish-attr-id',
            name: 'Italian',
          },
        ])
        .mockResolvedValueOnce([
          {
            entityId: 'italian-restaurant-attr-id',
            name: 'Italian',
          },
        ]);

      const result = await service.resolveContextualAttributes(attributes);

      expect(result.resolutionResults).toHaveLength(2);
      expect(result.tempIdToEntityIdMap.get('temp-1')).toBe(
        'italian-dish-attr-id',
      );
      expect(result.tempIdToEntityIdMap.get('temp-2')).toBe(
        'italian-restaurant-attr-id',
      );

      // Verify correct entity types were used
      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            type: 'dish_attribute',
          }),
        }),
      );
      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            type: 'restaurant_attribute',
          }),
        }),
      );
    });
  });

  describe('entity type handling', () => {
    it('should create entities using appropriate repository methods', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'New Restaurant',
          originalText: 'New Restaurant',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-2',
          normalizedName: 'New Dish',
          originalText: 'New Dish',
          entityType: 'dish_or_category',
        },
        {
          tempId: 'temp-3',
          normalizedName: 'spicy',
          originalText: 'spicy',
          entityType: 'dish_attribute',
        },
        {
          tempId: 'temp-4',
          normalizedName: 'family-friendly',
          originalText: 'family-friendly',
          entityType: 'restaurant_attribute',
        },
      ];

      // Mock no existing matches
      mockPrismaService.entity.findMany.mockResolvedValue([]);

      // Mock entity creation
      mockEntityRepository.createRestaurant.mockResolvedValueOnce({
        entityId: 'new-restaurant-id',
        name: 'New Restaurant',
        type: 'restaurant',
      } as Entity);
      mockEntityRepository.createDishOrCategory.mockResolvedValueOnce({
        entityId: 'new-dish-id',
        name: 'New Dish',
        type: 'dish_or_category',
      } as Entity);
      mockEntityRepository.createDishAttribute.mockResolvedValueOnce({
        entityId: 'new-dish-attr-id',
        name: 'spicy',
        type: 'dish_attribute',
      } as Entity);
      mockEntityRepository.createRestaurantAttribute.mockResolvedValueOnce({
        entityId: 'new-restaurant-attr-id',
        name: 'family-friendly',
        type: 'restaurant_attribute',
      } as Entity);

      const result = await service.resolveBatch(entities);

      expect(mockEntityRepository.createRestaurant).toHaveBeenCalledWith({
        name: 'New Restaurant',
        aliases: ['New Restaurant'],
      });
      expect(mockEntityRepository.createDishOrCategory).toHaveBeenCalledWith({
        name: 'New Dish',
        aliases: ['New Dish'],
      });
      expect(mockEntityRepository.createDishAttribute).toHaveBeenCalledWith({
        name: 'spicy',
        aliases: ['spicy'],
      });
      expect(
        mockEntityRepository.createRestaurantAttribute,
      ).toHaveBeenCalledWith({
        name: 'family-friendly',
        aliases: ['family-friendly'],
      });

      expect(result.newEntitiesCreated).toBe(4);
    });
  });

  describe('performance metrics', () => {
    it('should calculate accurate performance metrics', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Exact Match',
          originalText: 'Exact Match',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-2',
          normalizedName: 'Alias Match',
          originalText: 'Alias Match',
          entityType: 'restaurant',
        },
        {
          tempId: 'temp-3',
          normalizedName: 'New Entity',
          originalText: 'New Entity',
          entityType: 'restaurant',
        },
      ];

      // Mock exact match
      mockPrismaService.entity.findMany
        .mockResolvedValueOnce([
          {
            entityId: 'exact-id',
            name: 'Exact Match',
          },
        ])
        // Mock alias match
        .mockResolvedValueOnce([
          {
            entityId: 'alias-id',
            name: 'Alias Match Entity',
            aliases: ['Alias Match'],
          },
        ])
        // Mock fuzzy match candidates (none)
        .mockResolvedValueOnce([]);

      mockEntityRepository.createRestaurant.mockResolvedValueOnce({
        entityId: 'new-id',
        name: 'New Entity',
        type: 'restaurant',
      } as Entity);

      const result = await service.resolveBatch(entities);

      expect(result.performanceMetrics.totalProcessed).toBe(3);
      expect(result.performanceMetrics.exactMatches).toBe(1);
      expect(result.performanceMetrics.aliasMatches).toBe(1);
      expect(result.performanceMetrics.newEntitiesCreated).toBe(1);
      expect(result.performanceMetrics.averageConfidence).toBeGreaterThan(0);
      expect(result.performanceMetrics.processingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Test Entity',
          originalText: 'Test Entity',
          entityType: 'restaurant',
        },
      ];

      mockPrismaService.entity.findMany.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      await expect(service.resolveBatch(entities)).rejects.toThrow(
        'Database connection failed',
      );

      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle entity creation failures', async () => {
      const entities: EntityResolutionInput[] = [
        {
          tempId: 'temp-1',
          normalizedName: 'Test Entity',
          originalText: 'Test Entity',
          entityType: 'restaurant',
        },
      ];

      // Mock no existing matches
      mockPrismaService.entity.findMany.mockResolvedValue([]);
      // Mock entity creation failure
      mockEntityRepository.createRestaurant.mockRejectedValueOnce(
        new Error('Validation failed'),
      );

      const result = await service.resolveBatch(entities);

      expect(result.resolutionResults[0].entityId).toBeNull();
      expect(result.resolutionResults[0].confidence).toBe(0.0);
    });
  });
});
