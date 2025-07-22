import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  OnModuleDestroy as INestOnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, INestOnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
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

    // Validate configuration after super() call
    this.validationService.validateDatabaseConfiguration(configService);
    this.validationService.validateEnvironmentConsistency(configService);

    this.dbConfig = configService.get<DatabaseConfig>('database')!; // Safe after validation
    this.setupEventListeners();
  }

  async onModuleInit() {
    await this.connectWithRetry();
    this.startHealthChecks();
    this.logger.log(
      `Database connection pool initialized with max ${this.dbConfig.connectionPool.max} connections`,
    );
  }

  async onModuleDestroy() {
    this.stopHealthChecks();
    await this.gracefulDisconnect();
    this.logger.log('Database connections closed gracefully');
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
        this.logger.log(
          `Database connected successfully on attempt ${attempt}`,
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
    (this.$on as any)('query', (event: any) => {
      this.connectionMetrics.totalQueries++;

      if (this.dbConfig.performance.logging.enabled) {
        const duration = Number(event.duration);

        if (duration > this.dbConfig.performance.logging.slowQueryThreshold) {
          this.connectionMetrics.slowQueries++;
          this.logger.warn(
            `Slow query detected: ${duration}ms - ${event.query.slice(0, 100)}...`,
          );
        } else if (process.env.NODE_ENV === 'development') {
          this.logger.debug(
            `Query: ${event.query.slice(0, 100)}... (${duration}ms)`,
          );
        }
      }
    });

    (this.$on as any)('error', (event: any) => {
      this.connectionMetrics.connectionErrors++;
      this.logger.error('Database error:', event);
    });

    (this.$on as any)('warn', (event: any) => {
      this.logger.warn('Database warning:', event.message);
    });

    (this.$on as any)('info', (event: any) => {
      this.logger.log('Database info:', event.message);
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (process.env.NODE_ENV !== 'production') {
      return; // Skip health checks in non-production environments
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
        this.connectionMetrics.lastHealthCheck = new Date();
      } catch (error) {
        this.logger.error('Health check failed', error);
      }
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
