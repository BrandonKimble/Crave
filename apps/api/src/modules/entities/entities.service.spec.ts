import { Test, TestingModule } from '@nestjs/testing';
import { EntitiesService } from './entities.service';
import { EntityRepository } from '../../repositories/entity.repository';
import { EntityResolutionService } from '../../repositories/entity-resolution.service';
import { LoggerService } from '../../shared';
import { Entity, EntityType, Prisma } from '@prisma/client';

describe('EntitiesService', () => {
  let service: EntitiesService;
  let entityRepository: jest.Mocked<EntityRepository>;

  const mockEntity: Entity = {
    entityId: 'test-id',
    name: 'Test Entity',
    type: 'restaurant' as EntityType,
    aliases: [],
    restaurantAttributes: [],
    restaurantQualityScore: new Prisma.Decimal(85),
    latitude: new Prisma.Decimal(40.7128),
    longitude: new Prisma.Decimal(-74.006),
    address: '123 Test St',
    googlePlaceId: 'test-place-id',
    restaurantMetadata: {},
    lastUpdated: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockEntityRepository = {
      createRestaurant: jest.fn().mockName('createRestaurant'),
      createDishOrCategory: jest.fn().mockName('createDishOrCategory'),
      createDishAttribute: jest.fn().mockName('createDishAttribute'),
      createRestaurantAttribute: jest
        .fn()
        .mockName('createRestaurantAttribute'),
      findById: jest.fn().mockName('findById'),
      findMany: jest.fn().mockName('findMany'),
      findByType: jest.fn().mockName('findByType'),
      findRestaurantsByLocation: jest
        .fn()
        .mockName('findRestaurantsByLocation'),
      updateWithValidation: jest.fn().mockName('updateWithValidation'),
      delete: jest.fn().mockName('delete'),
    };

    const mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    };

    const mockEntityResolutionService = {
      resolveEntity: jest.fn(),
      resolveEntityWithValidation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitiesService,
        { provide: EntityRepository, useValue: mockEntityRepository },
        {
          provide: EntityResolutionService,
          useValue: mockEntityResolutionService,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<EntitiesService>(EntitiesService);
    entityRepository = module.get(EntityRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a restaurant entity', async () => {
      const createData = {
        entityType: 'restaurant' as const,
        name: 'Test Restaurant',
        location: {
          coordinates: { lat: 40.7128, lng: -74.006 },
          address: '123 Test St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        },
      };

      entityRepository.createRestaurant.mockResolvedValue(mockEntity);

      const result = await service.create(createData);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.createRestaurant).toHaveBeenCalledWith({
        name: createData.name,
        latitude: createData.location.coordinates.lat,
        longitude: createData.location.coordinates.lng,
        address: createData.location.address,
        restaurantMetadata: {
          city: createData.location.city,
          state: createData.location.state,
          zipCode: createData.location.zipCode,
        },
      });
      expect(result).toEqual(mockEntity);
    });

    it('should create a dish_or_category entity', async () => {
      const createData = {
        entityType: 'dish_or_category' as const,
        name: 'Pizza',
      };

      entityRepository.createDishOrCategory.mockResolvedValue(mockEntity);

      const result = await service.create(createData);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.createDishOrCategory).toHaveBeenCalledWith({
        name: createData.name,
      });
      expect(result).toEqual(mockEntity);
    });

    it('should throw error for restaurant without location', async () => {
      const createData = {
        entityType: 'restaurant' as const,
        name: 'Test Restaurant',
      };

      await expect(service.create(createData)).rejects.toThrow(
        'Location data is required for restaurant entities',
      );
    });
  });

  describe('findById', () => {
    it('should find entity by ID', async () => {
      const entityId = 'test-id';
      entityRepository.findById.mockResolvedValue(mockEntity);

      const result = await service.findById(entityId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.findById).toHaveBeenCalledWith(entityId);
      expect(result).toEqual(mockEntity);
    });

    it('should return null when entity not found', async () => {
      const entityId = 'non-existent-id';
      entityRepository.findById.mockResolvedValue(null);

      const result = await service.findById(entityId);

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should find multiple entities', async () => {
      const params = { take: 10, skip: 0 };
      const entities = [mockEntity];
      entityRepository.findMany.mockResolvedValue(entities);

      const result = await service.findMany(params);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.findMany).toHaveBeenCalledWith(params);
      expect(result).toEqual(entities);
    });
  });

  describe('update', () => {
    it('should update entity', async () => {
      const entityId = 'test-id';
      const updateData = { name: 'Updated Name' };
      entityRepository.updateWithValidation.mockResolvedValue(mockEntity);

      const result = await service.update(entityId, updateData);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.updateWithValidation).toHaveBeenCalledWith(
        entityId,
        updateData,
      );
      expect(result).toEqual(mockEntity);
    });
  });

  describe('delete', () => {
    it('should delete entity', async () => {
      const entityId = 'test-id';
      entityRepository.delete.mockResolvedValue(mockEntity);

      const result = await service.delete(entityId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.delete).toHaveBeenCalledWith(entityId);
      expect(result).toEqual(mockEntity);
    });
  });

  describe('findRestaurants', () => {
    it('should find restaurants', async () => {
      const filter = { take: 10 };
      const restaurants = [mockEntity];
      entityRepository.findByType.mockResolvedValue(restaurants);

      const result = await service.findRestaurants(filter);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.findByType).toHaveBeenCalledWith(
        'restaurant',
        filter,
      );
      expect(result).toEqual(restaurants);
    });
  });

  describe('findNearbyRestaurants', () => {
    it('should find nearby restaurants', async () => {
      const location = {
        centerPoint: { lat: 40.7128, lng: -74.006 },
        radiusKm: 5,
      };
      const restaurants = [mockEntity];
      entityRepository.findRestaurantsByLocation.mockResolvedValue(restaurants);

      const result = await service.findNearbyRestaurants(location);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.findRestaurantsByLocation).toHaveBeenCalledWith(
        location.centerPoint.lat,
        location.centerPoint.lng,
        location.radiusKm,
        { where: undefined },
      );
      expect(result).toEqual(restaurants);
    });
  });

  describe('validateEntityExists', () => {
    it('should return true for existing entity', async () => {
      const entityId = 'test-id';
      entityRepository.findById.mockResolvedValue(mockEntity);

      const result = await service.validateEntityExists(entityId, 'restaurant');

      expect(result).toBe(true);
    });

    it('should return false for non-existent entity', async () => {
      const entityId = 'non-existent-id';
      entityRepository.findById.mockResolvedValue(null);

      const result = await service.validateEntityExists(entityId);

      expect(result).toBe(false);
    });

    it('should return false for wrong entity type', async () => {
      const entityId = 'test-id';
      entityRepository.findById.mockResolvedValue(mockEntity);

      const result = await service.validateEntityExists(
        entityId,
        'dish_or_category',
      );

      expect(result).toBe(false);
    });
  });
});
