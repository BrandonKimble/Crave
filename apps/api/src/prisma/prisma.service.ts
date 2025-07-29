import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';
import { LoggerService } from '../shared';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger: LoggerService;
  private readonly dbConfig: DatabaseConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private connectionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    totalQueries: 0,
    slowQueries: 0,
    connectionErrors: 0,
    lastHealthCheck: new Date(),
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly validationService: DatabaseValidationService,
    loggerService: LoggerService,
  ) {
    const dbConfig = configService.get<DatabaseConfig>('database');

    super({
      datasources: {
        db: {
          url: dbConfig?.url || process.env.DATABASE_URL || '',
        },
      },
      log: dbConfig?.performance?.logging?.enabled
        ? [
            {
              emit: 'event',
              level: 'query',
            },
            {
              emit: 'event',
              level: 'error',
            },
            {
              emit: 'event',
              level: 'warn',
            },
            {
              emit: 'event',
              level: 'info',
            },
          ]
        : [
            {
              emit: 'event',
              level: 'error',
            },
          ],
    });

    // Initialize logger with context
    this.logger = loggerService.setContext('PrismaService');

    // Validate configuration after super() call
    this.validationService.validateDatabaseConfiguration(configService);
    this.validationService.validateEnvironmentConsistency(configService);

    this.dbConfig = configService.get<DatabaseConfig>('database')!; // Safe after validation
    this.setupEventListeners();
  }

  async onModuleInit() {
    await this.connectWithRetry();
    this.startHealthChecks();
    this.logger.info(
      `Database connection pool initialized with max ${this.dbConfig.connectionPool.max} connections`,
      { maxConnections: this.dbConfig.connectionPool.max },
    );
  }

  async onModuleDestroy() {
    this.stopHealthChecks();
    await this.gracefulDisconnect();
    this.logger.info('Database connections closed gracefully');
  }

  /**
   * Connect to database with retry logic and exponential backoff
   */
  private async connectWithRetry(): Promise<void> {
    const { attempts, delay, factor } = this.dbConfig.query.retry;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.$connect();
        this.connectionMetrics.totalConnections++;
        this.logger.info(
          `Database connected successfully on attempt ${attempt}`,
          {
            attempt,
            totalConnections: this.connectionMetrics.totalConnections,
          },
        );
        return;
      } catch (error) {
        this.connectionMetrics.connectionErrors++;

        if (attempt === attempts) {
          this.logger.error(
            `Failed to connect to database after ${attempts} attempts`,
            error,
          );
          throw error;
        }

        this.logger.warn(
          `Database connection attempt ${attempt} failed, retrying in ${currentDelay}ms...`,
        );
        await this.sleep(currentDelay);
        currentDelay = Math.min(currentDelay * factor, 30000); // Cap at 30 seconds
      }
    }
  }

  /**
   * Graceful disconnect with proper cleanup
   */
  private async gracefulDisconnect(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.error('Error during database disconnect', error);
    }
  }

  /**
   * Setup event listeners for logging and monitoring
   */
  private setupEventListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('query', (event: { duration: number; query: string }) => {
      this.connectionMetrics.totalQueries++;

      if (this.dbConfig.performance.logging.enabled) {
        const duration = Number(event.duration);

        if (duration > this.dbConfig.performance.logging.slowQueryThreshold) {
          this.connectionMetrics.slowQueries++;
          this.logger.warn(
            `Slow query detected: ${duration}ms - ${event.query.slice(
              0,
              100,
            )}...`,
          );
        } else if (process.env.NODE_ENV === 'development') {
          this.logger.debug(
            `Query: ${event.query.slice(0, 100)}... (${duration}ms)`,
          );
        }
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('error', (event: Error) => {
      this.connectionMetrics.connectionErrors++;
      this.logger.error('Database error:', event);
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('warn', (event: { message: string }) => {
      this.logger.warn('Database warning:', { message: event.message });
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('info', (event: { message: string }) => {
      this.logger.info('Database info', { message: event.message });
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (process.env.NODE_ENV !== 'production') {
      return; // Skip health checks in non-production environments
    }

    this.healthCheckInterval = setInterval(() => {
      void (async () => {
        try {
          await this.performHealthCheck();
          this.connectionMetrics.lastHealthCheck = new Date();
        } catch (error) {
          this.logger.error('Health check failed', error);
        }
      })();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Perform database health check
   */
  async performHealthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Get connection pool metrics for monitoring
   */
  getConnectionMetrics() {
    return {
      ...this.connectionMetrics,
      poolConfig: {
        maxConnections: this.dbConfig.connectionPool.max,
        minConnections: this.dbConfig.connectionPool.min,
        acquireTimeout: this.dbConfig.connectionPool.acquire,
        idleTimeout: this.dbConfig.connectionPool.idle,
      },
    };
  }

  /**
   * Utility method for delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
