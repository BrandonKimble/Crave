import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { BaseRepository } from './base.repository';
import {
  EntityNotFoundException,
  DatabaseOperationException,
  ForeignKeyConstraintException,
  UniqueConstraintException,
} from './repository.exceptions';

// Test implementation of BaseRepository
class TestRepository extends BaseRepository<any, any, any, any> {
  constructor(
    prisma: PrismaService,
    loggerService: LoggerService,
    entityName: string,
  ) {
    super(prisma, loggerService, entityName);
  }

  protected getDelegate() {
    return this.prisma.entity; // Use entity delegate for testing
  }

  protected getPrimaryKeyField(): string {
    return 'entityId';
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;
  let module: TestingModule;

  const mockPrismaService = {
    entity: {
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

  const mockLoggerService = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    database: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: TestRepository,
          useFactory: (prisma: PrismaService, logger: LoggerService) =>
            new TestRepository(prisma, logger, 'TestEntity'),
          inject: [PrismaService, LoggerService],
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    repository = module.get<TestRepository>(TestRepository);
    // prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  describe('create', () => {
    it('should create entity successfully', async () => {
      const mockData = { name: 'Test Entity' };
      const mockResult = { entityId: '123', ...mockData };

      mockPrismaService.entity.create.mockResolvedValue(mockResult);

      const result: unknown = await repository.create(mockData);

      expect(mockPrismaService.entity.create).toHaveBeenCalledWith({
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle create errors', async () => {
      const mockData = { name: 'Test Entity' };
      const mockError = new Error('Database error');

      mockPrismaService.entity.create.mockRejectedValue(mockError);

      await expect(repository.create(mockData)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('findById', () => {
    it('should find entity by ID', async () => {
      const mockId = '123';
      const mockResult = { entityId: mockId, name: 'Test Entity' };

      mockPrismaService.entity.findUnique.mockResolvedValue(mockResult);

      const result: unknown = await repository.findById(mockId);

      expect(mockPrismaService.entity.findUnique).toHaveBeenCalledWith({
        where: { entityId: mockId },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null when entity not found', async () => {
      const mockId = '123';

      mockPrismaService.entity.findUnique.mockResolvedValue(null);

      const result: unknown = await repository.findById(mockId);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update entity successfully', async () => {
      const mockId = '123';
      const mockData = { name: 'Updated Entity' };
      const mockResult = { entityId: mockId, ...mockData };

      mockPrismaService.entity.update.mockResolvedValue(mockResult);

      const result: unknown = await repository.update(mockId, mockData);

      expect(mockPrismaService.entity.update).toHaveBeenCalledWith({
        where: { entityId: mockId },
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw EntityNotFoundException when entity not found', async () => {
      const mockId = '123';
      const mockData = { name: 'Updated Entity' };
      const mockError = { code: 'P2025' };

      mockPrismaService.entity.update.mockRejectedValue(mockError);

      await expect(repository.update(mockId, mockData)).rejects.toThrow(
        EntityNotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete entity successfully', async () => {
      const mockId = '123';
      const mockResult = { entityId: mockId, name: 'Deleted Entity' };

      mockPrismaService.entity.delete.mockResolvedValue(mockResult);

      const result: unknown = await repository.delete(mockId);

      expect(mockPrismaService.entity.delete).toHaveBeenCalledWith({
        where: { entityId: mockId },
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw EntityNotFoundException when entity not found', async () => {
      const mockId = '123';
      const mockError = { code: 'P2025' };

      mockPrismaService.entity.delete.mockRejectedValue(mockError);

      await expect(repository.delete(mockId)).rejects.toThrow(
        EntityNotFoundException,
      );
    });
  });

  describe('count', () => {
    it('should count entities', async () => {
      const mockCount = 42;
      const mockWhere = { type: 'restaurant' };

      mockPrismaService.entity.count.mockResolvedValue(mockCount);

      const result = await repository.count(mockWhere);

      expect(mockPrismaService.entity.count).toHaveBeenCalledWith({
        where: mockWhere,
      });
      expect(result).toBe(mockCount);
    });
  });

  describe('exists', () => {
    it('should return true when entity exists', async () => {
      const mockWhere = { name: 'Test Entity' };

      mockPrismaService.entity.count.mockResolvedValue(1);

      const result = await repository.exists(mockWhere);

      expect(result).toBe(true);
    });

    it('should return false when entity does not exist', async () => {
      const mockWhere = { name: 'Nonexistent Entity' };

      mockPrismaService.entity.count.mockResolvedValue(0);

      const result = await repository.exists(mockWhere);

      expect(result).toBe(false);
    });
  });

  describe('findUnique', () => {
    it('should find unique entity successfully', async () => {
      const mockWhere = { name: 'Test Entity' };
      const mockResult = { entityId: '123', name: 'Test Entity' };

      mockPrismaService.entity.findUnique.mockResolvedValue(mockResult);

      const result: unknown = await repository.findUnique(mockWhere);

      expect(mockPrismaService.entity.findUnique).toHaveBeenCalledWith({
        where: mockWhere,
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null when entity not found', async () => {
      const mockWhere = { name: 'Nonexistent Entity' };

      mockPrismaService.entity.findUnique.mockResolvedValue(null);

      const result: unknown = await repository.findUnique(mockWhere);

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      const mockWhere = { name: 'Test Entity' };
      const mockError = new Error('Database error');

      mockPrismaService.entity.findUnique.mockRejectedValue(mockError);

      await expect(repository.findUnique(mockWhere)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('findFirst', () => {
    it('should find first entity successfully', async () => {
      const mockWhere = { type: 'restaurant' };
      const mockResult = { entityId: '123', name: 'Test Entity' };

      mockPrismaService.entity.findFirst.mockResolvedValue(mockResult);

      const result: unknown = await repository.findFirst(mockWhere);

      expect(mockPrismaService.entity.findFirst).toHaveBeenCalledWith({
        where: mockWhere,
      });
      expect(result).toEqual(mockResult);
    });

    it('should work without where clause', async () => {
      const mockResult = { entityId: '123', name: 'Test Entity' };

      mockPrismaService.entity.findFirst.mockResolvedValue(mockResult);

      const result: unknown = await repository.findFirst();

      expect(mockPrismaService.entity.findFirst).toHaveBeenCalledWith({
        where: undefined,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockError = new Error('Database error');

      mockPrismaService.entity.findFirst.mockRejectedValue(mockError);

      await expect(repository.findFirst()).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('findMany', () => {
    it('should find many entities successfully', async () => {
      const mockParams = {
        where: { type: 'restaurant' },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      };
      const mockResult = [
        { entityId: '123', name: 'Entity 1' },
        { entityId: '456', name: 'Entity 2' },
      ];

      mockPrismaService.entity.findMany.mockResolvedValue(mockResult);

      const result = await repository.findMany(mockParams);

      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith(
        mockParams,
      );
      expect(result).toEqual(mockResult);
    });

    it('should work without parameters', async () => {
      const mockResult = [{ entityId: '123', name: 'Entity 1' }];

      mockPrismaService.entity.findMany.mockResolvedValue(mockResult);

      const result = await repository.findMany();

      expect(mockPrismaService.entity.findMany).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockError = new Error('Database error');

      mockPrismaService.entity.findMany.mockRejectedValue(mockError);

      await expect(repository.findMany()).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('updateMany', () => {
    it('should update many entities successfully', async () => {
      const mockParams = {
        where: { type: 'restaurant' },
        data: { status: 'active' },
      };
      const mockResult = { count: 5 };

      mockPrismaService.entity.updateMany.mockResolvedValue(mockResult);

      const result = await repository.updateMany(mockParams);

      expect(mockPrismaService.entity.updateMany).toHaveBeenCalledWith(
        mockParams,
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockParams = {
        where: { type: 'restaurant' },
        data: { status: 'active' },
      };
      const mockError = new Error('Database error');

      mockPrismaService.entity.updateMany.mockRejectedValue(mockError);

      await expect(repository.updateMany(mockParams)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('deleteMany', () => {
    it('should delete many entities successfully', async () => {
      const mockWhere = { status: 'inactive' };
      const mockResult = { count: 3 };

      mockPrismaService.entity.deleteMany.mockResolvedValue(mockResult);

      const result = await repository.deleteMany(mockWhere);

      expect(mockPrismaService.entity.deleteMany).toHaveBeenCalledWith({
        where: mockWhere,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockWhere = { status: 'inactive' };
      const mockError = new Error('Database error');

      mockPrismaService.entity.deleteMany.mockRejectedValue(mockError);

      await expect(repository.deleteMany(mockWhere)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('createMany', () => {
    it('should create many entities successfully', async () => {
      const mockData = [
        { name: 'Entity 1' },
        { name: 'Entity 2' },
        { name: 'Entity 3' },
      ];
      const mockResult = { count: 3 };

      mockPrismaService.entity.createMany.mockResolvedValue(mockResult);

      const result = await repository.createMany(mockData);

      expect(mockPrismaService.entity.createMany).toHaveBeenCalledWith({
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockData = [{ name: 'Entity 1' }];
      const mockError = new Error('Database error');

      mockPrismaService.entity.createMany.mockRejectedValue(mockError);

      await expect(repository.createMany(mockData)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('upsert', () => {
    it('should upsert entity successfully', async () => {
      const mockParams = {
        where: { name: 'Test Entity' },
        create: { name: 'Test Entity', type: 'restaurant' },
        update: { status: 'active' },
      };
      const mockResult = { entityId: '123', name: 'Test Entity' };

      mockPrismaService.entity.upsert.mockResolvedValue(mockResult);

      const result: unknown = await repository.upsert(mockParams);

      expect(mockPrismaService.entity.upsert).toHaveBeenCalledWith(mockParams);
      expect(result).toEqual(mockResult);
    });

    it('should handle errors', async () => {
      const mockParams = {
        where: { name: 'Test Entity' },
        create: { name: 'Test Entity' },
        update: { status: 'active' },
      };
      const mockError = new Error('Database error');

      mockPrismaService.entity.upsert.mockRejectedValue(mockError);

      await expect(repository.upsert(mockParams)).rejects.toThrow(
        DatabaseOperationException,
      );
    });
  });

  describe('error handling', () => {
    describe('handlePrismaError', () => {
      it('should handle P2002 unique constraint errors', async () => {
        const mockData = { name: 'Duplicate Entity' };
        const mockError = {
          code: 'P2002',
          meta: { target: ['name'] },
        };

        mockPrismaService.entity.create.mockRejectedValue(mockError);

        await expect(repository.create(mockData)).rejects.toThrow(
          UniqueConstraintException,
        );
      });

      it('should handle P2003 foreign key constraint errors', async () => {
        const mockData = { name: 'Test Entity', foreignId: 'invalid' };
        const mockError = {
          code: 'P2003',
          meta: { field_name: 'foreignId' },
        };

        mockPrismaService.entity.create.mockRejectedValue(mockError);

        await expect(repository.create(mockData)).rejects.toThrow(
          ForeignKeyConstraintException,
        );
      });

      it('should handle P2025 record not found errors for update', async () => {
        const mockId = '123';
        const mockData = { name: 'Updated Entity' };
        const mockError = { code: 'P2025' };

        mockPrismaService.entity.update.mockRejectedValue(mockError);

        await expect(repository.update(mockId, mockData)).rejects.toThrow(
          EntityNotFoundException,
        );
      });

      it('should handle P2025 record not found errors for delete', async () => {
        const mockId = '123';
        const mockError = { code: 'P2025' };

        mockPrismaService.entity.delete.mockRejectedValue(mockError);

        await expect(repository.delete(mockId)).rejects.toThrow(
          EntityNotFoundException,
        );
      });

      it('should handle unknown Prisma errors', async () => {
        const mockData = { name: 'Test Entity' };
        const mockError = {
          code: 'P9999',
          message: 'Unknown error',
        };

        mockPrismaService.entity.create.mockRejectedValue(mockError);

        await expect(repository.create(mockData)).rejects.toThrow(
          DatabaseOperationException,
        );
      });

      it('should handle non-Prisma errors', async () => {
        const mockData = { name: 'Test Entity' };
        const mockError = new Error('Generic error');

        mockPrismaService.entity.create.mockRejectedValue(mockError);

        await expect(repository.create(mockData)).rejects.toThrow(
          DatabaseOperationException,
        );
      });
    });

    describe('logging', () => {
      it('should log successful operations', async () => {
        const mockData = { name: 'Test Entity' };
        const mockResult = { entityId: '123', ...mockData };

        mockPrismaService.entity.create.mockResolvedValue(mockResult);

        await repository.create(mockData);

        expect(mockLoggerService.debug).toHaveBeenCalled();
        expect(mockLoggerService.database).toHaveBeenCalledWith(
          'create',
          'TestEntity',
          expect.any(Number),
          true,
          expect.any(Object),
        );
      });

      it('should log failed operations', async () => {
        const mockData = { name: 'Test Entity' };
        const mockError = new Error('Database error');

        mockPrismaService.entity.create.mockRejectedValue(mockError);

        await expect(repository.create(mockData)).rejects.toThrow();

        expect(mockLoggerService.error).toHaveBeenCalled();
        expect(mockLoggerService.database).toHaveBeenCalledWith(
          'create',
          'TestEntity',
          expect.any(Number),
          false,
          expect.any(Object),
        );
      });
    });
  });
});
