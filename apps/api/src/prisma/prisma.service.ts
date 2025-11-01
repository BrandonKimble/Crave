import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';
import { LoggerService } from '../shared';
import { MetricsService } from '../modules/metrics/metrics.service';
import { Histogram, Counter, Gauge } from 'prom-client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private logger!: LoggerService;
  private dbConfig!: DatabaseConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private connectionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    totalQueries: 0,
    slowQueries: 0,
    connectionErrors: 0,
    lastHealthCheck: new Date(),
  };
  private readonly queryDurationHistogram: Histogram<string>;
  private readonly queryErrorCounter: Counter<string>;
  private readonly inFlightGauge: Gauge<string>;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly validationService: DatabaseValidationService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly metricsService: MetricsService,
  ) {
    const dbConfig = configService?.get<DatabaseConfig>('database');

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

    this.queryDurationHistogram = this.metricsService.getHistogram({
      name: 'prisma_query_duration_seconds',
      help: 'Duration of Prisma ORM operations in seconds',
      labelNames: ['model', 'action'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    });

    this.queryErrorCounter = this.metricsService.getCounter({
      name: 'prisma_query_errors_total',
      help: 'Total Prisma ORM operations that resulted in an error',
      labelNames: ['model', 'action'],
    });

    this.inFlightGauge = this.metricsService.getGauge({
      name: 'prisma_in_flight_queries',
      help: 'Number of Prisma ORM operations currently executing',
      labelNames: ['model', 'action'],
    });

    this.setupMetricsMiddleware();

    // Configuration and logger initialization moved to onModuleInit
    // this.setupEventListeners(); // Moved to onModuleInit
  }

  async onModuleInit() {
    // Initialize logger and configuration
    this.logger = this.loggerService.setContext('PrismaService');

    // Validate configuration after dependencies are ready
    if (this.validationService) {
      this.validationService.validateDatabaseConfiguration(this.configService);
      this.validationService.validateEnvironmentConsistency(this.configService);
    }

    this.dbConfig =
      this.configService?.get<DatabaseConfig>('database') ||
      ({
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
        performance: {
          logging: { enabled: false, slowQueryThreshold: 1000 },
        },
        connectionPool: { max: 10, min: 2, idle: 10000, acquire: 30000 },
        query: { retry: { attempts: 3, delay: 1000, factor: 2.0 } },
      } as DatabaseConfig); // Safe after validation

    this.setupEventListeners();

    // Connect to database with retry logic
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
    const retryConfig = this.dbConfig?.query?.retry || {
      attempts: 3,
      delay: 1000,
      factor: 2,
    };
    const { attempts, delay, factor } = retryConfig;
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
    (this.$on as any)(
      'error',
      (event: { message: string; target?: string; timestamp?: Date }) => {
        this.connectionMetrics.connectionErrors++;
        if (this.isHandledGooglePlaceConflict(event?.message)) {
          this.logger.warn('Database conflict on google_place_id', {
            message: event.message,
            target: event.target,
          });
        } else {
          this.logger.error('Database error:', event);
        }
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('warn', (event: { message: string }) => {
      this.logger.warn('Database warning:', { message: event.message });
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (this.$on as any)('info', (event: { message: string }) => {
      this.logger.info('Database info', { message: event.message });
    });
  }

  private setupMetricsMiddleware(): void {
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const model = params?.model ?? 'raw';
      const action = params?.action ?? 'unknown';
      const labels = { model, action };
      const start = Date.now();

      this.inFlightGauge.inc(labels, 1);
      try {
        const result = await next(params);
        const durationSeconds = (Date.now() - start) / 1000;
        this.queryDurationHistogram.observe(labels, durationSeconds);
        return result;
      } catch (error) {
        this.queryErrorCounter.inc(labels, 1);
        throw error;
      } finally {
        this.inFlightGauge.dec(labels, 1);
      }
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

  private isHandledGooglePlaceConflict(message?: string): boolean {
    if (!message) {
      return false;
    }
    return (
      message.includes('Unique constraint failed') &&
      message.includes('`google_place_id`')
    );
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
