import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
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
   * Set comprehensive test environment defaults
   */
  private setTestEnvironmentDefaults(): void {
    // Database configuration with fallbacks
    if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
      process.env.TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/crave_search_test';
    }
    
    // Connection pool settings optimized for testing
    process.env.DATABASE_CONNECTION_POOL_MAX = process.env.DATABASE_CONNECTION_POOL_MAX || '5';
    process.env.DATABASE_CONNECTION_POOL_MIN = process.env.DATABASE_CONNECTION_POOL_MIN || '1';
    process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT = process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT || '30000';
    process.env.DATABASE_CONNECTION_IDLE_TIMEOUT = process.env.DATABASE_CONNECTION_IDLE_TIMEOUT || '5000';
    process.env.DATABASE_RETRY_ATTEMPTS = process.env.DATABASE_RETRY_ATTEMPTS || '2';
    process.env.DATABASE_RETRY_DELAY = process.env.DATABASE_RETRY_DELAY || '500';
    
    // Redis configuration for testing
    process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
    
    // API configuration
    process.env.PORT = process.env.PORT || '3001'; // Different port for testing
    
    // Reddit API test configuration
    process.env.REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || 'test_client_id';
    process.env.REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || 'test_client_secret';
    process.env.REDDIT_USERNAME = process.env.REDDIT_USERNAME || 'test_username';
    process.env.REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || 'test_password';
    process.env.REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'CraveSearch/1.0.0-test';
    
    // LLM configuration for testing
    process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test_llm_key';
    process.env.LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';
    
    // JWT configuration for testing
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_not_for_production';
    process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || '1h';
    
    // Disable logging in tests unless explicitly enabled
    if (process.env.DATABASE_LOGGING !== 'true') {
      process.env.DATABASE_LOGGING = 'false';
    }
  }

  /**
   * Validate that database configuration is available and accessible
   */
  private async validateDatabaseConfiguration(): Promise<void> {
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error(
        'No database URL found. Please set TEST_DATABASE_URL or DATABASE_URL environment variable.\n' +
        'For testing, you can use: TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search_test"\n' +
        'Make sure PostgreSQL is running and the test database exists.'
      );
    }

    // Parse the database URL to provide helpful error messages
    try {
      const url = new URL(databaseUrl);
      if (!url.hostname || !url.port || !url.pathname) {
        throw new Error('Invalid database URL format');
      }
    } catch (error) {
      throw new Error(
        `Invalid database URL format: ${databaseUrl}\n` +
        'Expected format: postgresql://username:password@host:port/database'
      );
    }
  }

  /**
   * Create a TestingModule for integration tests with real database connections
   */
  async createTestingModule(
    additionalProviders: unknown[] = [],
  ): Promise<TestingModule> {
    // Set test environment variables with comprehensive fallbacks
    process.env.NODE_ENV = 'test';
    
    // Set all required environment variables with test defaults
    this.setTestEnvironmentDefaults();

    // Validate database configuration
    await this.validateDatabaseConfiguration();

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
        ...additionalProviders as any[],
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
    await testSetup.createTestingModule();
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
