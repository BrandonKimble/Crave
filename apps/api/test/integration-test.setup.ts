import { Test, TestingModule } from '@nestjs/testing';
import { Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { LoggerService } from '../src/shared';
import { DatabaseValidationService } from '../src/config/database-validation.service';
import { EntityRepository } from '../src/repositories/entity.repository';
import { ConnectionRepository } from '../src/repositories/connection.repository';
import { MentionRepository } from '../src/repositories/mention.repository';
import { EntityResolutionService } from '../src/repositories/entity-resolution.service';
import { EntitiesService } from '../src/modules/entities/entities.service';
import { Entity, Connection } from '@prisma/client';
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
      process.env.TEST_DATABASE_URL =
        'postgresql://postgres:postgres@localhost:5432/crave_search_test';
    }

    // Connection pool settings optimized for parallel testing
    process.env.DATABASE_CONNECTION_POOL_MAX =
      process.env.DATABASE_CONNECTION_POOL_MAX || '10';
    process.env.DATABASE_CONNECTION_POOL_MIN =
      process.env.DATABASE_CONNECTION_POOL_MIN || '2';
    process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT =
      process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT || '60000';
    process.env.DATABASE_CONNECTION_IDLE_TIMEOUT =
      process.env.DATABASE_CONNECTION_IDLE_TIMEOUT || '10000';
    process.env.DATABASE_RETRY_ATTEMPTS =
      process.env.DATABASE_RETRY_ATTEMPTS || '3';
    process.env.DATABASE_RETRY_DELAY =
      process.env.DATABASE_RETRY_DELAY || '1000';

    // Redis configuration for testing
    process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

    // API configuration
    process.env.PORT = process.env.PORT || '3001'; // Different port for testing

    // Reddit API test configuration
    process.env.REDDIT_CLIENT_ID =
      process.env.REDDIT_CLIENT_ID || 'test_client_id';
    process.env.REDDIT_CLIENT_SECRET =
      process.env.REDDIT_CLIENT_SECRET || 'test_client_secret';
    process.env.REDDIT_USERNAME =
      process.env.REDDIT_USERNAME || 'test_username';
    process.env.REDDIT_PASSWORD =
      process.env.REDDIT_PASSWORD || 'test_password';
    process.env.REDDIT_USER_AGENT =
      process.env.REDDIT_USER_AGENT || 'CraveSearch/1.0.0-test';

    // LLM configuration for testing
    process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test_llm_key';
    process.env.LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

    // JWT configuration for testing
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test_jwt_secret_key_not_for_production';
    process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || '1h';

    // Disable logging in tests unless explicitly enabled
    if (process.env.DATABASE_LOGGING !== 'true') {
      process.env.DATABASE_LOGGING = 'false';
    }
  }

  /**
   * Validate that database configuration is available and accessible
   */
  private validateDatabaseConfiguration(): void {
    const databaseUrl =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'No database URL found. Please set TEST_DATABASE_URL or DATABASE_URL environment variable.\n' +
          'For testing, you can use: TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search_test"\n' +
          'Make sure PostgreSQL is running and the test database exists.',
      );
    }

    // Parse the database URL to provide helpful error messages
    try {
      const url = new URL(databaseUrl);
      if (!url.hostname || !url.port || !url.pathname) {
        throw new Error('Invalid database URL format');
      }
    } catch {
      throw new Error(
        `Invalid database URL format: ${databaseUrl}\n` +
          'Expected format: postgresql://username:password@host:port/database',
      );
    }
  }

  /**
   * Create a TestingModule for integration tests with real database connections
   */
  async createTestingModule(
    additionalProviders: Provider[] = [],
  ): Promise<TestingModule> {
    // Set test environment variables with comprehensive fallbacks
    process.env.NODE_ENV = 'test';

    // Set all required environment variables with test defaults
    this.setTestEnvironmentDefaults();

    // Validate database configuration
    this.validateDatabaseConfiguration();

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
            database: jest.fn(),
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
   * Execute a function with database cleanup after test
   * This provides test isolation by cleaning up data after each test
   * Uses proper transaction isolation and dependency-aware cleanup
   */
  async withCleanup<T>(fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
    if (!this.prismaService) {
      throw new Error(
        'TestingModule must be created before running with cleanup',
      );
    }

    try {
      return await fn(this.prismaService);
    } finally {
      await this.cleanupTestData();
    }
  }

  /**
   * Clean up test data with proper dependency order and parallel-safe approach
   * Uses individual operations with retries instead of transactions to avoid deadlocks
   */
  private async cleanupTestData(): Promise<void> {
    if (!this.prismaService) {
      return;
    }

    // Use individual operations with retries to avoid deadlocks during parallel execution
    await this.fallbackCleanup();
  }

  /**
   * Robust cleanup method optimized for parallel test execution
   * Uses individual operations with exponential backoff and proper error handling
   */
  private async fallbackCleanup(): Promise<void> {
    if (!this.prismaService) {
      return;
    }

    const maxRetries = 5;
    const baseDelay = 50;
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Get current process and worker ID for debugging
    const workerId = process.env.JEST_WORKER_ID || '0';
    const processId = process.pid;

    // Step 1: Clean up mentions with enhanced retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use more efficient query to find test connections
        const testConnections = await this.prismaService.connection.findMany({
          where: {
            OR: [
              { restaurant: { name: { contains: 'Integration' } } },
              { dish: { name: { contains: 'Integration' } } },
              { restaurant: { name: { contains: 'Test' } } },
              { dish: { name: { contains: 'Test' } } },
              { restaurant: { name: { contains: 'Concurrent' } } },
              { dish: { name: { contains: 'Concurrent' } } },
              { restaurant: { name: { contains: 'Cross-Service' } } },
              { dish: { name: { contains: 'Cross-Service' } } },
              { restaurant: { name: { contains: 'Transactional' } } },
              { dish: { name: { contains: 'Transactional' } } },
              { restaurant: { name: { contains: 'Dual Purpose' } } },
              { dish: { name: { contains: 'Dual Purpose' } } },
            ],
          },
          select: { connectionId: true },
        });

        if (testConnections.length > 0) {
          const connectionIds = testConnections.map((c) => c.connectionId);

          // Delete mentions in smaller batches to reduce lock contention
          const batchSize = 50;
          for (let i = 0; i < connectionIds.length; i += batchSize) {
            const batch = connectionIds.slice(i, i + batchSize);
            await this.prismaService.mention.deleteMany({
              where: {
                connectionId: { in: batch },
              },
            });
          }
        }
        break; // Success, exit retry loop
      } catch (error) {
        if (attempt === maxRetries) {
          console.warn(
            `Worker ${workerId} (PID ${processId}): Failed to cleanup mentions after ${maxRetries} attempts:`,
            error,
          );
        } else {
          // Exponential backoff with jitter to reduce thundering herd
          const jitter = Math.random() * baseDelay;
          const delayTime = baseDelay * Math.pow(2, attempt - 1) + jitter;
          await delay(delayTime);
        }
      }
    }

    // Step 2: Clean up connections with enhanced retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.prismaService.connection.deleteMany({
          where: {
            OR: [
              { restaurant: { name: { contains: 'Integration' } } },
              { dish: { name: { contains: 'Integration' } } },
              { restaurant: { name: { contains: 'Test' } } },
              { dish: { name: { contains: 'Test' } } },
              { restaurant: { name: { contains: 'Concurrent' } } },
              { dish: { name: { contains: 'Concurrent' } } },
              { restaurant: { name: { contains: 'Cross-Service' } } },
              { dish: { name: { contains: 'Cross-Service' } } },
              { restaurant: { name: { contains: 'Transactional' } } },
              { dish: { name: { contains: 'Transactional' } } },
              { restaurant: { name: { contains: 'Dual Purpose' } } },
              { dish: { name: { contains: 'Dual Purpose' } } },
            ],
          },
        });
        break; // Success, exit retry loop
      } catch (error) {
        if (attempt === maxRetries) {
          console.warn(
            `Worker ${workerId} (PID ${processId}): Failed to cleanup connections after ${maxRetries} attempts:`,
            error,
          );
        } else {
          const jitter = Math.random() * baseDelay;
          const delayTime = baseDelay * Math.pow(2, attempt - 1) + jitter;
          await delay(delayTime);
        }
      }
    }

    // Step 3: Clean up entities with enhanced retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.prismaService.entity.deleteMany({
          where: {
            OR: [
              { name: { contains: 'Integration' } },
              { name: { contains: 'Test' } },
              { name: { contains: 'Concurrent' } },
              { name: { contains: 'Duplicate' } },
              { name: { contains: 'Far Away' } },
              { name: { contains: 'Other' } },
              { name: { contains: 'Simple' } },
              { name: { contains: 'Spicy' } },
              { name: { contains: 'Patio' } },
              { name: { contains: 'Vegan' } },
              { name: { contains: 'Updated' } },
              { name: { contains: 'Cross-Service' } },
              { name: { contains: 'Transactional' } },
              { name: { contains: 'Dual Purpose' } },
              { name: { contains: 'Invalid' } },
              { name: { contains: 'Restaurant 1' } },
              { name: { contains: 'Restaurant 2' } },
              { name: { contains: 'Entity To Delete' } },
            ],
          },
        });

        // Also clean up by Google Place IDs and other identifiers
        await this.prismaService.entity.deleteMany({
          where: {
            OR: [
              { googlePlaceId: { contains: 'test-place' } },
              { googlePlaceId: { contains: 'duplicate-google' } },
              { googlePlaceId: { contains: 'unique-place' } },
              { googlePlaceId: { contains: 'far-away' } },
              { googlePlaceId: { contains: 'other-place' } },
              { googlePlaceId: { startsWith: 'test-place-repo-integration' } },
              { googlePlaceId: { startsWith: 'test-place-integration' } },
            ],
          },
        });
        break; // Success, exit retry loop
      } catch (error) {
        if (attempt === maxRetries) {
          console.warn(
            `Worker ${workerId} (PID ${processId}): Failed to cleanup entities after ${maxRetries} attempts:`,
            error,
          );
        } else {
          const jitter = Math.random() * baseDelay;
          const delayTime = baseDelay * Math.pow(2, attempt - 1) + jitter;
          await delay(delayTime);
        }
      }
    }
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
   * Seed test data for integration tests with proper uniqueness for parallel execution
   */
  async seedTestData(prisma: PrismaService): Promise<{
    restaurant: Entity;
    dishOrCategory: Entity;
    dishAttribute: Entity;
    restaurantAttribute: Entity;
  }> {
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 11);
    const processId = process.pid; // Add process ID for multi-worker uniqueness
    const testId = `${timestamp}-${uniqueId}-${processId}`;

    // Create test entities for integration testing with enhanced uniqueness
    const restaurant = await prisma.entity.create({
      data: {
        name: `Test Restaurant Integration ${testId}`,
        type: 'restaurant',
        latitude: 40.7128,
        longitude: -74.006,
        address: `123 Integration Test St ${testId}`,
        googlePlaceId: `test-place-integration-${testId}`,
        restaurantMetadata: {
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        },
      },
    });

    const dishOrCategory = await prisma.entity.create({
      data: {
        name: `Test Pizza Integration ${testId}`,
        type: 'dish_or_category',
      },
    });

    const dishAttribute = await prisma.entity.create({
      data: {
        name: `Spicy Integration ${testId}`,
        type: 'dish_attribute',
      },
    });

    const restaurantAttribute = await prisma.entity.create({
      data: {
        name: `Patio Integration ${testId}`,
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
    dishOrCategoryId: string,
  ): Promise<Connection> {
    return await prisma.connection.create({
      data: {
        restaurant: {
          connect: { entityId: restaurantId },
        },
        dish: {
          connect: { entityId: dishOrCategoryId },
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
