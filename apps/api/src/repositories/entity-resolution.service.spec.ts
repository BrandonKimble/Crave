import { Test, TestingModule } from '@nestjs/testing';
import { EntityResolutionService } from './entity-resolution.service';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { LoggerService } from '../shared';
import { ValidationException } from './base/repository.exceptions';

describe('EntityResolutionService', () => {
  let service: EntityResolutionService;
  let entityRepository: EntityRepository; // eslint-disable-line @typescript-eslint/no-unused-vars
  let connectionRepository: ConnectionRepository; // eslint-disable-line @typescript-eslint/no-unused-vars

  const mockEntityRepository = {
    findById: jest.fn(),
    findByType: jest.fn(),
    findMany: jest.fn(),
    createDishAttribute: jest.fn(),
    createRestaurantAttribute: jest.fn(),
  };

  const mockConnectionRepository = {
    findMany: jest.fn(),
    count: jest.fn(),
  };

  const mockLoggerService = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityResolutionService,
        {
          provide: EntityRepository,
          useValue: mockEntityRepository,
        },
        {
          provide: ConnectionRepository,
          useValue: mockConnectionRepository,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<EntityResolutionService>(EntityResolutionService);
    entityRepository = module.get<EntityRepository>(EntityRepository);
    connectionRepository =
      module.get<ConnectionRepository>(ConnectionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEntityInMenuContext', () => {
    const mockEntity = {
      entityId: 'dish-123',
      type: 'dish_or_category',
      name: 'Ramen',
    };

    const mockConnection = {
      connectionId: 'conn-123',
      restaurantId: 'restaurant-123',
      dishOrCategoryId: 'dish-123',
      isMenuItem: true,
    };

    it('should retrieve entity in menu context successfully', async () => {
      mockConnectionRepository.findMany.mockResolvedValue([mockConnection]);
      mockEntityRepository.findById.mockResolvedValue(mockEntity);

      const result = await service.getEntityInMenuContext(
        'dish-123',
        'restaurant-123',
      );

      expect(result).toEqual({
        entity: mockEntity,
        connection: mockConnection,
        isMenuItem: true,
      });
      expect(mockConnectionRepository.findMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 'restaurant-123',
          dishOrCategoryId: 'dish-123',
          isMenuItem: true,
        },
        include: {
          dish: true,
          restaurant: true,
        },
      });
    });

    it('should return null when no menu connection exists', async () => {
      mockConnectionRepository.findMany.mockResolvedValue([]);

      const result = await service.getEntityInMenuContext(
        'dish-123',
        'restaurant-123',
      );

      expect(result).toBeNull();
    });

    it('should throw ValidationException for invalid entity type', async () => {
      const invalidEntity = { ...mockEntity, type: 'restaurant' };
      mockConnectionRepository.findMany.mockResolvedValue([mockConnection]);
      mockEntityRepository.findById.mockResolvedValue(invalidEntity);

      await expect(
        service.getEntityInMenuContext('dish-123', 'restaurant-123'),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('getEntityInCategoryContext', () => {
    const mockEntity = {
      entityId: 'category-123',
      type: 'dish_or_category',
      name: 'Asian Food',
    };

    it('should retrieve entity in category context successfully', async () => {
      mockEntityRepository.findById.mockResolvedValue(mockEntity);
      mockConnectionRepository.count.mockResolvedValue(5);

      const result = await service.getEntityInCategoryContext('category-123');

      expect(result).toEqual({
        entity: mockEntity,
        connectionCount: 5,
        usageType: 'category',
      });
      expect(mockConnectionRepository.count).toHaveBeenCalledWith({
        categories: {
          has: 'category-123',
        },
      });
    });

    it('should return null for non-existent entity', async () => {
      mockEntityRepository.findById.mockResolvedValue(null);

      const result = await service.getEntityInCategoryContext('invalid-id');

      expect(result).toBeNull();
    });

    it('should return null for wrong entity type', async () => {
      const wrongTypeEntity = { ...mockEntity, type: 'restaurant' };
      mockEntityRepository.findById.mockResolvedValue(wrongTypeEntity);

      const result = await service.getEntityInCategoryContext('category-123');

      expect(result).toBeNull();
    });
  });

  describe('resolveContextualAttributes', () => {
    const mockDishAttribute = {
      entityId: 'attr-dish-123',
      type: 'dish_attribute',
      name: 'Italian',
    };

    const mockRestaurantAttribute = {
      entityId: 'attr-restaurant-123',
      type: 'restaurant_attribute',
      name: 'Italian',
    };

    it('should resolve dish attributes by name and scope', async () => {
      mockEntityRepository.findMany.mockResolvedValue([mockDishAttribute]);

      const result = await service.resolveContextualAttributes(
        'Italian',
        'dish',
      );

      expect(result).toEqual([mockDishAttribute]);
      expect(mockEntityRepository.findMany).toHaveBeenCalledWith({
        where: {
          name: {
            equals: 'Italian',
            mode: 'insensitive',
          },
          type: 'dish_attribute',
        },
      });
    });

    it('should resolve restaurant attributes by name and scope', async () => {
      mockEntityRepository.findMany.mockResolvedValue([
        mockRestaurantAttribute,
      ]);

      const result = await service.resolveContextualAttributes(
        'Italian',
        'restaurant',
      );

      expect(result).toEqual([mockRestaurantAttribute]);
      expect(mockEntityRepository.findMany).toHaveBeenCalledWith({
        where: {
          name: {
            equals: 'Italian',
            mode: 'insensitive',
          },
          type: 'restaurant_attribute',
        },
      });
    });
  });

  describe('createOrResolveContextualAttribute', () => {
    const mockDishAttribute = {
      entityId: 'attr-dish-123',
      type: 'dish_attribute',
      name: 'Spicy',
    };

    it('should return existing attribute if found', async () => {
      mockEntityRepository.findMany.mockResolvedValue([mockDishAttribute]);

      const result = await service.createOrResolveContextualAttribute(
        'Spicy',
        'dish',
      );

      expect(result).toEqual(mockDishAttribute);
      expect(mockEntityRepository.createDishAttribute).not.toHaveBeenCalled();
    });

    it('should create new dish attribute if not found', async () => {
      mockEntityRepository.findMany.mockResolvedValue([]);
      mockEntityRepository.createDishAttribute.mockResolvedValue(
        mockDishAttribute,
      );

      const result = await service.createOrResolveContextualAttribute(
        'Spicy',
        'dish',
        ['Hot', 'Fiery'],
      );

      expect(result).toEqual(mockDishAttribute);
      expect(mockEntityRepository.createDishAttribute).toHaveBeenCalledWith({
        name: 'Spicy',
        aliases: ['Hot', 'Fiery'],
      });
    });

    it('should create new restaurant attribute if not found', async () => {
      const mockRestaurantAttribute = {
        entityId: 'attr-restaurant-123',
        type: 'restaurant_attribute',
        name: 'Casual',
      };

      mockEntityRepository.findMany.mockResolvedValue([]);
      mockEntityRepository.createRestaurantAttribute.mockResolvedValue(
        mockRestaurantAttribute,
      );

      const result = await service.createOrResolveContextualAttribute(
        'Casual',
        'restaurant',
        ['Relaxed'],
      );

      expect(result).toEqual(mockRestaurantAttribute);
      expect(
        mockEntityRepository.createRestaurantAttribute,
      ).toHaveBeenCalledWith({
        name: 'Casual',
        aliases: ['Relaxed'],
      });
    });
  });

  describe('findDualPurposeEntities', () => {
    const mockDishEntities = [
      {
        entityId: 'dish-1',
        type: 'dish_or_category',
        name: 'Ramen',
      },
      {
        entityId: 'dish-2',
        type: 'dish_or_category',
        name: 'Pizza',
      },
    ];

    it('should find entities used in both menu and category contexts', async () => {
      mockEntityRepository.findByType.mockResolvedValue(mockDishEntities);

      // Mock menu item usage counts
      mockConnectionRepository.count
        .mockResolvedValueOnce(3) // dish-1 menu usage
        .mockResolvedValueOnce(2) // dish-1 category usage
        .mockResolvedValueOnce(1) // dish-2 menu usage
        .mockResolvedValueOnce(0); // dish-2 category usage (no dual purpose)

      const result = await service.findDualPurposeEntities();

      expect(result).toEqual([
        {
          entity: mockDishEntities[0],
          menuItemUsage: 3,
          categoryUsage: 2,
        },
      ]);
    });

    it('should return empty array when no dual-purpose entities exist', async () => {
      mockEntityRepository.findByType.mockResolvedValue(mockDishEntities);
      mockConnectionRepository.count.mockResolvedValue(0);

      const result = await service.findDualPurposeEntities();

      expect(result).toEqual([]);
    });
  });
});
