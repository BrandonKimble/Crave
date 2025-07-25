import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LoggerService } from '../src/shared';
import { DatabaseValidationService } from '../src/config/database-validation.service';
import { EntityRepository } from '../src/repositories/entity.repository';
import { ConnectionRepository } from '../src/repositories/connection.repository';
import { MentionRepository } from '../src/repositories/mention.repository';
import { EntityResolutionService } from '../src/repositories/entity-resolution.service';
import { EntitiesService } from '../src/modules/entities/entities.service';
import configuration from '../src/config/configuration';

/**
 * Integration Test Database Setup Utility
 *
 * Provides isolated database setup for integration tests with:
 * - Real database connections (not mocked PrismaService)
 * - Transaction-based test isolation
 * - Proper cleanup and resource management
 * - NestJS TestingModule configuration for dependency injection
 */
export class IntegrationTestSetup {
  private module: TestingModule | null = null;
  private prismaService: PrismaService | null = null;

  /**
   * Create a TestingModule for integration tests with real database connections
   */
  async createTestingModule(
    additionalProviders: any[] = [],
  ): Promise<TestingModule> {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL || 
      process.env.DATABASE_URL || 
      'postgresql://postgres:password@localhost:5432/crave_search_test';

    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL or TEST_DATABASE_URL environment variable is required for integration tests',
      );
    }

    // Create testing module with real database configuration
    this.module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
      ],
      providers: [
        PrismaService,
        EntityRepository,
        ConnectionRepository,
        MentionRepository,
        EntityResolutionService,
        EntitiesService,
        DatabaseValidationService,
        ...additionalProviders,
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    // Initialize Prisma service for database operations
    this.prismaService = this.module.get<PrismaService>(PrismaService);

    // Ensure database connection is established
    await this.prismaService.onModuleInit();

    return this.module;
  }

  /**
   * Get the PrismaService instance for direct database operations
   */
  getPrismaService(): PrismaService {
    if (!this.prismaService) {
      throw new Error(
        'TestingModule must be created before accessing PrismaService',
      );
    }
    return this.prismaService;
  }

  /**
   * Execute a function within a database transaction that gets rolled back
   * This provides test isolation by ensuring no data persists between tests
   */
  async withTransaction<T>(
    fn: (prisma: PrismaService) => Promise<T>,
  ): Promise<T> {
    if (!this.prismaService) {
      throw new Error(
        'TestingModule must be created before running transactions',
      );
    }

    return await this.prismaService.$transaction(async (transactionPrisma) => {
      // Cast to PrismaService to maintain type compatibility
      const prismaProxy = transactionPrisma as PrismaService;

      return await fn(prismaProxy);
    });
  }

  /**
   * Clean up test module and close database connections
   */
  async cleanup(): Promise<void> {
    if (this.prismaService) {
      await this.prismaService.onModuleDestroy();
    }

    if (this.module) {
      await this.module.close();
    }

    this.module = null;
    this.prismaService = null;
  }

  /**
   * Seed test data for integration tests
   */
  async seedTestData(prisma: PrismaService): Promise<{
    restaurant: any;
    dishOrCategory: any;
    dishAttribute: any;
    restaurantAttribute: any;
  }> {
    // Create test entities for integration testing
    const restaurant = await prisma.entity.create({
      data: {
        name: 'Test Restaurant Integration',
        type: 'restaurant',
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Integration Test St',
        googlePlaceId: 'test-place-integration',
        restaurantMetadata: {
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        },
      },
    });

    const dishOrCategory = await prisma.entity.create({
      data: {
        name: 'Test Pizza Integration',
        type: 'dish_or_category',
      },
    });

    const dishAttribute = await prisma.entity.create({
      data: {
        name: 'Spicy Integration',
        type: 'dish_attribute',
      },
    });

    const restaurantAttribute = await prisma.entity.create({
      data: {
        name: 'Patio Integration',
        type: 'restaurant_attribute',
      },
    });

    return {
      restaurant,
      dishOrCategory,
      dishAttribute,
      restaurantAttribute,
    };
  }

  /**
   * Create a connection between restaurant and dish for testing
   */
  async createTestConnection(
    prisma: PrismaService,
    restaurantId: string,
    dishId: string,
  ): Promise<any> {
    return await prisma.connection.create({
      data: {
        restaurant: {
          connect: { entityId: restaurantId },
        },
        dish: {
          connect: { entityId: dishId },
        },
        isMenuItem: true,
        mentionCount: 5,
        totalUpvotes: 25,
        sourceDiversity: 3,
        recentMentionCount: 2,
        lastMentionedAt: new Date(),
        activityLevel: 'normal',
        dishQualityScore: 85.5,
      },
    });
  }
}

/**
 * Global test setup utility instance
 */
export const integrationTestSetup = new IntegrationTestSetup();

/**
 * Jest setup helper for integration tests
 */
export const setupIntegrationTest = () => {
  let testSetup: IntegrationTestSetup;

  beforeAll(async () => {
    testSetup = new IntegrationTestSetup();
  });

  afterAll(async () => {
    if (testSetup) {
      await testSetup.cleanup();
    }
  });

  return {
    getSetup: () => testSetup,
  };
};
