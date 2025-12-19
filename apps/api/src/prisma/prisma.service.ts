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

    const logConfig: Prisma.LogDefinition[] = dbConfig?.performance?.logging
      ?.enabled
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'info' },
        ]
      : [{ emit: 'event', level: 'error' }];

    super({
      datasources: {
        db: {
          url: dbConfig?.url || process.env.DATABASE_URL || '',
        },
      },
      log: logConfig,
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

    // Configuration and logger initialization moved to onModuleInit
    // this.setupEventListeners(); // Moved to onModuleInit
  }

  async onModuleInit() {
    // Initialize logger and configuration
    this.logger = this.loggerService.setContext('PrismaService');
    this.logPrismaClientMetadata();

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

    // FIXME: Temporarily simplified due to PrismaClient extension binding issues
    // this.setupMetricsMiddleware();
    // this.setupEventListeners();

    // Connect to database directly (retry logic temporarily disabled)
    await this.$connect();

    await this.logTableProbe();

    // this.startHealthChecks();
    this.logger.info('Database connection established');
  }

  async onModuleDestroy() {
    // FIXME: Temporarily simplified due to PrismaClient extension binding issues
    // this.stopHealthChecks();
    await this.$disconnect();
    this.logger.info('Database connections closed gracefully');
  }

  private logPrismaClientMetadata(): void {
    const entityModel = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'Entity',
    );
    this.logger.info('Prisma client metadata', {
      operation: 'prisma_client_metadata',
      entityTable: entityModel?.dbName ?? 'unknown',
      processCwd: process.cwd(),
      nodeVersion: process.version,
    });
  }

  private async logTableProbe(): Promise<void> {
    try {
      const rows = await this.$queryRaw<
        Array<{
          db: string;
          schema: string;
          entities: string | null;
          core_entities: string | null;
        }>
      >`
        SELECT
          current_database() AS db,
          current_schema() AS schema,
          to_regclass('public.entities')::text AS entities,
          to_regclass('public.core_entities')::text AS core_entities
      `;
      const row = rows[0];
      this.logger.info('Database table probe', {
        operation: 'prisma_table_probe',
        db: row?.db,
        schema: row?.schema,
        entities: row?.entities,
        coreEntities: row?.core_entities,
      });
    } catch (error) {
      this.logger.warn('Database table probe failed', {
        operation: 'prisma_table_probe',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
    const subscribe = this.$on.bind(this) as (
      eventType: string,
      callback: (event: Prisma.QueryEvent | Prisma.LogEvent) => void,
    ) => PrismaClient;

    subscribe('query', (event: Prisma.QueryEvent) => {
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

    subscribe('error', (event: Prisma.LogEvent) => {
      this.connectionMetrics.connectionErrors++;
      if (this.isHandledGooglePlaceConflict(event.message)) {
        this.logger.warn('Database conflict on google_place_id', {
          message: event.message,
          target: event.target,
        });
      } else {
        this.logger.error('Database error:', event);
      }
    });

    subscribe('warn', (event: Prisma.LogEvent) => {
      this.logger.warn('Database warning:', { message: event.message });
    });

    subscribe('info', (event: Prisma.LogEvent) => {
      this.logger.info('Database info', { message: event.message });
    });
  }

  private setupMetricsMiddleware(): void {
    const metricsExtension = Prisma.defineExtension({
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            const labels: Record<string, string> = {
              model: typeof model === 'string' ? model : 'raw',
              action: typeof operation === 'string' ? operation : 'unknown',
            };
            const start = Date.now();
            this.inFlightGauge.inc(labels, 1);
            try {
              const result = await query(args);
              const durationSeconds = (Date.now() - start) / 1000;
              this.queryDurationHistogram.observe(labels, durationSeconds);
              return result;
            } catch (error) {
              this.queryErrorCounter.inc(labels, 1);
              throw error;
            } finally {
              this.inFlightGauge.dec(labels, 1);
            }
          },
        },
      },
    });

    const extendedClient = this.$extends(metricsExtension);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.setPrototypeOf(this, Object.getPrototypeOf(extendedClient));
    Object.assign(this, extendedClient);
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
