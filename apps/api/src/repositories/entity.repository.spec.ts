/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { EntityRepository } from './entity.repository';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { EntityType, Entity, Prisma } from '@prisma/client';
import { ValidationException } from './base/repository.exceptions';

describe('EntityRepository', () => {
  let repository: EntityRepository;
  let prismaService: PrismaService;
  let loggerService: LoggerService;

  const mockEntity: Entity = {
    entityId: 'test-uuid',
    name: 'Test Entity',
    type: 'restaurant' as EntityType,
    aliases: [],
    restaurantAttributes: [],
    restaurantQualityScore: new Prisma.Decimal(0),
    latitude: null,
    longitude: null,
    address: null,
    googlePlaceId: null,
    restaurantMetadata: {},
    lastUpdated: new Date(),
    createdAt: new Date(),
  };

  const mockPrismaDelegate = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityRepository,
        {
          provide: PrismaService,
          useValue: {
            entity: mockPrismaDelegate,
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            log: jest.fn(),
            database: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<EntityRepository>(EntityRepository);
    prismaService = module.get<PrismaService>(PrismaService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRestaurant', () => {
    it('should create a restaurant entity successfully', async () => {
      // Arrange
      const restaurantData = {
        name: 'Test Restaurant',
        aliases: ['Test Alias'],
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Test St, New York, NY',
        googlePlaceId: 'test-place-id',
        restaurantAttributes: ['test-attr-id'],
        restaurantMetadata: { phone: '555-1234' },
      };

      const expectedEntity = {
        ...mockEntity,
        ...restaurantData,
        type: 'restaurant' as EntityType,
      };
      mockPrismaDelegate.create.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.createRestaurant(restaurantData);

      // Assert
      expect(mockPrismaDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: restaurantData.name,
          type: 'restaurant',
          aliases: restaurantData.aliases,
          latitude: restaurantData.latitude,
          longitude: restaurantData.longitude,
          address: restaurantData.address,
          googlePlaceId: restaurantData.googlePlaceId,
          restaurantAttributes: restaurantData.restaurantAttributes,
          restaurantMetadata: restaurantData.restaurantMetadata,
          restaurantQualityScore: 0,
        }),
      });
      expect(result).toEqual(expectedEntity);
    });

    it('should throw ValidationException for empty name', async () => {
      // Arrange
      const invalidData = { name: '' };

      // Act & Assert
      await expect(repository.createRestaurant(invalidData)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should create restaurant with minimal data', async () => {
      // Arrange
      const minimalData = { name: 'Minimal Restaurant' };
      const expectedEntity = { ...mockEntity, name: minimalData.name };
      mockPrismaDelegate.create.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.createRestaurant(minimalData);

      // Assert
      expect(mockPrismaDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: minimalData.name,
          type: 'restaurant',
          aliases: [],
          restaurantAttributes: [],
          restaurantMetadata: {},
          restaurantQualityScore: 0,
        }),
      });
      expect(result).toEqual(expectedEntity);
    });
  });

  describe('createDishOrCategory', () => {
    it('should create a dish/category entity successfully', async () => {
      // Arrange
      const dishData = {
        name: 'Pizza',
        aliases: ['Pie', 'Za'],
      };

      const expectedEntity = {
        ...mockEntity,
        ...dishData,
        type: 'dish_or_category' as EntityType,
      };
      mockPrismaDelegate.create.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.createDishOrCategory(dishData);

      // Assert
      expect(mockPrismaDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dishData.name,
          type: 'dish_or_category',
          aliases: dishData.aliases,
        }),
      });
      expect(result).toEqual(expectedEntity);
    });

    it('should throw ValidationException for empty name', async () => {
      // Arrange
      const invalidData = { name: '' };

      // Act & Assert
      await expect(
        repository.createDishOrCategory(invalidData),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('createDishAttribute', () => {
    it('should create a dish attribute entity successfully', async () => {
      // Arrange
      const attributeData = {
        name: 'Spicy',
        aliases: ['Hot', 'Picante'],
      };

      const expectedEntity = {
        ...mockEntity,
        ...attributeData,
        type: 'dish_attribute' as EntityType,
      };
      mockPrismaDelegate.create.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.createDishAttribute(attributeData);

      // Assert
      expect(mockPrismaDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: attributeData.name,
          type: 'dish_attribute',
          aliases: attributeData.aliases,
        }),
      });
      expect(result).toEqual(expectedEntity);
    });

    it('should throw ValidationException for empty name', async () => {
      // Arrange
      const invalidData = { name: '' };

      // Act & Assert
      await expect(repository.createDishAttribute(invalidData)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('createRestaurantAttribute', () => {
    it('should create a restaurant attribute entity successfully', async () => {
      // Arrange
      const attributeData = {
        name: 'Family-friendly',
        aliases: ['Kid-friendly', 'Family'],
      };

      const expectedEntity = {
        ...mockEntity,
        ...attributeData,
        type: 'restaurant_attribute' as EntityType,
      };
      mockPrismaDelegate.create.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.createRestaurantAttribute(attributeData);

      // Assert
      expect(mockPrismaDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: attributeData.name,
          type: 'restaurant_attribute',
          aliases: attributeData.aliases,
        }),
      });
      expect(result).toEqual(expectedEntity);
    });

    it('should throw ValidationException for empty name', async () => {
      // Arrange
      const invalidData = { name: '' };

      // Act & Assert
      await expect(
        repository.createRestaurantAttribute(invalidData),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('findByType', () => {
    it('should find entities by type successfully', async () => {
      // Arrange
      const entityType: EntityType = 'restaurant';
      const expectedEntities = [mockEntity];
      mockPrismaDelegate.findMany.mockResolvedValue(expectedEntities);

      // Act
      const result = await repository.findByType(entityType);

      // Assert
      expect(mockPrismaDelegate.findMany).toHaveBeenCalledWith({
        where: { type: entityType },
        orderBy: undefined,
        skip: undefined,
        take: undefined,
        include: undefined,
      });
      expect(result).toEqual(expectedEntities);
    });

    it('should find entities by type with additional filters', async () => {
      // Arrange
      const entityType: EntityType = 'dish_or_category';
      const params = {
        where: { name: { contains: 'pizza' } },
        orderBy: { name: 'asc' as const },
        skip: 0,
        take: 10,
      };
      const expectedEntities = [mockEntity];
      mockPrismaDelegate.findMany.mockResolvedValue(expectedEntities);

      // Act
      const result = await repository.findByType(entityType, params);

      // Assert
      expect(mockPrismaDelegate.findMany).toHaveBeenCalledWith({
        where: { type: entityType, ...params.where },
        orderBy: params.orderBy,
        skip: params.skip,
        take: params.take,
        include: undefined,
      });
      expect(result).toEqual(expectedEntities);
    });
  });

  describe('findRestaurantsByLocation', () => {
    it('should find restaurants by location successfully', async () => {
      // Arrange
      const latitude = 40.7128;
      const longitude = -74.006;
      const radiusKm = 5;
      const expectedEntities = [mockEntity];
      mockPrismaDelegate.findMany.mockResolvedValue(expectedEntities);

      // Act
      const result = await repository.findRestaurantsByLocation(
        latitude,
        longitude,
        radiusKm,
      );

      // Assert
      expect(mockPrismaDelegate.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          type: 'restaurant',
          latitude: expect.objectContaining({
            gte: expect.any(Number),
            lte: expect.any(Number),
          }),
          longitude: expect.objectContaining({
            gte: expect.any(Number),
            lte: expect.any(Number),
          }),
        }),
        orderBy: { restaurantQualityScore: 'desc' },
        skip: undefined,
        take: undefined,
      });
      expect(result).toEqual(expectedEntities);
    });
  });

  describe('findByNameOrAlias', () => {
    it('should find entities by name or alias', async () => {
      // Arrange
      const searchTerm = 'pizza';
      const entityType: EntityType = 'dish_or_category';
      const expectedEntities = [mockEntity];
      mockPrismaDelegate.findMany.mockResolvedValue(expectedEntities);

      // Act
      const result = await repository.findByNameOrAlias(searchTerm, entityType);

      // Assert
      expect(mockPrismaDelegate.findMany).toHaveBeenCalledWith({
        where: {
          type: entityType,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { aliases: { has: searchTerm } },
          ],
        },
        orderBy: [{ name: 'asc' }, { restaurantQualityScore: 'desc' }],
        skip: undefined,
        take: undefined,
      });
      expect(result).toEqual(expectedEntities);
    });
  });

  describe('updateWithValidation', () => {
    it('should update entity with validation successfully', async () => {
      // Arrange
      const entityId = 'test-uuid';
      const updateData = { name: 'Updated Name' };
      const expectedType: EntityType = 'restaurant';
      const expectedEntity = { ...mockEntity, name: updateData.name };

      // Mock the update method from BaseRepository
      const updateSpy = jest
        .spyOn(repository, 'update')
        .mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.updateWithValidation(
        entityId,
        updateData,
        expectedType,
      );

      // Assert
      expect(updateSpy).toHaveBeenCalledWith(entityId, {
        ...updateData,
        lastUpdated: expect.any(Date),
      });
      expect(result).toEqual(expectedEntity);
    });

    it('should throw ValidationException for invalid data type', async () => {
      // Arrange
      const entityId = 'test-uuid';
      const invalidData = { name: '' }; // Empty name is invalid
      const expectedType: EntityType = 'restaurant';

      // Act & Assert
      await expect(
        repository.updateWithValidation(entityId, invalidData, expectedType),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('updateRestaurantQualityScore', () => {
    it('should update restaurant quality score successfully', async () => {
      // Arrange
      const entityId = 'test-uuid';
      const qualityScore = 8.5;
      const expectedEntity = {
        ...mockEntity,
        restaurantQualityScore: new Prisma.Decimal(qualityScore),
      };
      mockPrismaDelegate.update.mockResolvedValue(expectedEntity);

      // Act
      const result = await repository.updateRestaurantQualityScore(
        entityId,
        qualityScore,
      );

      // Assert
      expect(mockPrismaDelegate.update).toHaveBeenCalledWith({
        where: { entityId },
        data: {
          restaurantQualityScore: qualityScore,
          lastUpdated: expect.any(Date),
        },
      });
      expect(result).toEqual(expectedEntity);
    });
  });

  describe('error handling', () => {
    it('should handle Prisma errors appropriately', async () => {
      // Arrange
      const prismaError = new Error('Database connection failed');
      mockPrismaDelegate.create.mockRejectedValue(prismaError);

      // Act & Assert - Repository will handle the error internally
      await expect(
        repository.createRestaurant({ name: 'Test' }),
      ).rejects.toThrow();
    });
  });
});
