import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseRepository } from './base.repository';
import {
  EntityNotFoundException,
  DatabaseOperationException,
} from './repository.exceptions';

// Test implementation of BaseRepository
class TestRepository extends BaseRepository<any, any, any, any> {
  constructor(prisma: PrismaService, entityName: string) {
    super(prisma, entityName);
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
  let prismaService: PrismaService;
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

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: TestRepository,
          useFactory: (prisma: PrismaService) => new TestRepository(prisma, 'TestEntity'),
          inject: [PrismaService],
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<TestRepository>(TestRepository);
    prismaService = module.get<PrismaService>(PrismaService);
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

      const result = await repository.create(mockData);

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

      const result = await repository.findById(mockId);

      expect(mockPrismaService.entity.findUnique).toHaveBeenCalledWith({
        where: { entityId: mockId },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null when entity not found', async () => {
      const mockId = '123';

      mockPrismaService.entity.findUnique.mockResolvedValue(null);

      const result = await repository.findById(mockId);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update entity successfully', async () => {
      const mockId = '123';
      const mockData = { name: 'Updated Entity' };
      const mockResult = { entityId: mockId, ...mockData };

      mockPrismaService.entity.update.mockResolvedValue(mockResult);

      const result = await repository.update(mockId, mockData);

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

      const result = await repository.delete(mockId);

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
});
