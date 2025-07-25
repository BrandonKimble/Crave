import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { ConnectionRepository } from './connection.repository';
import { EntityRepository } from './entity.repository';
import { ValidationException } from './base/repository.exceptions';

describe('ConnectionRepository', () => {
  let repository: ConnectionRepository;
  let entityRepository: EntityRepository;
  let module: TestingModule;

  const mockPrismaService = {
    connection: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockEntityRepository = {
    findById: jest.fn(),
  };

  const mockLoggerService = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    error: jest.fn(),
    database: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ConnectionRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EntityRepository,
          useValue: mockEntityRepository,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    repository = module.get<ConnectionRepository>(ConnectionRepository);
    entityRepository = module.get<EntityRepository>(EntityRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createWithValidation', () => {
    const mockConnectionData = {
      restaurantId: 'restaurant-123',
      dishOrCategoryId: 'dish-456',
      categories: ['category-789'],
      dishAttributes: ['attr-101'],
      isMenuItem: true,
    };

    const mockRestaurant = {
      entityId: 'restaurant-123',
      type: 'restaurant',
      name: 'Test Restaurant',
    };

    const mockDish = {
      entityId: 'dish-456',
      type: 'dish_or_category',
      name: 'Test Dish',
    };

    const mockCategory = {
      entityId: 'category-789',
      type: 'dish_or_category',
      name: 'Test Category',
    };

    const mockAttribute = {
      entityId: 'attr-101',
      type: 'dish_attribute',
      name: 'Test Attribute',
    };

    const mockCreatedConnection = {
      connectionId: 'conn-123',
      restaurantId: 'restaurant-123',
      dishOrCategoryId: 'dish-456',
      categories: ['category-789'],
      dishAttributes: ['attr-101'],
      isMenuItem: true,
    };

    it('should create connection successfully with valid entities', async () => {
      // Setup mocks
      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant) // restaurant validation
        .mockResolvedValueOnce(mockDish) // dish validation
        .mockResolvedValueOnce(mockCategory) // category validation
        .mockResolvedValueOnce(mockAttribute); // attribute validation

      mockPrismaService.connection.create.mockResolvedValue(
        mockCreatedConnection,
      );

      // Execute
      const result = await repository.createWithValidation(mockConnectionData);

      // Verify
      expect(result).toEqual(mockCreatedConnection);
      expect(mockEntityRepository.findById).toHaveBeenCalledTimes(4);
      expect(mockEntityRepository.findById).toHaveBeenCalledWith(
        'restaurant-123',
      );
      expect(mockEntityRepository.findById).toHaveBeenCalledWith('dish-456');
      expect(mockEntityRepository.findById).toHaveBeenCalledWith(
        'category-789',
      );
      expect(mockEntityRepository.findById).toHaveBeenCalledWith('attr-101');
      expect(mockPrismaService.connection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          restaurant: {
            connect: { entityId: 'restaurant-123' },
          },
          dish: {
            connect: { entityId: 'dish-456' },
          },
          categories: ['category-789'],
          dishAttributes: ['attr-101'],
          isMenuItem: true,
        }),
      });
    });

    it('should throw ValidationException when restaurant does not exist', async () => {
      mockEntityRepository.findById.mockResolvedValueOnce(null);

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith(
        'restaurant-123',
      );
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when restaurant has wrong type', async () => {
      const wrongTypeRestaurant = {
        ...mockRestaurant,
        type: 'dish_or_category',
      };
      mockEntityRepository.findById.mockResolvedValueOnce(wrongTypeRestaurant);

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith(
        'restaurant-123',
      );
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when dish does not exist', async () => {
      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant) // restaurant validation passes
        .mockResolvedValueOnce(null); // dish validation fails

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith('dish-456');
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when dish has wrong type', async () => {
      const wrongTypeDish = { ...mockDish, type: 'restaurant' };
      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant) // restaurant validation passes
        .mockResolvedValueOnce(wrongTypeDish); // dish validation fails

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith('dish-456');
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when category does not exist', async () => {
      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant) // restaurant validation passes
        .mockResolvedValueOnce(mockDish) // dish validation passes
        .mockResolvedValueOnce(null); // category validation fails

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith(
        'category-789',
      );
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when attribute does not exist', async () => {
      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant) // restaurant validation passes
        .mockResolvedValueOnce(mockDish) // dish validation passes
        .mockResolvedValueOnce(mockCategory) // category validation passes
        .mockResolvedValueOnce(null); // attribute validation fails

      await expect(
        repository.createWithValidation(mockConnectionData),
      ).rejects.toThrow(ValidationException);

      expect(mockEntityRepository.findById).toHaveBeenCalledWith('attr-101');
      expect(mockPrismaService.connection.create).not.toHaveBeenCalled();
    });

    it('should create connection without categories and attributes', async () => {
      const dataWithoutOptionals = {
        restaurantId: 'restaurant-123',
        dishOrCategoryId: 'dish-456',
      };

      mockEntityRepository.findById
        .mockResolvedValueOnce(mockRestaurant)
        .mockResolvedValueOnce(mockDish);

      mockPrismaService.connection.create.mockResolvedValue(
        mockCreatedConnection,
      );

      const result =
        await repository.createWithValidation(dataWithoutOptionals);

      expect(result).toEqual(mockCreatedConnection);
      expect(mockEntityRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.connection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          restaurant: {
            connect: { entityId: 'restaurant-123' },
          },
          dish: {
            connect: { entityId: 'dish-456' },
          },
          categories: [],
          dishAttributes: [],
          isMenuItem: true,
        }),
      });
    });
  });

  describe('findByRestaurant', () => {
    it('should find connections by restaurant ID', async () => {
      const mockConnections = [
        { connectionId: 'conn-1', restaurantId: 'restaurant-123' },
        { connectionId: 'conn-2', restaurantId: 'restaurant-123' },
      ];

      mockPrismaService.connection.findMany.mockResolvedValue(mockConnections);

      const result = await repository.findByRestaurant('restaurant-123');

      expect(result).toEqual(mockConnections);
      expect(mockPrismaService.connection.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 'restaurant-123' },
        orderBy: { dishQualityScore: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });
  });

  describe('findByDish', () => {
    it('should find connections by dish ID', async () => {
      const mockConnections = [
        { connectionId: 'conn-1', dishOrCategoryId: 'dish-456' },
        { connectionId: 'conn-2', dishOrCategoryId: 'dish-456' },
      ];

      mockPrismaService.connection.findMany.mockResolvedValue(mockConnections);

      const result = await repository.findByDish('dish-456');

      expect(result).toEqual(mockConnections);
      expect(mockPrismaService.connection.findMany).toHaveBeenCalledWith({
        where: { dishOrCategoryId: 'dish-456' },
        orderBy: { dishQualityScore: 'desc' },
        skip: undefined,
        take: undefined,
        include: undefined,
      });
    });
  });

  describe('updateQualityMetrics', () => {
    it('should update connection quality metrics', async () => {
      const metrics = {
        mentionCount: 10,
        totalUpvotes: 50,
        dishQualityScore: 8.5,
      };

      const updatedConnection = {
        connectionId: 'conn-123',
        ...metrics,
        lastUpdated: expect.any(Date),
      };

      mockPrismaService.connection.update.mockResolvedValue(updatedConnection);

      const result = await repository.updateQualityMetrics('conn-123', metrics);

      expect(result).toEqual(updatedConnection);
      expect(mockPrismaService.connection.update).toHaveBeenCalledWith({
        where: { connectionId: 'conn-123' },
        data: {
          ...metrics,
          lastUpdated: expect.any(Date),
        },
      });
    });
  });
});
